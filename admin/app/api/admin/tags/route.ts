import type { NextRequest } from "next/server"
import { z } from "zod"
import { and, desc, eq, ilike, or, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { tags } from "@/db/schema"
import { fail, ok, parsePagination } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { toTagDTO } from "@/lib/search/tag-search"
import type { TagDTO, Paginated } from "@/types/api"

/**
 * 管理后台标签列表查询参数 schema。
 * - status: 可选,按状态筛选(pending/approved/rejected)
 * - category: 可选,按一级大类筛选
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
 * GET /api/admin/tags
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

  // 组装筛选条件
  const conditions = []
  if (status) conditions.push(eq(tags.status, status))
  if (category) conditions.push(eq(tags.category, category))
  if (q) {
    // 关键词同时匹配 name / pinyin / pinyinInitials
    conditions.push(
      or(
        ilike(tags.name, `%${q}%`),
        ilike(tags.pinyin, `%${q}%`),
        ilike(tags.pinyinInitials, `%${q}%`)
      )!
    )
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(tags)
      .where(whereClause)
      .orderBy(desc(tags.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(tags)
      .where(whereClause),
  ])

  const payload: Paginated<TagDTO> = {
    list: rows.map(toTagDTO),
    total: Number(count),
    page,
    pageSize,
  }
  return ok(payload)
}
