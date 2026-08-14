# 计划：分类体系灵活化（最多两级，一级 / 二级均可承载标签）

- 日期：2026-08-14
- 状态：已执行（2026-08-14）
- 关联：前期「方案 A」已把三级文本分类拆成 `categories` 树表 + `hobby_tags` 叶子表（FK → level-2 中类）。

> 实际实现说明：为避免破坏既有前端（`category`/`subCategory` 两字段）与接口契约，未删除 `subCategoryName`/`subCategory`，
> 而是保留它们并新增 `categoryLevel` 字段（1/2）以表达灵活性；`subCategorySlug` 请求字段已重命名为 `categorySlug`。
> 迁移 0004 以两条 CHECK 硬性约束 `categories` 最多两级。测试全绿（仅 `locations-match` 2 例为历史既有、与本次无关的失败）。

## 1. 目标与动机

当前 `categories` 虽是两级树（level=1 一级大类 / level=2 二级中类），但应用层**强制**所有标签只能挂在 level-2 节点上：
- `tag-search.ts` 假设 `hobby_tags.category_id` 永远指向 level-2，`sub.parent_id` 是其 level-1 父。
- `categories/route.ts` 只把标签按 level-2 分组，level-1 节点无子节点时就没有标签可显示。
- 建自定义标签 / 后台改类时字段叫 `subCategorySlug`，只能选二级中类。

新需求：**分类更加灵活，categories 可以是一级，也可以是二级，但最多两级。**

即：
1. 在数据库层**硬性约束** `categories` 最多两级（level ∈ {1,2} 且 level 与 parentId 一致性），杜绝深层树。
2. 允许标签直接挂在 **level-1 节点**上（该 level-1 即「叶子分类」，无子节点）。
3. 允许创建「只有一级、直接挂标签」的分类，也允许传统「一级 → 二级 → 标签」结构，二者并存。
4. 所有 API / 前端选择器 / 后台筛选同步支持这两种形态。

## 2. 设计要点

### 2.1 数据模型（不变 + 约束）
- `categories`（自引用树）：保留 `level` / `parentId`。新增两条 `CHECK` 约束：
  - `categories_level_check`：`level IN (1, 2)`
  - `categories_level_parent_check`：`(level=1 AND parent_id IS NULL) OR (level=2 AND parent_id IS NOT NULL)`
  - 现有数据（level-1 的 parentId=null、level-2 的 parentId 指向一级、misc/custom-other 亦符合）天然满足，迁移安全。
- `hobby_tags.category_id`：FK 指向 `categories.id`（任意 level）。**无需改表**——本就允许指向任何分类；约束「最多两级」已由上面的 CHECK 保证（被引用的分类只可能是 level 1/2）。

### 2.2 TagDTO（适配两种形态）
新增 `categoryLevel?: 1 | 2`。字段语义：
- `categoryId`：标签**实际所属**分类节点 id（可能是 level-1 或 level-2）。
- `category`：展示用的一级名称。标签在 level-2 → 取父级(level-1)名；标签在 level-1 → 取该节点自身名。
- `subCategory`：标签在 level-2 → 该 level-2 节点名；标签在 level-1 → `null`。
- `categoryLevel`：1 或 2，便于前端判断渲染。

### 2.3 分类树 API 响应（新增 level-1 直挂标签 + slug）
`/api/hobby-tags/categories`：
- `CategoryNode` 新增 `categoryId`、`slug`、`tags: TagBrief[]`（level-1 直挂标签）。
- `SubCategoryNode` 新增 `slug`。
- 组装逻辑：每个 level-1 节点 → 其 `tags`（按 `category_id=该level-1节点` 取）+ 其 `subCategories`（各取自身 `tags`）。
- 这样「有子类的 level-1」显示「子类 → 标签」，「无子类的 level-1（叶子分类）」直接显示 `tags`，无需多一层展开。

### 2.4 自定义 / 改类接口（slug 可指向一级或二级，并修复已有 bug）
- `POST /api/hobby-tags/custom`、`PATCH /api/admin/hobby-tags/[id]`：
  - 字段 `subCategorySlug` → 重命名为 `categorySlug`，解析 `eq(categories.slug, categorySlug)`，接受 level-1 或 level-2（CHECK 保证只可能是这两级）。
  - 默认兜底仍为 `custom-other`（level-2，属 misc）。
- **顺带修复前端已有 bug**：当前 `TagSelectorPopup.vue` 把 `sub.categoryId`（UUID）当作 `subCategorySlug` 传给后端，而后端按 `slug` 查 → 选了具体分类时实际查不到（400）。修复方案：分类树节点返回 `slug`，前端选项 `value` 改为 `slug`，`createCustomTag(name, categorySlug)` 传 slug。

### 2.5 后台列表筛选（兼容 level-1 直挂标签）
`GET /api/admin/hobby-tags` 的 `category` 过滤当前写死 `parent.name/slug`。改为 `coalesce(parent.name, sub.name)` / `coalesce(parent.slug, sub.slug)`，使筛选「一级大类」时也能命中直接挂在该 level-1 上的标签。

## 3. 改动清单（文件级）

### 3.1 数据库迁移
- 新增 `admin/drizzle/0004_flexible_categories.sql`：
  ```sql
  -- 限制 categories 最多两级,并约束 level 与 parent_id 的一致性
  ALTER TABLE "categories"
    ADD CONSTRAINT "categories_level_check" CHECK ("level" IN (1, 2));

  ALTER TABLE "categories"
    ADD CONSTRAINT "categories_level_parent_check" CHECK (
      ("level" = 1 AND "parent_id" IS NULL) OR
      ("level" = 2 AND "parent_id" IS NOT NULL)
    );
  ```
- 通过 `pnpm db:generate`（或直接手写在 `drizzle/meta/0004_snapshot.json` + 在 `drizzle/meta/_journal.json` 登记 idx=4）。推荐 `pnpm db:generate` 自动生成快照与 journal 条目，再人工核对约束 SQL。
- 执行 `pnpm db:migrate`。
- （可选增强）如需在 DB 层进一步禁止「level-2 节点再有子节点」（即严格深度=2 而非仅 level∈{1,2}），可加触发器 `categories_no_grandchild`；本期不强制，由应用层保证（后台 UI 不会给 level-2 加子节点）。

### 3.2 `admin/db/schema.ts`
- `categories` 表注释更新为「最多两级：level=1 或 level=2；level-1 无父、level-2 有父」；可选补充 `level` 注释。
- `hobbyTags.categoryId` 注释更新：`指向 categories 任意 level(1/2) 节点；level-1 叶子分类可直接承载标签`。
- （约束以迁移 0004 为准，schema 无需新增列；若希望 drizzle 类型更明确，可加 `.$onotNull()` 注释，但非必须。）

### 3.3 `admin/lib/search/tag-search.ts`
- `TagRowWithCategory` 增加 `categoryLevel?: number | null`。
- `selectTagsWithCategory()` 的 `select` 增加 `categoryLevel: sub.level`；`sub`=标签所属分类（任意 level），`parent`=`sub.parent_id` 对应 level-1（可能为 null）。
- `toTagDTO(row)`：
  ```ts
  const isL2 = row.categoryLevel === 2
  category: isL2 ? (row.categoryName ?? "") : (row.subCategoryName ?? "")
  subCategory: isL2 ? (row.subCategoryName ?? null) : null
  categoryLevel: (row.categoryLevel as 1 | 2) ?? 2
  ```
  （`categoryName`=parent.name，`subCategoryName`=sub.name，沿用现有别名。）

### 3.4 `admin/app/api/hobby-tags/categories/route.ts`
- `SubCategoryNode` 增加 `slug`。
- `CategoryNode` 增加 `categoryId: string`、`slug: string`、`tags: TagBrief[]`。
- 读取 `categories` 行时一并 `select` `slug`（已在查）。
- 组装：
  - `topCats` = level=1 节点。
  - 按 `category_id` 分组的标签 `tagsByCat`（key 可为 level-1 或 level-2 id）。
  - 每个 level-1 节点：`tags = tagsByCat.get(top.id) ?? []`，`subCategories = (subByParent.get(top.id) ?? []).map(sub => ({ name, categoryId: sub.id, slug: sub.slug, tags: tagsByCat.get(sub.id) ?? [] }))`。
- 注释 / 响应类型同步更新。

### 3.5 `admin/app/api/hobby-tags/custom/route.ts`
- `DEFAULT_SUB_CATEGORY_SLUG` → 重命名为 `DEFAULT_CATEGORY_SLUG`（值仍为 `"custom-other"`）。
- 请求 schema：`subCategorySlug` → `categorySlug`（z 字段名 + 注释）。
- 解析：`eq(categories.slug, categorySlug)`，命中即可（level 1/2 均可）。
- 注释更新（不再称「二级中类」）。

### 3.6 `admin/app/api/admin/hobby-tags/route.ts`
- 导入 `coalesce`。
- 列表筛选 `category` 条件由 `or(eq(parent.name, category), eq(parent.slug, category))` 改为
  `or(eq(coalesce(parent.name, sub.name), category), eq(coalesce(parent.slug, sub.slug), category))`。
- 计数子查询同步替换。
- 注释更新。

### 3.7 `admin/app/api/admin/hobby-tags/[id]/route.ts`
- `updateTagSchema`：`subCategorySlug` → `categorySlug`；`refine` 文案同步。
- 解析 `eq(categories.slug, categorySlug)`，命中即 `updates.categoryId = sub.id`（任意 level）。
- 日志字段 `subCategorySlug` → `categorySlug`。

### 3.8 `admin/types/api.ts`
- `TagDTO`：增加 `categoryLevel?: 1 | 2`；注释修正（categoryId 可指向 level 1/2）。
- 若分类树类型在此文件定义则同步（当前在 route 内联，见 3.4）。

### 3.9 `admin/db/seed.ts`（可选演示数据）
- 在 `CATEGORY_TREE` 增加一个 level-1「叶子分类」示例，如
  `{ level: 1, slug: "independent", name: "独立兴趣", sortOrder: 90 }`（无 `parentSlug`）。
- 在 `TAG_DEFINITIONS` 增加 1–2 条直挂该 level-1 的标签，如
  `{ name: "城市观鸟", subCategorySlug: "independent" }`（此处 seed 内部字段名 `subCategorySlug` 实际语义是「所属分类 slug」，可顺手重命名为 `categorySlug`）。
- 目的：让分类树 API / 集成测试有真实的 level-1 直挂标签可断言。若不想污染种子数据，可在集成测试中临时构造，不改动 seed。

### 3.10 前端 `frontend_uniapp/src/types/index.ts`
- `TagDTO`：增加 `categoryLevel?: 1 | 2`。
- `CategoryNode`：增加 `categoryId: string`、`slug: string`、`tags: TagBrief[]`。
- `SubCategoryNode`：增加 `slug: string`。

### 3.11 前端 `frontend_uniapp/src/api/tags.ts`
- `createCustomTag(name, subCategorySlug?)` → `createCustomTag(name, categorySlug?)`。
- 请求体字段 `subCategorySlug` → `categorySlug`。
- 注释更新。

### 3.12 前端 `frontend_uniapp/src/components/TagSelectorPopup/TagSelectorPopup.vue`
1. **分类树渲染**：展开 level-1 节点时，先渲染该节点 `tags`（level-1 直挂标签）为可选 chips，再渲染 `subCategories`。`handleToggleTag3` 已是 `(tag: TagBrief)` 通用，无需改签名；`v-for` 增加一段 `node.tags` 循环。
2. **自定义分类下拉**：`customCategoryOptions` 现在同时包含 level-1 节点与 level-2 节点：
   ```ts
   for (const cat of categories.value) {
     opts.push({ label: cat.category, value: cat.slug })        // level-1 可作为直接归属
     for (const sub of cat.subCategories)
       opts.push({ label: `${cat.category} / ${sub.name}`, value: sub.slug })
   }
   ```
   - `value` 由 `categoryId`(UUID) 改为 `slug`（**修复原 bug**：原先把 UUID 当 slug 传，选具体分类会 400）。
3. `handleCategoryConfirm` / `handleSubmitCustom`：`customCategorySlug` 存的是 `slug`；`createCustomTag(name, customCategorySlug.value)` 传 slug；`customCategoryLabel` 仍由 options 反查。
4. 模板中 `customCategoryLabel` 显示逻辑不变。

### 3.13 测试
- `admin/tests/unit/lib/search/tag-search.test.ts`：
  - `toTagDTO` 增加 level-1 用例：mock 行 `{ categoryLevel: 1, subCategoryName: "独立兴趣"(=level1名), categoryName: null }` → 断言 `category === "独立兴趣"`、`subCategory === null`、`categoryLevel === 1`。
  - level-2 用例保持现有断言（category=parent 名、subCategory=sub 名、categoryLevel=2）。
- `admin/tests/integration/api/tags-search.test.ts`：
  - categories 路由：mock 增加「level-1 叶子分类 + 直挂标签」数据集，断言响应 `CategoryNode.tags` 含该标签、`subCategories` 为空。
  - custom 路由：新增用例——传 `categorySlug` 为某 level-1 节点 slug → 断言返回 `categoryLevel=1`、`subCategory=null`、`category=该level-1名`。
  - 所有 `subCategorySlug` 字段名改为 `categorySlug`。
- 运行：`node node_modules/vitest/vitest.mjs run tests/unit/lib/search/tag-search.test.ts tests/integration/api/tags-search.test.ts`（Windows/PowerShell 环境，避免 `npx`/`tail` 不可用问题）。

## 4. 验证

1. `pnpm db:generate` → 核对生成 `0004` 含两条 CHECK。
2. `pnpm db:migrate` → 成功应用；`_diag` 抽查 `categories` 仍 27+ 行、CHECK 存在。
3. `pnpm db:seed`（若改了 seed）→ 验证 level-1 叶子分类与直挂标签写入。
4. 单测 + 集成测全绿。
5. admin / frontend 启动联调：兴趣选择页能展开 level-1 直挂标签；自定义标签选 level-1 或 level-2 均成功；后台按一级大类筛选能命中直挂标签。

## 5. 风险与回滚

- 迁移 0004 仅加 CHECK，不删列/不迁移数据，回滚即 `ALTER TABLE categories DROP CONSTRAINT ...`（写个 `0005` 反向迁移或手动 drop）。
- 接口字段 `subCategorySlug → categorySlug` 属破坏性改名，但仅本项目前后端共用，一并升级即可；若担心外部调用方，可短期在路由里兼容读 `subCategorySlug`。本期按「同步改名」处理。
- 现有数据全在 level-2，行为不变；新能力为增量支持，无数据回退风险。

## 6. 不在本期范围

- 后台可视化「分类管理」UI（新增 level-1 叶子分类、拖拽排序等）——仅 schema/约束就绪，UI 留待后续。
- 严格禁止「level-2 再有子节点」的 DB 层触发器（应用层保证即可）。
