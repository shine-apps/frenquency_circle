import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/lib/db"
import { contactRequests, users } from "@/db/schema"
import { corsOptions, fail, ok, withCors, parsePagination } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { checkDailyQuota, findPendingRequestBetween } from "@/lib/contacts"
import {
  listContactRequests,
  loadContactRequestDetail,
  type ContactRequestDirection,
  type ContactRequestStatusFilter,
} from "@/lib/contact-requests"
import { notifyUser } from "@/lib/notifications"
import { logger, LOG_PREFIX } from "@/lib/logger"
import type { Paginated, ContactRequestDTO } from "@/types/api"

/** 发起打招呼的请求体 schema */
const createSchema = z.object({
  toUserId: z.string().uuid(),
  /** 留言(可空,≤100 字符);空串归一为 null */
  message: z.union([z.string().trim().max(100), z.literal("")]).optional(),
})

/** 列表方向参数 */
const DIRECTIONS: ContactRequestDirection[] = ["incoming", "outgoing"]
/** 列表状态过滤参数 */
const STATUS_FILTERS: ContactRequestStatusFilter[] = [
  "pending",
  "accepted",
  "rejected",
  "all",
]

/**
 * POST /api/contact-requests
 *
 * 向同趣的人发起"打招呼"请求。对方接受后双方互相解锁微信号。
 *
 * - 鉴权:任意登录用户
 * - 禁止向自己发起
 * - 同一对用户仅允许存在 1 条 pending(部分唯一索引兜底 + 应用层友好报错 409)
 * - 每用户每日(东八区)最多 10 次,超出返回 429
 * - 成功后通知接收方(`contact_request`),通知失败不影响主流程
 * - 返回 ContactRequestDTO
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const fromUserId = guard.user.id

  // 2. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  const toUserId = parsed.data.toUserId
  const message = parsed.data.message ? parsed.data.message : null

  // 3. 禁止向自己发起
  if (toUserId === fromUserId) {
    return withCors(fail(400, "不能向自己发起联系请求"), req)
  }

  // 4. 校验接收方存在
  const [target] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, toUserId))
    .limit(1)
  if (!target) {
    return withCors(fail(404, "用户不存在"), req)
  }

  // 5. 防重复:双方之间已存在待处理请求
  const pending = await findPendingRequestBetween(fromUserId, toUserId)
  if (pending) {
    return withCors(fail(409, "已发起过联系请求,请等待对方处理"), req)
  }

  // 6. 每日配额(防"发起→撤回→再发起"绕过上限)
  const quota = await checkDailyQuota(fromUserId)
  if (!quota.allowed) {
    logger.warn(LOG_PREFIX.CONTACT, "contact request quota exceeded", {
      fromUserId,
      used: quota.used,
      limit: quota.limit,
    })
    return withCors(fail(429, "今日发起的联系请求已达上限,请明天再试"), req)
  }

  // 7. 插入请求(部分唯一索引兜底并发场景)
  const inserted = await db
    .insert(contactRequests)
    .values({ fromUserId, toUserId, message })
    .onConflictDoNothing()
    .returning({ id: contactRequests.id })

  const createdId = inserted[0]?.id
  if (!createdId) {
    return withCors(fail(409, "已发起过联系请求,请等待对方处理"), req)
  }

  // 8. 通知接收方(旁路:失败不影响主流程)
  await notifyUser({
    recipientId: toUserId,
    actorId: fromUserId,
    entityType: "user",
    entityId: fromUserId,
    type: "contact_request",
    title: "新的联系请求",
    content: `${guard.user.name} 想和你一起练习,打个招呼吧`,
    linkUrl: "/pages/contact-requests/contact-requests",
    linkTarget: "miniprogram",
  })

  logger.info(LOG_PREFIX.CONTACT, "contact request sent", {
    requestId: createdId,
    fromUserId,
    toUserId,
    hasMessage: message !== null,
  })

  const dto = await loadContactRequestDetail(createdId)
  if (!dto) {
    return withCors(fail(500, "联系请求创建后读取失败"), req)
  }
  return withCors(ok(dto), req)
}

/**
 * GET /api/contact-requests
 *
 * 列出当前用户的联系请求(分页,按创建时间倒序)。
 * - `direction`: incoming(我收到的,默认) / outgoing(我发出的)
 * - `status`: pending / accepted / rejected / all(默认)
 */
export async function GET(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response

  // 2. 解析分页
  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }

  // 3. 解析方向与状态过滤(非法值回退默认,不因参数脏而报错)
  const rawDirection = url.searchParams.get("direction") ?? "incoming"
  const direction: ContactRequestDirection = DIRECTIONS.includes(
    rawDirection as ContactRequestDirection
  )
    ? (rawDirection as ContactRequestDirection)
    : "incoming"

  const rawStatus = url.searchParams.get("status") ?? "all"
  const status: ContactRequestStatusFilter = STATUS_FILTERS.includes(
    rawStatus as ContactRequestStatusFilter
  )
    ? (rawStatus as ContactRequestStatusFilter)
    : "all"

  const result: Paginated<ContactRequestDTO> = await listContactRequests({
    userId: guard.user.id,
    direction,
    status,
    page: pagination.page,
    pageSize: pagination.pageSize,
  })

  return withCors(ok(result), req)
}
