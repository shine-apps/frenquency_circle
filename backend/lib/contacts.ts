import { and, desc, eq, gte, or } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  contactRequests,
  userFollows,
  users,
  type ContactRequest,
} from "@/db/schema"
import { startOfChinaDay } from "@/lib/interest-events"
import type { ContactVisibility, UserRelation } from "@/types/api"

/**
 * 人-人联系领域服务。
 *
 * 只做三件事,供公开主页 / 查看联系方式 / 联系请求列表等所有读路径复用:
 * 1. `resolveUserContact` 一次性算出"联系方式可见性 + 双方关系",
 *    隐私规则集中在此,杜绝多处判断漂移;
 * 2. `deriveContactStatus` 纯函数推导请求状态(便于单测);
 * 3. 配额与防重复校验(`checkDailyQuota` / `findPendingRequestBetween`)。
 *
 * 手机号(users.phone)是登录实名凭证,默认不对外暴露;
 * 仅在"双方已建立联系(互相接受打招呼) / 本人查看"且微信号缺失时,
 * 才作为兜底联系方式(phone)随可见性一并返回。
 */

/** 同一用户每个自然日(东八区)最多发起的打招呼次数,防骚扰 */
export const DAILY_CONTACT_REQUEST_LIMIT = 10

/** 单个对象上扫描的历史请求条数上限(仅用于状态推导,用户间交互量极小) */
const REQUEST_SCAN_LIMIT = 20

export type ResolvedContact = {
  visibility: ContactVisibility
  relation: UserRelation
}

/** 微信号归一化:去空白,空串视为未填写 */
function normalizeWechat(value: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

/**
 * 从双方历史请求推导关系状态。
 *
 * 优先级:accepted(一旦建立即永久解锁) > pending > rejected > none。
 * `rows` 需按 createdAt 倒序传入,取第一条作为"最近一次"。
 */
export function deriveContactStatus(
  rows: Pick<ContactRequest, "id" | "fromUserId" | "toUserId" | "status">[],
  viewerId: string
): Pick<UserRelation, "contactStatus" | "requestId"> {
  const latest = rows[0]
  if (!latest) return { contactStatus: "none", requestId: null }

  const accepted = rows.find((r) => r.status === "accepted")
  if (accepted) return { contactStatus: "accepted", requestId: accepted.id }

  const pending = rows.find((r) => r.status === "pending")
  if (pending) {
    return pending.fromUserId === viewerId
      ? { contactStatus: "pending_sent", requestId: pending.id }
      : { contactStatus: "pending_received", requestId: pending.id }
  }

  return {
    contactStatus: latest.status === "rejected" ? "rejected" : "none",
    requestId: null,
  }
}

/** 按可见性判定规则解析联系方式(不含数据库访问,便于单测) */
function resolveVisibility(
  isSelf: boolean,
  wechat: string | null,
  phone: string | null,
  hasAccepted: boolean
): ContactVisibility {
  // 本人查看自己:微信优先,缺失则兜底手机号
  if (isSelf) {
    const contactType = wechat ? "wechat" : phone ? "phone" : null
    return {
      visible: true,
      wechat: wechat ?? null,
      phone: phone ?? null,
      contactType,
      reason: "self",
    }
  }

  // 双方已建立联系(互相接受打招呼)→ 有权查看,微信优先、否则兜底手机号
  if (hasAccepted) {
    if (wechat)
      return { visible: true, wechat, phone: null, contactType: "wechat", reason: "accepted" }
    if (phone)
      return { visible: true, wechat: null, phone, contactType: "phone", reason: "accepted" }
    return { visible: false, wechat: null, phone: null, contactType: null, reason: "not_provided" }
  }

  // 未建立联系:不泄露任何联系方式(对方是否公开联系方式不影响本规则);
  // 但只要对方留了任一联系方式(微信/手机号),都应允许打招呼,
  // 对方接受后即可解锁,不能判定为"未填写"
  return {
    visible: false,
    wechat: null,
    phone: null,
    contactType: null,
    reason: wechat || phone ? "need_request" : "not_provided",
  }
}

/**
 * 解析查看者对目标用户的联系方式可见性与人-人关系。
 *
 * 三次查询并行:目标用户行(wechat + phone) / 双方历史请求 / 关注记录。
 * 目标用户不存在时返回 not_provided 可见性与默认关系(由调用方决定是否 404)。
 */
export async function resolveUserContact(
  viewerId: string,
  targetUserId: string
): Promise<ResolvedContact> {
  const isSelf = viewerId === targetUserId

  const [targetRow, requestRows, followRow] = await Promise.all([
    db
      .select({
        id: users.id,
        wechat: users.wechat,
        phone: users.phone,
      })
      .from(users)
      .where(eq(users.id, targetUserId))
      .then((rows) => rows[0] ?? null),
    db
      .select({
        id: contactRequests.id,
        fromUserId: contactRequests.fromUserId,
        toUserId: contactRequests.toUserId,
        status: contactRequests.status,
      })
      .from(contactRequests)
      .where(
        or(
          and(
            eq(contactRequests.fromUserId, viewerId),
            eq(contactRequests.toUserId, targetUserId)
          ),
          and(
            eq(contactRequests.fromUserId, targetUserId),
            eq(contactRequests.toUserId, viewerId)
          )
        )
      )
      .orderBy(desc(contactRequests.createdAt))
      .limit(REQUEST_SCAN_LIMIT),
    db
      .select({ id: userFollows.id })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.userId, viewerId),
          eq(userFollows.targetUserId, targetUserId)
        )
      )
      .then((rows) => rows[0] ?? null),
  ])

  const status = deriveContactStatus(requestRows, viewerId)
  const relation: UserRelation = {
    followed: followRow !== null,
    contactStatus: status.contactStatus,
    requestId: status.requestId,
  }

  if (!targetRow) {
    return {
      visibility: { visible: false, wechat: null, phone: null, contactType: null, reason: "not_provided" },
      relation,
    }
  }

  return {
    visibility: resolveVisibility(
      isSelf,
      normalizeWechat(targetRow.wechat),
      targetRow.phone ?? null,
      status.contactStatus === "accepted"
    ),
    relation,
  }
}

/**
 * 查询两个用户之间待处理的请求(任意方向)。
 * 用于发起前给出友好提示,真正的防重由
 * `contact_requests_pending_pair_idx` 部分唯一索引兜底。
 */
export async function findPendingRequestBetween(
  userA: string,
  userB: string
): Promise<{ id: string; fromUserId: string; toUserId: string } | null> {
  const rows = await db
    .select({
      id: contactRequests.id,
      fromUserId: contactRequests.fromUserId,
      toUserId: contactRequests.toUserId,
    })
    .from(contactRequests)
    .where(
      and(
        eq(contactRequests.status, "pending"),
        or(
          and(
            eq(contactRequests.fromUserId, userA),
            eq(contactRequests.toUserId, userB)
          ),
          and(
            eq(contactRequests.fromUserId, userB),
            eq(contactRequests.toUserId, userA)
          )
        )
      )
    )
    .limit(1)
  return rows[0] ?? null
}

export type ContactQuota = {
  allowed: boolean
  /** 当日已发起次数 */
  used: number
  limit: number
}

/**
 * 校验当日(东八区)发起打招呼的配额。
 * 仅统计 createdAt 在今日零点之后的请求,不区分状态——
 * 防止"发起→撤回→再发起"绕过每日上限。
 */
export async function checkDailyQuota(
  userId: string,
  now: Date = new Date()
): Promise<ContactQuota> {
  const rows = await db
    .select({ id: contactRequests.id })
    .from(contactRequests)
    .where(
      and(
        eq(contactRequests.fromUserId, userId),
        gte(contactRequests.createdAt, startOfChinaDay(now))
      )
    )

  const used = rows.length
  return {
    allowed: used < DAILY_CONTACT_REQUEST_LIMIT,
    used,
    limit: DAILY_CONTACT_REQUEST_LIMIT,
  }
}
