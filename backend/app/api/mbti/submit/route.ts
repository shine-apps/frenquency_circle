import { z } from "zod"

import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { readUserFromToken } from "@/lib/auth/session-token"
import { logger, LOG_PREFIX } from "@/lib/logger"
import { scoreMbti, validateMbtiAnswers } from "@/lib/mbti/scoring"
import {
  getActiveScoringQuestions,
  getMbtiTypeByCode,
  getRecommendationsForType,
  saveTestRecord,
  toDimensionScoreDTOArray,
} from "@/lib/mbti/service"

/**
 * POST /api/mbti/submit
 *
 * 提交测试答案并计算结果(公开,游客可测)。
 *
 * - body: `{ answers: ('A'|'B')[] }`,与题目顺序一一对应
 * - 服务端按 active 题目计分,防止篡改;类型文案缺失时返回 500 级错误
 * - 有有效会话(Bearer token)则落库 mbti_test_records;游客不写库
 *
 * 响应:`IResponse<MbtiSubmitResultDTO>`
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

const submitSchema = z.object({
  answers: z.array(z.enum(["A", "B"])),
})

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return withCors(fail(400, "Invalid JSON body"), req)
  }
  const parsed = submitSchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  const questions = await getActiveScoringQuestions()
  if (questions.length === 0) {
    return withCors(fail(503, "测试题目暂未配置,请稍后再试"), req)
  }

  const validationError = validateMbtiAnswers(questions, parsed.data.answers)
  if (validationError) {
    return withCors(fail(400, validationError), req)
  }

  const { resultType, dimensionScores } = scoreMbti(
    questions,
    parsed.data.answers
  )

  const type = await getMbtiTypeByCode(resultType)
  if (!type) {
    return withCors(fail(500, `人格类型文案缺失: ${resultType}`), req)
  }
  const recommendations = await getRecommendationsForType(resultType)

  // 游客提交不落库;登录用户保存历史记录(旁路失败不阻断结果返回)
  const user = await readUserFromToken(req)
  let saved = false
  let recordId: string | null = null
  if (user) {
    try {
      recordId = await saveTestRecord({
        userId: user.id,
        answers: parsed.data.answers,
        resultType,
        dimensionScores: toDimensionScoreDTOArray(dimensionScores),
      })
      saved = true
    } catch (error) {
      logger.error(LOG_PREFIX.MBTI, "保存测试记录失败", {
        userId: user.id,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return withCors(
    ok({
      resultType,
      dimensionScores: toDimensionScoreDTOArray(dimensionScores),
      type,
      recommendations,
      saved,
      recordId,
    }),
    req
  )
}
