import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { markRead } from "@/lib/notifications"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PATCH /api/notifications/:id
 *
 * 标记单条通知为已读。越权保护:只能标记自己的通知(recipientId 隔离)。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function PATCH(req: Request, context: RouteContext) {
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  const { id } = await context.params
  if (!id) {
    return withCors(fail(400, "Missing notification id"), req)
  }

  const okMarked = await markRead(id, userId)
  if (!okMarked) {
    // 不存在或非本人通知:幂等返回成功,避免客户端反复重试报红
    return withCors(ok({ marked: false }), req)
  }
  return withCors(ok({ marked: true }), req)
}
