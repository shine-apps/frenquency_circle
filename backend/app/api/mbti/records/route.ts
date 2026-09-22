import { corsOptions, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { listTestRecordsByUser } from "@/lib/mbti/service"

/**
 * GET /api/mbti/records
 *
 * 当前登录用户的 MBTI 测试历史(时间倒序,最多 50 条)。
 *
 * 响应:`IResponse<{ list: MbtiTestRecordDTO[] }>`
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response

  const records = await listTestRecordsByUser(guard.user.id)
  return withCors(
    ok({
      list: records.map((r) => ({
        id: r.id,
        resultType: r.resultType,
        dimensionScores: r.dimensionScores,
        createdAt: r.createdAt.toISOString(),
      })),
    }),
    req
  )
}
