import { and, desc, eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import { contactRequests, users, type ContactRequest } from "@/db/schema"
import type { ContactRequestDTO, Paginated } from "@/types/api"

/**
 * 联系请求(打招呼)的读写编排与 DTO 投影。
 *
 * 与 `lib/contacts.ts` 的分工:
 * - `lib/contacts.ts` 负责"联系方式可见性 / 关系状态 / 配额"这些判定逻辑;
 * - 本模块负责联系请求自身的 CRUD 编排与 DTO 组装,供
 *   `/api/contact-requests` 系列路由复用,避免三处路由各写一遍 JOIN。
 */

/** 列表方向:`incoming` 我收到的 / `outgoing` 我发出的 */
export type ContactRequestDirection = "incoming" | "outgoing"

/** 请求状态过滤,与列表 query 参数一致 */
export type ContactRequestStatusFilter =
  | "pending"
  | "accepted"
  | "rejected"
  | "all"

/** 列表项中的用户简要信息 */
type UserBrief = { id: string; name: string; avatarUrl: string | null }

/** 将请求行 + 双方用户简要信息投影为 ContactRequestDTO */
export function toContactRequestDTO(
  row: ContactRequest,
  fromUser: UserBrief,
  toUser: UserBrief
): ContactRequestDTO {
  return {
    id: row.id,
    fromUser,
    toUser,
    message: row.message ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
  }
}

/** 按 id 查询请求行(不存在返回 null) */
export async function findContactRequest(
  id: string
): Promise<ContactRequest | null> {
  const rows = await db
    .select()
    .from(contactRequests)
    .where(eq(contactRequests.id, id))
    .limit(1)
  return rows[0] ?? null
}

/** 批量查询用户简要信息,返回 id → UserBrief 映射 */
async function loadUserBriefs(userIds: string[]): Promise<Map<string, UserBrief>> {
  const map = new Map<string, UserBrief>()
  const unique = [...new Set(userIds)]
  if (unique.length === 0) return map

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(inArray(users.id, unique))

  rows.forEach((r) => map.set(r.id, { ...r, avatarUrl: r.avatarUrl ?? null }))
  return map
}

/**
 * 查询请求并附带双方用户简要信息。
 * 请求本身或任一方用户缺失时返回 null(用户被注销的场景)。
 */
export async function loadContactRequestDetail(
  id: string
): Promise<ContactRequestDTO | null> {
  const row = await findContactRequest(id)
  if (!row) return null

  const userMap = await loadUserBriefs([row.fromUserId, row.toUserId])
  const fromUser = userMap.get(row.fromUserId)
  const toUser = userMap.get(row.toUserId)
  if (!fromUser || !toUser) return null

  return toContactRequestDTO(row, fromUser, toUser)
}

export type ListContactRequestsParams = {
  userId: string
  direction: ContactRequestDirection
  status: ContactRequestStatusFilter
  page: number
  pageSize: number
}

/**
 * 分页列出某用户的联系请求(按创建时间倒序)。
 * 先分页取请求行,再批量补齐双方用户信息,避免 N+1。
 */
export async function listContactRequests(
  params: ListContactRequestsParams
): Promise<Paginated<ContactRequestDTO>> {
  const { userId, direction, status, page, pageSize } = params

  const where = [
    direction === "incoming"
      ? eq(contactRequests.toUserId, userId)
      : eq(contactRequests.fromUserId, userId),
    ...(status === "all" ? [] : [eq(contactRequests.status, status)]),
  ]

  // 一次性取该用户全部匹配请求(单用户量级很小),再批量补齐用户信息。
  // 关键:已注销用户会被过滤掉,故在内存中统一分页,
  // 保证 total 与 list 口径一致,避免末页因被过滤行而漏项。
  const rows = await db
    .select()
    .from(contactRequests)
    .where(and(...where))
    .orderBy(desc(contactRequests.createdAt))

  const userMap = await loadUserBriefs(
    rows.flatMap((r) => [r.fromUserId, r.toUserId])
  )

  const list = rows
    .map((r) => {
      const fromUser = userMap.get(r.fromUserId)
      const toUser = userMap.get(r.toUserId)
      if (!fromUser || !toUser) return null
      return toContactRequestDTO(r, fromUser, toUser)
    })
    .filter((x): x is ContactRequestDTO => x !== null)

  const total = list.length
  const start = (page - 1) * pageSize
  return {
    list: list.slice(start, start + pageSize),
    total,
    page,
    pageSize,
  }
}
