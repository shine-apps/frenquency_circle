# 后台分类与标签管理重构 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让管理员能在后台界面完整管理「兴趣分类」(当前分类树只能靠 seed/migration SQL 维护) 与「兴趣标签」(当前后台仅能审核通过/拒绝，无法增改删、无法按分类筛选、无分页)。

**Architecture:** 新增一组 `api/admin/categories` 的 CRUD 接口 + 共享 helper `lib/categories.ts`；扩展已有的 `api/admin/hobby-tags` 支持标签的增/改/删与筛选/分页。**分类管理与标签管理合并到同一个后台页面 `admin/taxonomy`（「兴趣分类与标签」），采用主从双栏布局**：左栏为分类树（大类/中类的新建、编辑、删除、挂子类），右栏为标签面板——选中左栏某分类后展示其下标签，支持关键词/状态筛选、分页、新建/编辑/删除标签。分类树组装逻辑抽取为共享 helper `lib/categories.ts`，供公开接口、后台接口与页面复用（DRY）。数据模型维持现有两级分类（level 1 大类 → level 2 中类），slug 为稳定键。

**Tech Stack:** Next.js (App Router, Route Handlers) + Drizzle ORM (PostgreSQL) + zod 校验 + shadcn/ui 组件 + lucide 图标。鉴权复用 `requireAdmin()` (`lib/auth-utils.ts`)，响应统一用 `ok/fail` (`lib/api.ts`)。

**重要约束（来自 schema）:**
- `categories`: `slug` 唯一；`level` 仅 1/2；`parentId` 自引用 `onDelete: cascade`；一级大类 `parentId IS NULL`。
- `hobby_tags.categoryId` 对 `categories` 为 `onDelete: restrict` → **不能直接删除含标签的分类**，必须先改派或拒绝。
- 现有 `seed.ts` 全量重建会 `DELETE` 全部 categories/tags；后台新增的分类在下次跑 seed 时会被清空（本计划不处理，仅在此标注：若需后台分类持久化，后续应把分类种子从 seed 移除或改为 upsert）。

**测试说明:** 本仓库无单测框架。每个任务的「验证」= `pnpm exec tsc --noEmit`(类型零错误) + 对 `pnpm dev`(:3000) 起的服务做 `curl` 冒烟测试。

---

## 阶段 A：分类数据层与 API

### Task 1: 新增分类相关类型与 slug 工具

**Files:**
- Modify: `admin/types/api.ts` (追加 `CategoryDTO` / `CategoryNode`)
- Create: `admin/lib/categories.ts` (分类树组装 + slug 生成)

**Step 1: 在 `types/api.ts` 末尾追加类型**

```ts
/** 兴趣分类节点(两级:一级大类 → 二级中类) */
export type CategoryDTO = {
  id: string
  name: string
  slug: string
  level: 1 | 2
  parentId: string | null
  sortOrder: number
}

/** 分类树节点(用于树形展示) */
export type CategoryNode = {
  id: string
  name: string
  slug: string
  sortOrder: number
  children: CategoryNode[]
}
```

**Step 2: 创建 `admin/lib/categories.ts`**

```ts
import { asc } from "drizzle-orm"
import { db } from "@/lib/db"
import { categories } from "@/db/schema"
import { toPinyin } from "@/lib/search/pinyin"
import type { CategoryNode } from "@/types/api"

/**
 * 由中文名生成稳定 slug(拼音 + 连字符)。
 * 调用方需保证唯一性(见 ensureUniqueSlug)。
 */
export function slugifyCategory(name: string): string {
  const py = toPinyin(name).trim().toLowerCase()
  const base = (py || name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  return base || `cat-${Date.now().toString(36)}`
}

/** 在已有 slug 集合中保证唯一,冲突则追加 -2 / -3 ... */
export function ensureUniqueSlug(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

/** 读取完整分类树(一级大类 + 其下二级中类,均按 sortOrder 升序) */
export async function buildCategoryTree(): Promise<CategoryNode[]> {
  const rows = await db
    .select({
      id: categories.id,
      name: categories.name,
      slug: categories.slug,
      level: categories.level,
      parentId: categories.parentId,
      sortOrder: categories.sortOrder,
    })
    .from(categories)
    .orderBy(asc(categories.sortOrder))

  const tops = rows
    .filter((r) => r.level === 1)
    .sort((a, b) => a.sortOrder - b.sortOrder)
  const byParent = new Map<string, typeof rows>()
  for (const r of rows) {
    if (r.level !== 2 || !r.parentId) continue
    if (!byParent.has(r.parentId)) byParent.set(r.parentId, [])
    byParent.get(r.parentId)!.push(r)
  }
  return tops.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    sortOrder: t.sortOrder,
    children: (byParent.get(t.id) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        sortOrder: c.sortOrder,
        children: [],
      })),
  }))
}
```

**Step 3: 验证类型**

Run: `cd admin && pnpm exec tsc --noEmit`
Expected: 无类型错误（此时 helper 尚未被调用，仅类型检查）。

**Step 4: Commit**

```bash
git add admin/types/api.ts admin/lib/categories.ts
git commit -m "feat(admin): add category DTO types and tree/slug helpers"
```

---

### Task 2: GET /api/admin/categories（分类树读取）

**Files:**
- Create: `admin/app/api/admin/categories/route.ts`

**Step 1: 创建路由，返回分类树**

```ts
import { db } from "@/lib/db"
import { categories } from "@/db/schema"
import { ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { buildCategoryTree } from "@/lib/categories"
import type { CategoryDTO } from "@/types/api"

export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const tree = await buildCategoryTree()
  // 同时展平为列表,便于前端下拉选择父级
  const flat: CategoryDTO[] = []
  for (const t of tree) {
    flat.push({ id: t.id, name: t.name, slug: t.slug, level: 1, parentId: null, sortOrder: t.sortOrder })
    for (const c of t.children) {
      flat.push({ id: c.id, name: c.name, slug: c.slug, level: 2, parentId: t.id, sortOrder: c.sortOrder })
    }
  }
  return ok({ tree, flat })
}
```

**Step 2: 验证**

Run: `cd admin && pnpm exec tsc --noEmit`
Expected: 无类型错误。

Run (dev 起服务后):
```bash
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/categories | head -c 400
```
Expected: 返回含 `visual-arts`/`crafts` 等一级大类的 `tree` 与 `flat`。

**Step 3: Commit**

```bash
git add admin/app/api/admin/categories/route.ts
git commit -m "feat(admin): GET /api/admin/categories returns category tree"
```

---

### Task 3: POST /api/admin/categories（新建分类）

**Files:**
- Modify: `admin/app/api/admin/categories/route.ts` (追加 POST)

**Step 1: 追加 POST 处理函数（放在 GET 之后）**

```ts
import { z } from "zod"
import { eq } from "drizzle-orm"
// (已有 import ...)
const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(30),
  parentId: z.string().trim().min(1).max(64).optional(), // 提供则为二级中类,否则一级大类
  slug: z.string().trim().min(1).max(64).optional(),     // 可选,不传则自动生成
  sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
})

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const body = await req.json().catch(() => null)
  const parsed = createCategorySchema.safeParse(body)
  if (!parsed.success) return fail(400, "Invalid request body", parsed.error.flatten())

  const { name, parentId, slug, sortOrder } = parsed.data

  // 校验父级:若存在必须是 level=1 且存在
  let level: 1 | 2 = 1
  let parentLevel1Id: string | null = null
  if (parentId) {
    const parent = await db.query.categories.findFirst({ where: eq(categories.id, parentId) })
    if (!parent) return fail(400, "父分类不存在")
    if (parent.level !== 1) return fail(400, "二级中类不能再嵌套子分类")
    level = 2
    parentLevel1Id = parent.id
  }

  // slug 唯一性
  const existing = await db.select({ slug: categories.slug }).from(categories)
  const taken = new Set(existing.map((e) => e.slug))
  const finalSlug = ensureUniqueSlug(slug?.trim() || slugifyCategory(name), taken)

  const [created] = await db
    .insert(categories)
    .values({
      name,
      slug: finalSlug,
      level,
      parentId: parentLevel1Id,
      sortOrder: sortOrder ?? (existing.length + 1),
    })
    .returning()

  return ok(created, { status: 201 })
}
```

**Step 2: 验证**

Run: `cd admin && pnpm exec tsc --noEmit`
Expected: 无类型错误。

Run:
```bash
# 新建一级大类
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"测试大类"}' http://localhost:3000/api/admin/categories
# 在其下新建二级中类
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"测试子类\",\"parentId\":\"<上一步返回的id>\"}" http://localhost:3000/api/admin/categories
```
Expected: 第一次返回 slug 形如 `ce-shi-da-lei`；第二次 level=2 且 parentId 正确。

**Step 3: Commit**

```bash
git add admin/app/api/admin/categories/route.ts
git commit -m "feat(admin): POST /api/admin/categories create top/sub category"
```

---

### Task 4: PATCH /api/admin/categories/[id]（改名 / 排序 / 移动）

**Files:**
- Create: `admin/app/api/admin/categories/[id]/route.ts`

**Step 1: 创建路由**

```ts
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { categories } from "@/db/schema"
import { fail, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { slugifyCategory, ensureUniqueSlug } from "@/lib/categories"

type RouteContext = { params: Promise<{ id: string }> }

const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(30).optional(),
    sortOrder: z.coerce.number().int().min(0).max(9999).optional(),
    parentId: z.string().trim().min(1).max(64).nullable().optional(), // null=变回一级大类
  })
  .refine((d) => d.name !== undefined || d.sortOrder !== undefined || d.parentId !== undefined, {
    message: "至少提供一个待更新字段",
  })

export async function PATCH(req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await context.params

  const body = await req.json().catch(() => null)
  const parsed = updateCategorySchema.safeParse(body)
  if (!parsed.success) return fail(400, "Invalid request body", parsed.error.flatten())

  const current = await db.query.categories.findFirst({ where: eq(categories.id, id) })
  if (!current) return fail(404, "分类不存在")

  const updates: Partial<typeof categories.$inferInsert> = { updatedAt: new Date() }
  if (parsed.data.name !== undefined) {
    updates.name = parsed.data.name
    // 改名同步重算 slug(保持唯一)
    const taken = new Set(
      (await db.select({ slug: categories.slug }).from(categories)).map((e) => e.slug)
    )
    updates.slug = ensureUniqueSlug(slugifyCategory(parsed.data.name), taken)
  }
  if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder

  if (parsed.data.parentId !== undefined) {
    if (parsed.data.parentId === null) {
      // 变回一级大类:仅当当前无子分类
      const kids = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, id))
      if (kids.length > 0) return fail(409, "该分类下还有子分类,无法变为一级大类")
      updates.level = 1
      updates.parentId = null
    } else {
      const parent = await db.query.categories.findFirst({ where: eq(categories.id, parsed.data.parentId) })
      if (!parent) return fail(400, "父分类不存在")
      if (parent.level !== 1) return fail(400, "只能挂到一级大类下")
      if (parent.id === id) return fail(400, "不能挂到自己下")
      updates.level = 2
      updates.parentId = parent.id
    }
  }

  const [updated] = await db.update(categories).set(updates).where(eq(categories.id, id)).returning()
  return ok(updated)
}
```

**Step 2: 验证**

Run: `cd admin && pnpm exec tsc --noEmit`
Expected: 无类型错误。

Run:
```bash
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"改名大类","sortOrder":1}' http://localhost:3000/api/admin/categories/<id>
```
Expected: 返回 `name="改名大类"`、`slug` 已更新、`updatedAt` 变化。

**Step 3: Commit**

```bash
git add admin/app/api/admin/categories/[id]/route.ts
git commit -m "feat(admin): PATCH /api/admin/categories/[id] rename/reorder/move"
```

---

### Task 5: DELETE /api/admin/categories/[id]（删除含守卫）

**Files:**
- Modify: `admin/app/api/admin/categories/[id]/route.ts` (追加 DELETE)

**Step 1: 在文件末尾追加**

```ts
export async function DELETE(_req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await context.params

  const current = await db.query.categories.findFirst({ where: eq(categories.id, id) })
  if (!current) return fail(404, "分类不存在")

  // 守卫 1:有子分类 → 拒绝
  const kids = await db.select({ id: categories.id }).from(categories).where(eq(categories.parentId, id))
  if (kids.length > 0) return fail(409, "请先删除该分类下的子分类")

  // 守卫 2:有标签关联(restrict)→ 拒绝,提示先改派
  const tagged = await db.select({ id: hobbyTags.id }).from(hobbyTags).where(eq(hobbyTags.categoryId, id)).limit(1)
  if (tagged.length > 0) return fail(409, "该分类下仍有标签,请先在标签管理中改派后再删除")

  await db.delete(categories).where(eq(categories.id, id))
  return ok({ id })
}
```

注意顶部 import 需补 `hobbyTags`：`import { categories, hobbyTags } from "@/db/schema"`。

**Step 2: 验证**

Run: `cd admin && pnpm exec tsc --noEmit`
Expected: 无类型错误。

Run:
```bash
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/categories/<id>
```
Expected: 删除成功返回 `{id}`；若分类含标签则返回 409 及提示文案。

**Step 3: Commit**

```bash
git add admin/app/api/admin/categories/[id]/route.ts
git commit -m "feat(admin): DELETE /api/admin/categories/[id] with guards"
```

---

### Task 6: 公开分类接口复用 helper（DRY）

**Files:**
- Modify: `admin/app/api/hobby-tags/categories/route.ts` (用 `buildCategoryTree` 替换内联逻辑)

**Step 1: 用 helper 替换第 52–133 行的内联组装**

把 `GET` 中从 `const catRows = ...` 到 `return withCors(ok(...))` 整段替换为：

```ts
export async function GET(req: Request) {
  const tree = await buildCategoryTree()

  // 2. 读取 approved 叶子标签,按 categoryId 分组
  const tagRows = await db
    .select({
      id: hobbyTags.id,
      name: hobbyTags.name,
      categoryId: hobbyTags.categoryId,
      pinyin: hobbyTags.pinyin,
      pinyinInitials: hobbyTags.pinyinInitials,
    })
    .from(hobbyTags)
    .where(eq(hobbyTags.status, "approved"))

  const tagsBySub = new Map<string, TagBrief[]>()
  for (const t of tagRows) {
    if (!t.categoryId) continue
    if (!tagsBySub.has(t.categoryId)) tagsBySub.set(t.categoryId, [])
    tagsBySub.get(t.categoryId)!.push({
      id: t.id,
      name: t.name,
      pinyin: t.pinyin,
      pinyinInitials: t.pinyinInitials,
    })
  }
  for (const arr of tagsBySub.values()) {
    arr.sort((a, b) => a.name.localeCompare(b, "zh-Hans-CN"))
  }

  // 3. 组装 CategoryNode(一级大类同名直挂节点逻辑保持不变)
  const categoriesNode: CategoryNode[] = tree.map((top) => {
    const subNodes: SubCategoryNode[] = top.children.map((sub) => ({
      name: sub.name,
      categoryId: sub.id,
      slug: sub.slug,
      tags: tagsBySub.get(sub.id) ?? [],
    }))
    const directTags = tagsBySub.get(top.id) ?? []
    if (directTags.length > 0) {
      subNodes.push({ name: top.name, categoryId: top.id, slug: top.slug, tags: directTags })
    }
    return { category: top.name, categoryId: top.id, subCategories: subNodes }
  })

  return withCors(ok({ categories: categoriesNode }), req)
}
```

顶部 import 增加：`import { buildCategoryTree } from "@/lib/categories"`（移除不再使用的 `and, asc, eq` 中未用的项，保留 `eq` 用于标签查询）。

**Step 2: 验证**

Run: `cd admin && pnpm exec tsc --noEmit`
Expected: 无类型错误；原有 GET 行为不变。

Run: `curl -s http://localhost:3000/api/hobby-tags/categories | head -c 300`
Expected: 与重构前结构一致（CategoryNode[]）。

**Step 3: Commit**

```bash
git add admin/app/api/hobby-tags/categories/route.ts
git commit -m "refactor: reuse buildCategoryTree in public categories API"
```

---

## 阶段 B：合并页面 UI（分类树 + 标签面板 双栏）

### Task 7: 新增侧边栏导航 + 合并页面骨架

**Files:**
- Modify: `admin/components/app-sidebar.tsx` (navItems 增加「分类与标签」)
- Create: `admin/app/admin/taxonomy/page.tsx`
- Create: `admin/app/admin/taxonomy/_components/taxonomy-manager.tsx`

**Step 1: 侧边栏追加一项**

在 `navItems` 数组中、`标签管理` 之后插入（替换原有分开的两条，合并为入口；若该导航里已有「标签管理」则一并改为此项）：
```ts
{ href: "/admin/taxonomy", label: "分类与标签", icon: FolderTreeIcon },
```
(新增 `FolderTreeIcon`，或复用 `TagIcon`。)

**Step 2: 创建页面（server component 取全量树传给 client 双栏容器）**

```tsx
import { buildCategoryTree } from "@/lib/categories"
import { TaxonomyManager } from "./_components/taxonomy-manager"

export const dynamic = "force-dynamic"

export default async function AdminTaxonomyPage() {
  const tree = await buildCategoryTree()
  return (
    <main className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">兴趣分类与标签</h1>
        <p className="text-sm text-muted-foreground">左侧管理分类（大类/中类），选中分类后右侧管理其下标签。</p>
      </div>
      <TaxonomyManager initialTree={tree} />
    </main>
  )
}
```

**Step 3: 验证**

Run: `cd admin && pnpm exec tsc --noEmit`
Expected: 无类型错误（此时 `TaxonomyManager` 尚未创建，会报缺失模块——下个任务补）。

**Step 4: Commit**

```bash
git add admin/components/app-sidebar.tsx admin/app/admin/taxonomy/page.tsx
git commit -m "feat(admin): add taxonomy nav + combined page scaffold"
```

---

### Task 8: TaxonomyManager 双栏容器（分类树 + 选中联动）

**Files:**
- Create: `admin/app/admin/taxonomy/_components/taxonomy-manager.tsx`

**Step 1: 创建容器组件（左栏分类树，右栏标签面板；维护「当前选中分类」状态）**

布局要点：
- 左栏（`CategoryTree`）：渲染分类树，提供新建/编辑/删除/挂子类入口；点击某节点 → 设为 `selectedCategory`（右栏筛选依据）。同时本地维护 `tree` 状态，删除/新增后即时更新。
- 右栏（`TagPanel`）：接收 `selectedCategory`（可为一级大类或二级中类，含其 slug/name/id）与 `flat` 列表，展示该分类下标签，提供关键词/状态筛选、分页、新建/编辑/删除。
- 顶层持有 `CategoryDialog` 与 `TagDialog` 的开闭状态。

```tsx
"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import type { CategoryNode } from "@/types/api"
import { CategoryTree } from "./category-tree"
import { TagPanel } from "./tag-panel"
import { CategoryDialog } from "./category-dialog"
import { TagDialog } from "./tag-dialog"

export type SelectedCategory = {
  id: string
  name: string
  slug: string
  level: 1 | 2
  parentId: string | null
}

export function TaxonomyManager({ initialTree }: { initialTree: CategoryNode[] }) {
  const router = useRouter()
  const [tree, setTree] = useState(initialTree)
  const [selected, setSelected] = useState<SelectedCategory | null>(null)
  const [catDialog, setCatDialog] = useState<{ open: boolean; parentId?: string | null; node?: CategoryNode } | null>(null)
  const [tagDialog, setTagDialog] = useState<{ open: boolean; tag?: TagDTO } | null>(null)

  // flat 列表(一级+二级)供 TagDialog 的「所属分类」下拉
  const flat: CategoryDTO[] = []
  for (const t of tree) {
    flat.push({ id: t.id, name: t.name, slug: t.slug, level: 1, parentId: null, sortOrder: t.sortOrder })
    for (const c of t.children) flat.push({ id: c.id, name: c.name, slug: c.slug, level: 2, parentId: t.id, sortOrder: c.sortOrder })
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <section>
        <CategoryTree
          tree={tree}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          onEdit={(node, parentId) => setCatDialog({ open: true, node, parentId })}
          onAdd={(parentId) => setCatDialog({ open: true, parentId })}
          onDeleted={(id) => {
            setTree((t) => t.filter((n) => n.id !== id).map((n) => ({ ...n, children: n.children.filter((c) => c.id !== id) })))
            if (selected?.id === id) setSelected(null)
          }}
        />
      </section>
      <section>
        <TagPanel
          selected={selected}
          flat={flat}
          onAddTag={() => setTagDialog({ open: true })}
          onEditTag={(tag) => setTagDialog({ open: true, tag })}
        />
      </section>

      {catDialog?.open ? (
        <CategoryDialog node={catDialog.node} parentId={catDialog.parentId ?? null} flatTops={tree}
          onClose={() => setCatDialog(null)} onSaved={() => { setCatDialog(null); router.refresh() }} />
      ) : null}
      {tagDialog?.open ? (
        <TagDialog tag={tagDialog.tag} categories={flat}
          onClose={() => setTagDialog(null)} onSaved={() => { setTagDialog(null); router.refresh() }} />
      ) : null}
    </div>
  )
}
```
(组件路径下移到 `_components/category-tree.tsx` 与 `_components/tag-panel.tsx`。)

**Step 2: 验证**

Run: `cd admin && pnpm exec tsc --noEmit`
Expected: 无类型错误（依赖的 `CategoryTree`/`TagPanel`/`TagDTO` 下几个任务补，本步先做类型拦截）。

**Step 3: Commit**

> 因依赖子组件，建议与 Task 9、12、13 一并提交；本步仅用于类型检查拦截。

---

### Task 9: CategoryTree（左栏树渲染） + CategoryDialog（新建/编辑表单）

**Files:**
- Create: `admin/app/admin/taxonomy/_components/category-tree.tsx`
- Create: `admin/app/admin/taxonomy/_components/category-dialog.tsx`

**Step 1: 创建左栏 `CategoryTree` 组件（树渲染 + 选中 + 增删改入口）**

```tsx
"use client"
import { PlusIcon, PencilIcon, TrashIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { CategoryNode } from "@/types/api"

export function CategoryTree({
  tree, selectedId, onSelect, onEdit, onAdd, onDeleted,
}: {
  tree: CategoryNode[]
  selectedId: string | null
  onSelect: (c: { id: string; name: string; slug: string; level: 1 | 2; parentId: string | null }) => void
  onEdit: (node: CategoryNode, parentId: string | null) => void
  onAdd: (parentId: string | null) => void
  onDeleted: (id: string) => void
}) {
  async function handleDelete(node: CategoryNode) {
    if (!confirm(`确认删除「${node.name}」?`)) return
    const res = await fetch(`/api/admin/categories/${node.id}`, { method: "DELETE" })
    const data = await res.json()
    if (res.ok) onDeleted(node.id)
    else alert(data.message || "删除失败")
  }
  return (
    <div className="space-y-3">
      <Button onClick={() => onAdd(null)}><PlusIcon /> 新建一级大类</Button>
      {tree.map((top) => (
        <Card key={top.id} className={`p-4 ${selectedId === top.id ? "ring-2 ring-primary" : ""}`}>
          <div className="mb-2 flex items-center justify-between">
            <button className="text-left" onClick={() => onSelect({ id: top.id, name: top.name, slug: top.slug, level: 1, parentId: null })}>
              <span className="font-semibold">{top.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">{top.slug}</span>
            </button>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon-sm" onClick={() => onEdit(top, null)}><PencilIcon /></Button>
              <Button variant="ghost" size="icon-sm" onClick={() => onAdd(top.id)}><PlusIcon /></Button>
              <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(top)}><TrashIcon /></Button>
            </div>
          </div>
          <div className="ml-4 space-y-1 border-l pl-4">
            {top.children.map((sub) => (
              <div key={sub.id} className={`flex items-center justify-between py-1 ${selectedId === sub.id ? "rounded bg-primary/10" : ""}`}>
                <button className="text-left" onClick={() => onSelect({ id: sub.id, name: sub.name, slug: sub.slug, level: 2, parentId: top.id })}>
                  <span>{sub.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{sub.slug}</span>
                </button>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon-sm" onClick={() => onEdit(sub, top.id)}><PencilIcon /></Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => handleDelete(sub)}><TrashIcon /></Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  )
}
```

**Step 2: 创建 `CategoryDialog`（新建/编辑表单）**

```tsx
"use client"
import { useState } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import type { CategoryNode } from "@/types/api"

export function CategoryDialog({
  node, parentId, flatTops, onClose, onSaved,
}: {
  node?: CategoryNode
  parentId: string | null
  flatTops: CategoryNode[]
  onClose: () => void
  onSaved: (saved: unknown) => void
}) {
  const isEdit = !!node
  const [name, setName] = useState(node?.name ?? "")
  const [parent, setParent] = useState<string | null>(parentId)
  const [sortOrder, setSortOrder] = useState<string>(String(node?.sortOrder ?? 0))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true); setErr(null)
    const body: Record<string, unknown> = { name }
    if (!isEdit) {
      if (parent) body.parentId = parent
      body.sortOrder = Number(sortOrder) || 0
    } else {
      // 编辑:允许改 parentId(变一级/挂到其它一级)
      body.parentId = parent ?? null
      body.sortOrder = Number(sortOrder) || 0
    }
    const url = isEdit ? `/api/admin/categories/${node!.id}` : "/api/admin/categories"
    const method = isEdit ? "PATCH" : "POST"
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setBusy(false)
    if (res.ok) onSaved(data.data)
    else setErr(data.message || "保存失败")
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "编辑分类" : "新建分类"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如 视觉艺术" />
          </div>
          <div>
            <Label>父级(留空=一级大类)</Label>
            <select
              className="w-full rounded border px-2 py-1"
              value={parent ?? ""}
              onChange={(e) => setParent(e.target.value || null)}
            >
              <option value="">（无，作为一级大类）</option>
              {flatTops
                .filter((t) => !node || t.id !== node.id) // 不能挂到自己
                .map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
            </select>
          </div>
          <div>
            <Label>排序(sortOrder)</Label>
            <Input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
          </div>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={save} disabled={busy || !name.trim()}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: 验证**

Run: `cd admin && pnpm exec tsc --noEmit`
Expected: 无类型错误。

Run: 浏览器打开 `http://localhost:3000/admin/taxonomy`，左栏点「新建一级大类」→ 填名 → 保存；再展开后点「+」建子类；点某节点使其高亮（联动右栏）。
Expected: 树实时刷新（router.refresh）；新建/编辑/删除均生效；选中分类后右栏展示其下标签。

**Step 3: Commit**

```bash
git add admin/app/admin/taxonomy/_components/category-tree.tsx admin/app/admin/taxonomy/_components/category-dialog.tsx
git commit -m "feat(admin): category tree UI with create/edit/delete"
```

---

## 阶段 C：标签管理增强

### Task 10: POST /api/admin/hobby-tags（后台新建标签）

**Files:**
- Modify: `admin/app/api/admin/hobby-tags/route.ts` (追加 POST；保留现有 GET)

**Step 1: 在 GET 之后追加 POST**

```ts
import { z } from "zod"
// (已有 import: db, hobbyTags, categories, fail, ok, requireAdmin, toPinyin, toPinyinInitials)
const createTagSchema = z.object({
  name: z.string().trim().min(1).max(30),
  categorySlug: z.string().trim().min(1).max(64),
  status: z.enum(["pending", "approved", "rejected"]).default("approved"),
})

export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const body = await req.json().catch(() => null)
  const parsed = createTagSchema.safeParse(body)
  if (!parsed.success) return fail(400, "Invalid request body", parsed.error.flatten())

  const { name, categorySlug, status } = parsed.data
  const cat = await db.query.categories.findFirst({ where: eq(categories.slug, categorySlug) })
  if (!cat) return fail(400, "所属分类不存在")

  const existing = await db.query.hobbyTags.findFirst({ where: eq(hobbyTags.name, name) })
  if (existing) return fail(409, "标签名已存在")

  const [created] = await db
    .insert(hobbyTags)
    .values({
      name,
      categoryId: cat.id,
      pinyin: toPinyin(name),
      pinyinInitials: toPinyinInitials(name),
      status,
      createdBy: guard.userId,
    })
    .returning()
  return ok(toTagDTO(created), { status: 201 })
}
```
顶部补 import：`import { toPinyin, toPinyinInitials } from "@/lib/search/pinyin"`。

**Step 2: 验证**

Run: `cd admin && pnpm exec tsc --noEmit`
Expected: 无类型错误。

Run:
```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"古琴","categorySlug":"folk-instrument"}' http://localhost:3000/api/admin/hobby-tags
```
Expected: 返回新建标签，status=approved，pinyin 已计算。

**Step 3: Commit**

```bash
git add admin/app/api/admin/hobby-tags/route.ts
git commit -m "feat(admin): POST /api/admin/hobby-tags create tag"
```

---

### Task 11: DELETE /api/admin/hobby-tags/[id] + PATCH 支持改名

**Files:**
- Modify: `admin/app/api/admin/hobby-tags/[id]/route.ts`

**Step 1: 扩展 PATCH schema 允许 name；新增 DELETE**

把 `updateTagSchema` 增加 `name` 字段：
```ts
const updateTagSchema = z
  .object({
    status: z.enum(["approved", "rejected"]).optional(),
    categorySlug: z.string().trim().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(30).optional(),
  })
  .refine((d) => d.status !== undefined || d.categorySlug !== undefined || d.name !== undefined, {
    message: "至少提供一个待更新字段",
  })
```
在 PATCH 处理函数 `const { status, categorySlug } = parsed.data` 改为解构 `name`，并在组装 updates 时：
```ts
if (name !== undefined) {
  const dup = await db.query.hobbyTags.findFirst({
    where: and(eq(hobbyTags.name, name), sql`${hobbyTags.id} <> ${id}`),
  })
  if (dup) return fail(409, "标签名已存在")
  updates.name = name
  updates.pinyin = toPinyin(name)
  updates.pinyinInitials = toPinyinInitials(name)
}
```
顶部补 import：`and, sql` from drizzle、`toPinyin, toPinyinInitials` from pinyin。

**Step 2: 文件末尾追加 DELETE**

```ts
export async function DELETE(_req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const { id } = await context.params

  const existing = await db.query.hobbyTags.findFirst({ where: eq(hobbyTags.id, id) })
  if (!existing) return fail(404, "标签不存在")

  // 检查是否被用户/圈子引用(users.tags / circles.tags 为 text[] 存 name)
  // 注:仅做软删除标记更安全;此处按需求做硬删除
  await db.delete(hobbyTags).where(eq(hobbyTags.id, id))
  logger.info(LOG_PREFIX.ADMIN, "Tag deleted", { tagId: id, by: guard.userId })
  return ok({ id })
}
```

**Step 3: 验证**

Run: `cd admin && pnpm exec tsc --noEmit`
Expected: 无类型错误。

Run:
```bash
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"古琴艺术"}' http://localhost:3000/api/admin/hobby-tags/<id>
curl -s -X DELETE -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/hobby-tags/<id>
```
Expected: PATCH 返回改名后标签；DELETE 返回 `{id}`。

**Step 4: Commit**

```bash
git add admin/app/api/admin/hobby-tags/[id]/route.ts
git commit -m "feat(admin): tag rename in PATCH + DELETE endpoint"
```

---

### Task 12: TagPanel（右栏：选中分类下的标签 + 筛选/分页/CRUD）

**Files:**
- Create: `admin/app/admin/taxonomy/_components/tag-panel.tsx`

**Step 1: 创建 `TagPanel` 客户端组件（随左栏选中分类联动，fetch + 筛选 + 分页 + 新建/编辑/删除）**

核心结构：
- props：`selected: SelectedCategory | null`（来自左栏选中；`null` 时展示全部标签）、`flat: CategoryDTO[]`（供弹窗下拉）、`onAddTag`/`onEditTag` 回调（打开 `TagDialog`）。
- `useEffect` 内调用 `/api/admin/hobby-tags?status=&category=<selected?.slug>&q=&page=&pageSize=20`，维护 `items/total/page`；当 `selected` 变化时（category 参数变化）重置到第 1 页重新拉取。
- 顶部加：关键词 `Input`(q)、状态 `Select`(approved/pending/rejected/全部)、「新建标签」按钮（新建时默认带入 `selected` 的分类 slug）。
- 中间保留原 status Tabs + Approve/Reject 行操作，并增加「编辑」（打开 TagDialog）与「删除」（DELETE）。
- 底部分页（`page` 上/下一页 + 总数）。
- 标题显示当前选中分类名（如「视觉艺术 · 全部标签」）；未选中时显示「全部标签」。

> 因组件较大，实施时请完整实现 fetch/state/pagination；此处给出关键数据流，避免占位。

**Step 2: 验证**

Run: `cd admin && pnpm exec tsc --noEmit`
Expected: 无类型错误。

Run: 浏览器 `http://localhost:3000/admin/taxonomy`，左栏选中某分类 → 右栏仅显示该分类标签；输入关键词、翻页、新建/编辑/删除。
Expected: 列表随选中分类与筛选刷新；新建标签出现在对应分类下；删除后总数-1。

**Step 3: Commit**

```bash
git add admin/app/admin/taxonomy/_components/tag-panel.tsx
git commit -m "feat(admin): tag panel with filter/search/pagination + CRUD"
```

---

### Task 13: TagDialog（新建/编辑标签弹窗）

**Files:**
- Create: `admin/app/admin/taxonomy/_components/tag-dialog.tsx`

**Step 1: 创建弹窗**

```tsx
"use client"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import type { TagDTO, CategoryDTO } from "@/types/api"

export function TagDialog({
  tag, categories, onClose, onSaved,
}: {
  tag?: TagDTO
  categories: CategoryDTO[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!tag
  const [name, setName] = useState(tag?.name ?? "")
  const [categorySlug, setCategorySlug] = useState(
    categories.find((c) => c.id === tag?.categoryId)?.slug ?? categories[0]?.slug ?? ""
  )
  const [status, setStatus] = useState<TagDTO["status"]>(tag?.status ?? "approved")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function save() {
    setBusy(true); setErr(null)
    const body = isEdit
      ? { name, categorySlug, status }
      : { name, categorySlug, status }
    const url = isEdit ? `/api/admin/hobby-tags/${tag!.id}` : "/api/admin/hobby-tags"
    const method = isEdit ? "PATCH" : "POST"
    const res = await fetch(url, {
      method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    const data = await res.json()
    setBusy(false)
    if (res.ok) onSaved()
    else setErr(data.message || "保存失败")
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{isEdit ? "编辑标签" : "新建标签"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>名称</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div>
            <Label>所属分类</Label>
            <select className="w-full rounded border px-2 py-1" value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <Label>状态</Label>
            <select className="w-full rounded border px-2 py-1" value={status} onChange={(e) => setStatus(e.target.value as TagDTO["status"])}>
              <option value="approved">已通过</option>
              <option value="pending">待审核</option>
              <option value="rejected">已拒绝</option>
            </select>
          </div>
          {err ? <p className="text-sm text-destructive">{err}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button onClick={save} disabled={busy || !name.trim()}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

**Step 2: 在 `tag-panel.tsx` 中引用 `TagDialog`（`categories` 用 `TaxonomyManager` 传入的 `flat` 列表，即 `/api/admin/categories` 的 `flat`）。**

**Step 3: 验证**

Run: `cd admin && pnpm exec tsc --noEmit`
Expected: 无类型错误；端到端新建/编辑标签可用。

**Step 4: Commit**

```bash
git add admin/app/admin/taxonomy/_components/tag-dialog.tsx admin/app/admin/taxonomy/_components/tag-panel.tsx
git commit -m "feat(admin): tag create/edit dialog"
```

---

## 阶段 D：整体验证与收尾

### Task 14: 全量类型检查 + 端到端冒烟

**Step 1: 类型检查**

Run: `cd admin && pnpm exec tsc --noEmit`
Expected: 0 errors。

**Step 2: 启动并冒烟**

Run:
```bash
cd admin && pnpm dev &
# 等待起服务后:
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:3000/api/admin/categories | python -m json.tool | head -40
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:3000/api/admin/hobby-tags?status=pending&pageSize=5" | python -m json.tool | head -40
```
Expected: 分类树正常；标签分页结构 `Paginated<TagDTO>` 正常。

**Step 3: 手动核对 UI**
- `/admin/taxonomy`：左栏新建/编辑/删除/挂子类；选中某分类后右栏联动展示其下标签。
- 右栏标签面板：筛选(状态/关键词) + 分页 + 新建/编辑/删除 + 通过/拒绝。

**Step 4: Commit（若有收尾修复）**

```bash
git add -A && git commit -m "chore(admin): typecheck + smoke fixes for category/tag management"
```

---

## 备注 / 风险

1. **seed 会清空后台分类**：`seed.ts` 全量重建 `DELETE` 全部 categories。若希望后台创建的分类持久，应移除 seed 中分类部分或改为 upsert；本计划未包含（YAGNI，按需求可另立任务）。
2. **删除标签为硬删除**：`users.tags`/`circles.tags` 存的是标签名 `text[]`，删除标签不会级联清理这些数组，可能产生悬空名。如需更稳，可改为「软删除」(标记 status=rejected 或新增 isDeleted)。当前按硬删除实现，已在 Task 11 注明。
3. **slug 自动生成**依赖 `toPinyin`；纯英文/符号名会回退到 `cat-<base36>` 保证非空唯一。
4. **两级限制**：数据库 `level in (1,2)`，UI 与 API 均禁止第三级嵌套（POST/PATCH 已校验父级必须为 level=1）。
