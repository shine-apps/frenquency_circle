import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { contactRequests } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { findContactRequest } from "@/lib/contact-requests"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * DELETE /api/contact-requests/:id
 *
 * 撤回自己发出的、尚未被处理的打招呼请求。
 *
 * - 鉴权:仅发起方(`fromUserId`)可操作,否则 403
 * - 仅 pending 可撤回,已接受 / 已拒绝返回 409
 * - 撤回不占用当日配额豁免:配额按当日发起次数统计,撤回不返还
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function DELETE(req: Request, context: RouteContext) {
  const { id } = await context.params

  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 查询请求
  const request = await findContactRequest(id)
  if (!request) {
    return withCors(fail(404, "联系请求不存在"), req)
  }

  // 3. 越权校验:仅发起方可撤回
  if (request.fromUserId !== userId) {
    return withCors(fail(403, "无权撤回该联系请求"), req)
  }

  // 4. 仅 pending 可撤回
  if (request.status !== "pending") {
    return withCors(fail(409, "该联系请求已被处理,无法撤回"), req)
  }

  const deleted = await db
    .delete(contactRequests)
    .where(
      and(
        eq(contactRequests.id, id),
        eq(contactRequests.fromUserId, userId),
        eq(contactRequests.status, "pending")
      )
    )
    .returning({ id: contactRequests.id })

  if (deleted.length === 0) {
    return withCors(fail(409, "该联系请求已被处理,无法撤回"), req)
  }

  logger.info(LOG_PREFIX.CONTACT, "contact request cancelled", {
    requestId: id,
    fromUserId: userId,
    toUserId: request.toUserId,
  })

  return withCors(ok({ deleted: true }), req)
}
