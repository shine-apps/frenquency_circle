import type { NextRequest } from "next/server"
import { z } from "zod"
import { and, asc, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  categories,
  hobbyTags,
  mbtiHobbyScores,
  MBTI_TYPE_CODES,
  type MbtiTypeCode,
} from "@/db/schema"
import { fail, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"

/**
 * GET /api/admin/mbti/scores
 *
 * 概率矩阵查询(双视角):
 * - `?tagId=`   单标签的 16 型概率向量
 * - `?typeCode=` 单类型下全部兴趣按概率倒序
 * 两个参数必须二选一。
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const tagId = req.nextUrl.searchParams.get("tagId")
  const typeCode = req.nextUrl.searchParams.get("typeCode")

  if (Boolean(tagId) === Boolean(typeCode)) {
    return fail(400, "tagId 与 typeCode 必须二选一")
  }
  if (typeCode) {
    const validCodes = new Set<string>(MBTI_TYPE_CODES)
    if (!validCodes.has(typeCode)) {
      return fail(400, `非法的人格类型代码: ${typeCode}`)
    }
  }

  const rows = await db
    .select({
      id: mbtiHobbyScores.id,
      hobbyTagId: mbtiHobbyScores.hobbyTagId,
      tagName: hobbyTags.name,
      categoryName: categories.name,
      typeCode: mbtiHobbyScores.typeCode,
      matchProbability: mbtiHobbyScores.matchProbability,
      reason: mbtiHobbyScores.reason,
      status: mbtiHobbyScores.status,
      sortOrder: mbtiHobbyScores.sortOrder,
    })
    .from(mbtiHobbyScores)
    .innerJoin(hobbyTags, eq(mbtiHobbyScores.hobbyTagId, hobbyTags.id))
    .leftJoin(categories, eq(hobbyTags.categoryId, categories.id))
    .where(
      tagId
        ? eq(mbtiHobbyScores.hobbyTagId, tagId)
        : eq(mbtiHobbyScores.typeCode, typeCode as MbtiTypeCode)
    )
    .orderBy(
      tagId
        ? asc(mbtiHobbyScores.typeCode)
        : desc(mbtiHobbyScores.matchProbability),
      asc(mbtiHobbyScores.sortOrder)
    )

  return ok({ list: rows })
}

const upsertScoreSchema = z.object({
  hobbyTagId: z.string().uuid(),
  typeCode: z.enum(MBTI_TYPE_CODES),
  matchProbability: z.coerce.number().int().min(0).max(100),
  reason: z.string().trim().min(1).max(500),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
})

/**
 * POST /api/admin/mbti/scores
 *
 * 配置/更新一条「兴趣 × 类型」推荐概率(UNIQUE(hobbyTagId, typeCode) upsert)。
 * 校验:标签必须存在于 hobby_tags,概率 ∈ [0,100]。
 */
export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const body = await req.json().catch(() => null)
  const parsed = upsertScoreSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "参数校验失败", parsed.error.flatten())
  }
  const { hobbyTagId, typeCode, matchProbability, reason, sortOrder } =
    parsed.data

  const tag = await db
    .select({ id: hobbyTags.id })
    .from(hobbyTags)
    .where(eq(hobbyTags.id, hobbyTagId))
    .limit(1)
  if (tag.length === 0) return fail(400, "兴趣标签不存在")

  const [row] = await db
    .insert(mbtiHobbyScores)
    .values({
      hobbyTagId,
      typeCode,
      matchProbability,
      reason,
      sortOrder: sortOrder ?? 0,
      status: "active",
    })
    .onConflictDoUpdate({
      target: [mbtiHobbyScores.hobbyTagId, mbtiHobbyScores.typeCode],
      set: {
        matchProbability,
        reason,
        sortOrder: sortOrder ?? 0,
        // 显式恢复启用,避免停用记录保存后仍不参与推荐
        status: "active",
        updatedAt: new Date(),
      },
    })
    .returning()

  logger.info(LOG_PREFIX.ADMIN, "MBTI 推荐概率已配置", {
    id: row.id,
    hobbyTagId,
    typeCode,
    matchProbability,
    by: guard.userId,
  })
  return ok(row, { status: 201 })
}
