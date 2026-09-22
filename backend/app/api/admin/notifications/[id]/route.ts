import { fail, ok, withCors } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { markRead } from "@/lib/notifications"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PATCH /api/admin/notifications/:id
 *
 * 标记单条后台通知为已读。越权保护:只能标记自己的通知(recipientId 隔离)。
 * 幂等:已读 / 不存在 / 非本人均返回 `marked:false`(200),不报错。
 */
export async function PATCH(req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  const adminId = guard.userId

  const { id } = await context.params
  if (!id) {
    return withCors(fail(400, "Missing notification id"), req)
  }

  const okMarked = await markRead(id, adminId)
  return withCors(ok({ marked: okMarked }), req)
}
