import { corsOptions, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { getUnreadCount } from "@/lib/notifications"

/**
 * GET /api/notifications/unread-count
 *
 * 当前用户小程序端的未读通知数量(仅 `linkTarget = 'miniprogram'`)。
 * 用于「我的」页角标展示。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  const count = await getUnreadCount(userId, "miniprogram")
  return withCors(ok({ count }), req)
}
