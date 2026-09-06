import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { contactRequests } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { findContactRequest, loadContactRequestDetail } from "@/lib/contact-requests"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/contact-requests/:id/reject
 *
 * 拒绝打招呼请求。拒绝后发起方可再次发起(受每日配额限制)。
 *
 * - 鉴权:仅接收方(`toUserId`)可操作,否则 403
 * - 条件更新 `status='pending'` 保证重复点击幂等,已处理返回 409
 * - 不发送通知(避免给发起方造成打扰与负面体验)
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request, context: RouteContext) {
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

  // 3. 越权校验:仅接收方可拒绝
  if (request.toUserId !== userId) {
    return withCors(fail(403, "无权处理该联系请求"), req)
  }

  // 4. 已拒绝 → 幂等返回
  if (request.status === "rejected") {
    const existing = await loadContactRequestDetail(id)
    return existing
      ? withCors(ok(existing), req)
      : withCors(fail(404, "联系请求不存在"), req)
  }

  // 5. 条件更新(已被接受 / 已处理的请求返回 409)
  const updated = await db
    .update(contactRequests)
    .set({ status: "rejected", respondedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(contactRequests.id, id),
        eq(contactRequests.toUserId, userId),
        eq(contactRequests.status, "pending")
      )
    )
    .returning({ id: contactRequests.id })

  if (updated.length === 0) {
    return withCors(fail(409, "该联系请求已被处理"), req)
  }

  logger.info(LOG_PREFIX.CONTACT, "contact request rejected", {
    requestId: id,
    fromUserId: request.fromUserId,
    toUserId: userId,
  })

  const dto = await loadContactRequestDetail(id)
  if (!dto) {
    return withCors(fail(500, "联系请求更新后读取失败"), req)
  }
  return withCors(ok(dto), req)
}
