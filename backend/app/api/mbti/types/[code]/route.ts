import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { getMbtiTypeByCode, getRecommendationsForType } from "@/lib/mbti/service"

type RouteContext = { params: Promise<{ code: string }> }

/**
 * GET /api/mbti/types/[code]
 *
 * 单型详情 + 按概率降序的爱好推荐(公开,无需登录)。
 * code 不合法(非 16 型之一)返回 404。
 *
 * 响应:`IResponse<MbtiTypeDetailDTO>`
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request, context: RouteContext) {
  const { code } = await context.params
  const type = await getMbtiTypeByCode(code)
  if (!type) {
    return withCors(fail(404, `未知的人格类型: ${code}`), req)
  }
  const recommendations = await getRecommendationsForType(type.code)
  return withCors(ok({ ...type, recommendations }), req)
}
