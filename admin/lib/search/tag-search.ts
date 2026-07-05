import { and, eq, ilike, like, or, desc } from "drizzle-orm"

import { db } from "@/lib/db"
import { tags } from "@/db/schema"
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
 * 将 tags 表行映射为 TagDTO。
 */
export function toTagDTO(row: typeof tags.$inferSelect): TagDTO {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    subCategory: row.subCategory ?? null,
    pinyin: row.pinyin ?? null,
    pinyinInitials: row.pinyinInitials ?? null,
    status: row.status as "pending" | "approved" | "rejected",
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

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
    eq(tags.name, trimmed),
    // 2. ILIKE '%query%' 模糊匹配 name
    ilike(tags.name, `%${trimmed}%`),
  ]
  // 3. pinyin 完全匹配
  if (queryPinyin) {
    conditions.push(eq(tags.pinyin, queryPinyin))
  }
  // 4. pinyinInitials 完全匹配
  if (queryInitials) {
    conditions.push(eq(tags.pinyinInitials, queryInitials))
  }
  // 5. pinyinInitials 前缀匹配
  if (queryInitials) {
    conditions.push(like(tags.pinyinInitials, `${queryInitials}%`))
  }

  const rows = await db
    .select()
    .from(tags)
    .where(and(eq(tags.status, "approved"), or(...conditions)))
    .limit(limit)

  // 同一标签可能命中多个分支,SELECT 结果可能有重复行;
  // 但由于 drizzle 的 select 默认不 DISTINCT,这里在内存中按 id 去重。
  // 同时按原始顺序(数据库返回顺序)保留首次出现的项。
  const seen = new Set<string>()
  const unique: typeof tags.$inferSelect[] = []
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
  const rows = await db
    .select()
    .from(tags)
    .where(eq(tags.status, "approved"))
    .orderBy(desc(tags.createdAt))
    .limit(limit)

  return rows.map(toTagDTO)
}

// 重导出搜索辅助函数,便于其他模块(如 /api/tags/custom)复用
export { toPinyin, toPinyinInitials }
