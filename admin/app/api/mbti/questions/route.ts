import { corsOptions, ok, withCors } from "@/lib/api"
import { getActiveQuestionDTOs } from "@/lib/mbti/service"

/**
 * GET /api/mbti/questions
 *
 * 获取参与测试的题目列表(公开,游客可测)。
 * 仅返回 active 题目,按 sortOrder 升序;不携带计分字母,防前端自算结果。
 *
 * 响应:`IResponse<{ list: MbtiQuestionDTO[] }>`
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  const list = await getActiveQuestionDTOs()
  return withCors(ok({ list }), req)
}
