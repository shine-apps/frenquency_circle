import { ok, withCors } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { getUnreadCount } from "@/lib/notifications"

/**
 * GET /api/admin/notifications/unread-count
 *
 * 当前管理员的后台未读通知数量(仅 `linkTarget = 'admin'`)。
 * 用于后台铃铛未读角标展示。
 */
export async function GET(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const adminId = guard.userId

  const count = await getUnreadCount(adminId, "admin")
  return withCors(ok({ count }), req)
}
