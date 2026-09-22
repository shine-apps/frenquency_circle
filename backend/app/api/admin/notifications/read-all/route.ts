import { ok, withCors } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { markAllRead } from "@/lib/notifications"

/**
 * POST /api/admin/notifications/read-all
 *
 * 将当前管理员后台(`linkTarget = 'admin'`)全部未读通知标记为已读。
 * 限定 linkTarget 避免误清小程序端通知。
 */
export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const adminId = guard.userId

  const count = await markAllRead(adminId, "admin")
  return withCors(ok({ marked: count }), req)
}
