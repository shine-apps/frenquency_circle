import { z } from "zod"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { mbtiQuestions } from "@/db/schema"
import { fail, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { validateOptionScores } from "@/lib/mbti/scoring"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PATCH /api/admin/mbti/questions/[id]
 *
 * 管理后台编辑题目(题干/选项/计分字母/排序/启停)。
 * 至少提供一个字段;传计分字母时需保证与维度匹配。
 */
const updateQuestionSchema = z
  .object({
    dimension: z.enum(["EI", "SN", "TF", "JP"]).optional(),
    stem: z.string().trim().min(1).max(200).optional(),
    optionA: z.string().trim().min(1).max(100).optional(),
    optionB: z.string().trim().min(1).max(100).optional(),
    optionAScore: z.enum(["E", "I", "S", "N", "T", "F", "J", "P"]).optional(),
    optionBScore: z.enum(["E", "I", "S", "N", "T", "F", "J", "P"]).optional(),
    sortOrder: z.coerce.number().int().min(0).max(999).optional(),
    status: z.enum(["active", "disabled"]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "至少提供一个待更新字段",
  })

export async function PATCH(req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params
  const body = await req.json().catch(() => null)
  const parsed = updateQuestionSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }

  // 计分字母校验需结合维度最终值(请求里改维度或改字母都算)
  const [current] = await db
    .select()
    .from(mbtiQuestions)
    .where(eq(mbtiQuestions.id, id))
    .limit(1)
  if (!current) return fail(404, "题目不存在")

  const dimension = parsed.data.dimension ?? current.dimension
  const optionAScore = parsed.data.optionAScore ?? current.optionAScore
  const optionBScore = parsed.data.optionBScore ?? current.optionBScore
  const scoreError = validateOptionScores(dimension, optionAScore, optionBScore)
  if (scoreError) return fail(400, scoreError)

  const [updated] = await db
    .update(mbtiQuestions)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(mbtiQuestions.id, id))
    .returning()

  logger.info(LOG_PREFIX.ADMIN, "MBTI 题目已更新", {
    id,
    by: guard.userId,
  })
  return ok(updated)
}

/**
 * DELETE /api/admin/mbti/questions/[id]
 *
 * 删除题目(物理删除;seed 重跑可恢复种子题)。
 */
export async function DELETE(_req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params
  const [deleted] = await db
    .delete(mbtiQuestions)
    .where(eq(mbtiQuestions.id, id))
    .returning({ id: mbtiQuestions.id })
  if (!deleted) return fail(404, "题目不存在")

  logger.info(LOG_PREFIX.ADMIN, "MBTI 题目已删除", { id, by: guard.userId })
  return ok({ deleted: true })
}
