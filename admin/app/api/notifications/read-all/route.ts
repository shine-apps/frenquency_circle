import { corsOptions, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { markAllRead } from "@/lib/notifications"

/**
 * POST /api/notifications/read-all
 *
 * 将当前用户小程序端(`linkTarget = 'miniprogram'`)全部未读通知标记为已读。
 * 限定 linkTarget 避免误清后台通知。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  const count = await markAllRead(userId, "miniprogram")
  return withCors(ok({ marked: count }), req)
}
