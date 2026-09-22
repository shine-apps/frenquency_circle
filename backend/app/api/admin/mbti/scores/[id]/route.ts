import { z } from "zod"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { mbtiHobbyScores } from "@/db/schema"
import { fail, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

const updateScoreSchema = z
  .object({
    matchProbability: z.coerce.number().int().min(0).max(100).optional(),
    reason: z.string().trim().min(1).max(500).optional(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "至少提供一个待更新字段",
  })

/**
 * PATCH /api/admin/mbti/scores/[id]
 *
 * 调整某条「兴趣 × 类型」推荐概率/解释/启停。
 */
export async function PATCH(req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params
  const body = await req.json().catch(() => null)
  const parsed = updateScoreSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }

  const [updated] = await db
    .update(mbtiHobbyScores)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(mbtiHobbyScores.id, id))
    .returning()
  if (!updated) return fail(404, "推荐记录不存在")

  logger.info(LOG_PREFIX.ADMIN, "MBTI 推荐概率已更新", { id, by: guard.userId })
  return ok(updated)
}

/**
 * DELETE /api/admin/mbti/scores/[id]
 *
 * 删除某条推荐概率记录(该组合恢复为概率 0)。
 */
export async function DELETE(_req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params
  const [deleted] = await db
    .delete(mbtiHobbyScores)
    .where(eq(mbtiHobbyScores.id, id))
    .returning({ id: mbtiHobbyScores.id })
  if (!deleted) return fail(404, "推荐记录不存在")

  logger.info(LOG_PREFIX.ADMIN, "MBTI 推荐概率已删除", { id, by: guard.userId })
  return ok({ deleted: true })
}
