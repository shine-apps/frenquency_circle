import type { NextRequest } from "next/server"
import { z } from "zod"
import { and, desc, eq, ilike, or, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { hobbyTags, categories } from "@/db/schema"
import { fail, ok, parsePagination } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { toTagDTO, selectTagsWithCategory, type TagRowWithCategory, nodeAlias, parentAlias } from "@/lib/search/tag-search"
import type { TagDTO, Paginated } from "@/types/api"

/**
 * 管理后台标签列表查询参数 schema。
 * - status: 可选,按状态筛选(pending/approved/rejected)
 * - category: 可选,按一级大类名或 slug 筛选
 * - q: 可选,关键词模糊搜索 name
 */
const listTagsQuerySchema = z.object({
  status: z
    .enum(["pending", "approved", "rejected"])
    .optional(),
  category: z.string().trim().optional(),
  q: z.string().trim().optional(),
})

/**
 * GET /api/admin/hobby-tags
 *
 * 管理后台标签列表(需 ADMIN 权限)。
 * 支持按 status / category 筛选 + q 关键词搜索 + 分页。
 * 默认按 createdAt 倒序(最新创建的在前,便于审核新提交的标签)。
 *
 * 响应:`Paginated<TagDTO>`
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const pagination = parsePagination(req.nextUrl.searchParams)
  if (!pagination) return fail(400, "Invalid pagination")
  const { page, pageSize } = pagination
  const offset = (page - 1) * pageSize

  const parsed = listTagsQuerySchema.safeParse({
    status: req.nextUrl.searchParams.get("status") ?? undefined,
    category: req.nextUrl.searchParams.get("category") ?? undefined,
    q: req.nextUrl.searchParams.get("q") ?? undefined,
  })
  if (!parsed.success) {
    return fail(400, "Invalid query parameters", parsed.error.flatten())
  }

  const { status, category, q } = parsed.data

  // 组装筛选条件(在 hobby_tags 上)
  const conditions = []
  if (status) conditions.push(eq(hobbyTags.status, status))
  if (q) {
    // 关键词同时匹配 name / pinyin / pinyinInitials
    conditions.push(
      or(
        ilike(hobbyTags.name, `%${q}%`),
        ilike(hobbyTags.pinyin, `%${q}%`),
        ilike(hobbyTags.pinyinInitials, `%${q}%`)
      )!
    )
  }

  // 分类灵活化:category 匹配「标签所在一级大类(parent)的 name/slug」,
  // 或「标签直挂的 level=1 叶子大类(node)的 name/slug」
  const categoryCond = category
    ? or(
        eq(parentAlias.name, category),
        eq(parentAlias.slug, category),
        and(eq(nodeAlias.level, 1), eq(nodeAlias.name, category)),
        and(eq(nodeAlias.level, 1), eq(nodeAlias.slug, category))
      )!
    : undefined

  const whereClause = categoryCond
    ? conditions.length > 0
      ? and(...conditions, categoryCond)
      : categoryCond
    : conditions.length > 0
      ? and(...conditions)
      : undefined

  // 关联查询:拿到分类名称 + 支持按一级大类筛选
  const baseQuery = selectTagsWithCategory()
  const filteredQuery = whereClause ? baseQuery.where(whereClause) : baseQuery

  const [joinedRows, [{ count }]] = await Promise.all([
    filteredQuery
      .orderBy(desc(hobbyTags.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(hobbyTags)
      .leftJoin(nodeAlias, eq(hobbyTags.categoryId, nodeAlias.id))
      .leftJoin(parentAlias, eq(nodeAlias.parentId, parentAlias.id))
      .where(whereClause),
  ])

  const rows = joinedRows as TagRowWithCategory[]

  const payload: Paginated<TagDTO> = {
    list: rows.map(toTagDTO),
    total: Number(count),
    page,
    pageSize,
  }
  return ok(payload)
}
