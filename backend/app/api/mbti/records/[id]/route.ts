import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { getTestRecordById } from "@/lib/mbti/service"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/mbti/records/[id]
 *
 * 查询单条测试记录详情(仅本人可见,防越权)。
 *
 * 响应:`IResponse<MbtiTestRecordDTO>`
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request, context: RouteContext) {
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response

  const { id } = await context.params
  const record = await getTestRecordById(guard.user.id, id)
  if (!record) {
    return withCors(fail(404, "测试记录不存在"), req)
  }

  return withCors(
    ok({
      id: record.id,
      resultType: record.resultType,
      dimensionScores: record.dimensionScores,
      createdAt: record.createdAt.toISOString(),
    }),
    req
  )
}
