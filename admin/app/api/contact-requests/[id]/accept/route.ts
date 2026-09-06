import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { contactRequests } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { findContactRequest, loadContactRequestDetail } from "@/lib/contact-requests"
import { notifyUser } from "@/lib/notifications"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/contact-requests/:id/accept
 *
 * 接受打招呼请求,双方此后互相解锁微信号。
 *
 * - 鉴权:仅接收方(`toUserId`)可操作,否则 403
 * - 条件更新 `status='pending'` + `.returning()` 保证重复点击幂等:
 *   已被处理的请求返回 409
 * - 已 accepted 的请求直接返回当前 DTO(幂等)
 * - 成功后通知发起方(`contact_accepted`)
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

  // 3. 越权校验:仅接收方可接受
  if (request.toUserId !== userId) {
    return withCors(fail(403, "无权处理该联系请求"), req)
  }

  // 4. 已接受 → 幂等返回
  if (request.status === "accepted") {
    const existing = await loadContactRequestDetail(id)
    return existing
      ? withCors(ok(existing), req)
      : withCors(fail(404, "联系请求不存在"), req)
  }

  // 5. 条件更新:仅 pending 可流转(并发重复点击时 returning 为空)
  const updated = await db
    .update(contactRequests)
    .set({ status: "accepted", respondedAt: new Date(), updatedAt: new Date() })
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

  // 6. 通知发起方(旁路)
  await notifyUser({
    recipientId: request.fromUserId,
    actorId: userId,
    entityType: "user",
    entityId: userId,
    type: "contact_accepted",
    title: "联系已建立",
    content: `${guard.user.name} 接受了你的联系请求,快去查看 TA 的微信号吧`,
    linkUrl: `/pages/user-home/user-home?id=${userId}`,
    linkTarget: "miniprogram",
  })

  logger.info(LOG_PREFIX.CONTACT, "contact request accepted", {
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
