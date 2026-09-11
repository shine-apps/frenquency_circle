import { z } from "zod"
import { asc, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { mbtiQuestions } from "@/db/schema"
import { fail, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { validateOptionScores } from "@/lib/mbti/scoring"
import { logger, LOG_PREFIX } from "@/lib/logger"

/**
 * GET /api/admin/mbti/questions
 *
 * 管理后台题目列表(含停用题目,按 sortOrder 升序)。
 */
export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const list = await db
    .select()
    .from(mbtiQuestions)
    .orderBy(asc(mbtiQuestions.sortOrder), asc(mbtiQuestions.createdAt))
  return ok({ list })
}

const createQuestionSchema = z.object({
  dimension: z.enum(["EI", "SN", "TF", "JP"]),
  stem: z.string().trim().min(1).max(200),
  optionA: z.string().trim().min(1).max(100),
  optionB: z.string().trim().min(1).max(100),
  optionAScore: z.enum(["E", "I", "S", "N", "T", "F", "J", "P"]),
  optionBScore: z.enum(["E", "I", "S", "N", "T", "F", "J", "P"]),
  sortOrder: z.coerce.number().int().min(0).max(999).optional(),
})

/**
 * POST /api/admin/mbti/questions
 *
 * 管理后台新增题目。校验两个选项计分字母必须为该维度的一对字母。
 */
export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const body = await req.json().catch(() => null)
  const parsed = createQuestionSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "参数校验失败", parsed.error.flatten())
  }
  const { dimension, optionAScore, optionBScore, sortOrder } = parsed.data
  const scoreError = validateOptionScores(dimension, optionAScore, optionBScore)
  if (scoreError) {
    return fail(400, scoreError)
  }

  // 未指定排序(0/缺省)时排到题库末尾,避免新题插到第 1 题
  const [{ maxSortOrder }] = await db
    .select({
      maxSortOrder: sql<number>`coalesce(max(${mbtiQuestions.sortOrder}), 0)`,
    })
    .from(mbtiQuestions)

  const [row] = await db
    .insert(mbtiQuestions)
    .values({
      ...parsed.data,
      sortOrder: sortOrder && sortOrder > 0 ? sortOrder : Number(maxSortOrder) + 1,
      status: "active",
    })
    .returning()

  logger.info(LOG_PREFIX.ADMIN, "MBTI 题目已创建", {
    id: row.id,
    dimension,
    by: guard.userId,
  })
  return ok(row, { status: 201 })
}
