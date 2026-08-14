import type { NextRequest } from "next/server"
import { z } from "zod"
import { and, desc, eq, ilike, or, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { hobbyTags, categories } from "@/db/schema"
import { fail, ok, parsePagination } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { toTagDTO, selectTagsWithCategory, type TagRowWithCategory, nodeAlias, parentAlias } from "@/lib/search/tag-search"
import { toPinyin, toPinyinInitials } from "@/lib/search/pinyin"
import { logger, LOG_PREFIX } from "@/lib/logger"
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

  // 分类灵活化:category 匹配「标签直挂分类(node,任意层级)的 name/slug」,
  // 或「其一级大类(parent)的 name/slug」
  const categoryCond = category
    ? or(
        eq(nodeAlias.name, category),
        eq(nodeAlias.slug, category),
        eq(parentAlias.name, category),
        eq(parentAlias.slug, category),
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

const createTagSchema = z.object({
  name: z.string().trim().min(1).max(64),
  categorySlug: z.string().trim().min(1).max(64),
  status: z.enum(["pending", "approved", "rejected"]).optional(),
})

/**
 * POST /api/admin/hobby-tags
 *
 * 管理后台新建标签。categorySlug 指定所属分类(必填),
 * pinyin / pinyinInitials 由名称自动生成,status 默认 pending。
 */
export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const body = await req.json().catch(() => null)
  const parsed = createTagSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "参数校验失败", parsed.error.flatten())
  }
  const { name, categorySlug, status } = parsed.data

  const category = await db.query.categories.findFirst({
    where: eq(categories.slug, categorySlug),
  })
  if (!category) return fail(404, "所属分类不存在")

  const pinyin = toPinyin(name)
  const pinyinInitials = toPinyinInitials(name)
  const existing = await db.query.hobbyTags.findFirst({
    where: eq(hobbyTags.name, name),
  })
  if (existing) return fail(409, "同名标签已存在")

  const [row] = await db
    .insert(hobbyTags)
    .values({
      name,
      categoryId: category.id,
      pinyin,
      pinyinInitials,
      status: status ?? "pending",
      createdBy: guard.userId,
    })
    .returning()

  logger.info(LOG_PREFIX.TAG, "新建标签", { id: row.id, by: guard.userId })
  return ok({ tag: toTagDTO(row) }, { status: 201 })
}
