import { and, eq, ilike, like, or, desc, sql, aliasedTable } from "drizzle-orm"

import { db } from "@/lib/db"
import { hobbyTags, categories } from "@/db/schema"
import type { TagDTO } from "@/types/api"
import { toPinyin, toPinyinInitials } from "@/lib/search/pinyin"

/**
 * 标签搜索引擎。
 *
 * 搜索策略(按优先级 UNION 或合并去重):
 *   1. 精确匹配 name(忽略大小写)
 *   2. ILIKE `%query%` 匹配 name
 *   3. pinyin 完全匹配
 *   4. pinyinInitials 完全匹配
 *   5. pinyinInitials 前缀匹配(`pinyinInitials LIKE 'query%'`)
 *
 * 仅返回 `status='approved'` 的标签(自定义 pending 标签不返回)。
 * 合并去重(按 tagId),限制返回条数。
 */

/**
 * 分类灵活化后,标签的 categoryId 可指向任意层级的分类节点:
 * - 指向 level=2 中类:上游一级大类为 parent,本节点为 node
 * - 指向 level=1 叶子大类:无 parent,本节点即为 node(叶子分类)
 *
 * 据此计算(见 toTagDTO):
 * - `categoryName`:展示用一级大类名(parent.name;叶子 level-1 时回退为自身名)
 * - `subCategoryName`:中类名(本节点为 level=2 时 = node.name;level=1 时为 null)
 * - `categoryLevel`:本节点层级(1/2)
 */
export type TagRowWithCategory = typeof hobbyTags.$inferSelect & {
  /** 展示用一级大类名(parent.name,叶子 level-1 时回退为自身名) */
  categoryName?: string | null
  /** 中类名(本节点为 level=2 时 = node.name;level=1 时为 null) */
  subCategoryName?: string | null
  /** 所属分类节点层级(1/2) */
  categoryLevel?: number | null
}

/**
 * 将带分类关联的行映射为 TagDTO。
 *
 * - category:展示用一级大类名(level-2 时为父级 level-1 名;level-1 叶子时为自身名)
 * - subCategory:仅当本节点为 level=2 时存在中类名,否则为 null
 * - categoryLevel:本节点层级(1/2),供前端区分「直挂一级」与「挂在二级」
 */
export function toTagDTO(row: TagRowWithCategory): TagDTO {
  return {
    id: row.id,
    name: row.name,
    category: row.categoryName ?? "",
    subCategory: row.categoryLevel === 2 ? (row.subCategoryName ?? null) : null,
    categoryLevel: (row.categoryLevel ?? null) as TagDTO["categoryLevel"],
    categoryId: row.categoryId ?? null,
    pinyin: row.pinyin ?? null,
    pinyinInitials: row.pinyinInitials ?? null,
    status: row.status as "pending" | "approved" | "rejected",
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * 查询 hobby_tags 并 LEFT JOIN categories(本节点 + 父节点),一次拿到分类名称与层级。
 */
const nodeAlias = aliasedTable(categories, "node")
const parentAlias = aliasedTable(categories, "parent")

export function selectTagsWithCategory() {
  return db
    .select({
      // hobby_tags 字段
      id: hobbyTags.id,
      name: hobbyTags.name,
      categoryId: hobbyTags.categoryId,
      pinyin: hobbyTags.pinyin,
      pinyinInitials: hobbyTags.pinyinInitials,
      status: hobbyTags.status,
      createdBy: hobbyTags.createdBy,
      createdAt: hobbyTags.createdAt,
      updatedAt: hobbyTags.updatedAt,
      // 一级大类名:优先父节点(parent),叶子 level-1 时回退为自身名(node)
      categoryName: sql<string>`coalesce(${parentAlias.name}, ${nodeAlias.name})`,
      // 中类名:仅当本节点为 level=2
      subCategoryName: nodeAlias.name,
      // 层级:本节点 level
      categoryLevel: nodeAlias.level,
    })
    .from(hobbyTags)
    .leftJoin(nodeAlias, eq(hobbyTags.categoryId, nodeAlias.id))
    .leftJoin(parentAlias, eq(nodeAlias.parentId, parentAlias.id))
}

/** 供路由层复用:分类灵活化后的节点/父节点别名(用于按大类筛选与计数) */
export { nodeAlias, parentAlias }

/**
 * 按多策略搜索标签。
 *
 * @param query 搜索关键词(中文 / 拼音 / 首字母)
 * @param limit 最大返回条数,默认 10
 * @returns 匹配到的 TagDTO 数组,按优先级合并去重
 */
export async function searchTags(
  query: string,
  limit: number = 10
): Promise<TagDTO[]> {
  const trimmed = query.trim()
  if (!trimmed || limit <= 0) return []

  // 计算入参的拼音,用于 pinyin 完全匹配与 pinyinInitials 匹配
  const queryPinyin = toPinyin(trimmed)
  const queryInitials = toPinyinInitials(trimmed)

  // 5 个搜索分支,通过 OR 合并;每个分支都强制 status='approved'
  const conditions = [
    // 1. 精确匹配 name(忽略大小写,等价于 lower(name) = lower(query))
    eq(hobbyTags.name, trimmed),
    // 2. ILIKE '%query%' 模糊匹配 name
    ilike(hobbyTags.name, `%${trimmed}%`),
  ]
  // 3. pinyin 完全匹配
  if (queryPinyin) {
    conditions.push(eq(hobbyTags.pinyin, queryPinyin))
  }
  // 4. pinyinInitials 完全匹配
  if (queryInitials) {
    conditions.push(eq(hobbyTags.pinyinInitials, queryInitials))
  }
  // 5. pinyinInitials 前缀匹配
  if (queryInitials) {
    conditions.push(like(hobbyTags.pinyinInitials, `${queryInitials}%`))
  }

  const rows = await selectTagsWithCategory()
    .where(and(eq(hobbyTags.status, "approved"), or(...conditions)))
    .limit(limit)

  // 同一标签可能命中多个分支,SELECT 结果可能有重复行;
  // 但由于 drizzle 的 select 默认不 DISTINCT,这里在内存中按 id 去重。
  // 同时按原始顺序(数据库返回顺序)保留首次出现的项。
  const seen = new Set<string>()
  const unique: TagRowWithCategory[] = []
  for (const row of rows) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    unique.push(row)
  }

  return unique.map(toTagDTO)
}

/**
 * 返回热门标签 top N(目前按 createdAt 排序取前 N,后续可改为 searchCount)。
 *
 * @param limit 最大返回条数,默认 10
 */
export async function listPopularTags(
  limit: number = 10
): Promise<TagDTO[]> {
  const rows = await selectTagsWithCategory()
    .where(eq(hobbyTags.status, "approved"))
    .orderBy(desc(hobbyTags.createdAt))
    .limit(limit)

  return rows.map(toTagDTO)
}

// 重导出搜索辅助函数,便于其他模块(如 /api/hobby-tags/custom)复用
export { toPinyin, toPinyinInitials }
