import { corsOptions, ok, withCors } from "@/lib/api"
import { listMbtiTypes } from "@/lib/mbti/service"

/**
 * GET /api/mbti/types
 *
 * 浏览全部 16 型人格(公开,无需登录)。
 *
 * 响应:`IResponse<{ list: MbtiTypeDTO[] }>`
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  const list = await listMbtiTypes()
  return withCors(ok({ list }), req)
}
