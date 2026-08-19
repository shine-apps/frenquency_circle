import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { notifications, users, type NotificationType } from "@/db/schema"
import { logger, LOG_PREFIX } from "@/lib/logger"
import type { NotificationDTO, NotificationLinkTarget } from "@/types/api"

/**
 * 消息 / 通知服务。
 *
 * 设计要点(见计划文档 Design Decisions):
 * - 写入即扇出:直接 insert,与业务同请求顺序执行,不引入消息队列。
 * - 通知失败仅 log,不影响主流程(旁路 try/catch 吞掉异常)。
 * - `linkTarget` 必须双向过滤:用户侧只渲染 `miniprogram`,后台铃铛只渲染 `admin`。
 * - 所有文案中的人名 / 圈子名在创建时快照进字符串(见 Design Decision 13)。
 */

const LOG_CTX = { module: LOG_PREFIX.NOTIFICATION }

/** 插入单条通知所需的字段(不含系统生成字段)。 */
export type NewNotificationInput = {
  recipientId: string
  /** 触发者 id(可空) */
  actorId?: string | null
  /** 关联业务对象类型(可空),本期 'circle' */
  entityType?: "circle" | null
  /** 关联业务对象 id(可空) */
  entityId?: string | null
  type: NotificationType
  title: string
  content: string
  linkUrl?: string | null
  linkTarget?: NotificationLinkTarget
}

/** 内部:把一行 insert 转成通知行,保证旁路失败不抛出。 */
function toInsertValues(input: NewNotificationInput) {
  return {
    recipientId: input.recipientId,
    actorId: input.actorId ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    type: input.type,
    title: input.title,
    content: input.content,
    linkUrl: input.linkUrl ?? null,
    linkTarget: input.linkTarget ?? "miniprogram",
  }
}

/** 给单个用户发一条通知。失败仅 log,吞掉异常。 */
export async function notifyUser(input: NewNotificationInput): Promise<void> {
  try {
    await db.insert(notifications).values(toInsertValues(input))
  } catch (err) {
    logger.error(
      LOG_PREFIX.NOTIFICATION,
      "notifyUser failed",
      { ...LOG_CTX, recipientId: input.recipientId, type: input.type, err },
    )
  }
}

/**
 * 给所有 ADMIN 用户发通知(扇出)。
 * `excludeUserId` 传入时排除该用户(如建圈者本人是管理员时不自收)。
 */
export async function notifyAdmins(
  input: Omit<NewNotificationInput, "recipientId"> & {
    excludeUserId?: string
  },
): Promise<void> {
  try {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(
        input.excludeUserId
          ? and(eq(users.role, "ADMIN"), sql`${users.id} <> ${input.excludeUserId}`)
          : eq(users.role, "ADMIN"),
      )

    if (admins.length === 0) return

    await db.insert(notifications).values(
      admins.map((a) => toInsertValues({ ...input, recipientId: a.id })),
    )
  } catch (err) {
    logger.error(
      LOG_PREFIX.NOTIFICATION,
      "notifyAdmins failed",
      { ...LOG_CTX, type: input.type, excludeUserId: input.excludeUserId, err },
    )
  }
}

/** 把通知行投影为对外 DTO。 */
function toDTO(row: typeof notifications.$inferSelect): NotificationDTO {
  return {
    id: row.id,
    actorId: row.actorId,
    entityType: row.entityType,
    entityId: row.entityId,
    type: row.type,
    title: row.title,
    content: row.content,
    linkUrl: row.linkUrl,
    linkTarget: row.linkTarget,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  }
}

export type ListNotificationsParams = {
  recipientId: string
  linkTarget: NotificationLinkTarget
  page: number
  pageSize: number
  /** 仅返回未读 */
  unreadOnly?: boolean
}

/** 分页列出某用户的通知(按 linkTarget 过滤入口)。 */
export async function listNotifications(params: ListNotificationsParams) {
  const { recipientId, linkTarget, page, pageSize, unreadOnly } = params
  const where = [
    eq(notifications.recipientId, recipientId),
    eq(notifications.linkTarget, linkTarget),
    ...(unreadOnly ? [isNull(notifications.readAt)] : []),
  ]

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...where))
    .orderBy(desc(notifications.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(...where))

  return {
    list: rows.map(toDTO),
    total: count,
    page,
    pageSize,
  }
}

/** 未读数量(按 linkTarget 过滤入口)。 */
export async function getUnreadCount(
  recipientId: string,
  linkTarget: NotificationLinkTarget,
): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, recipientId),
        eq(notifications.linkTarget, linkTarget),
        isNull(notifications.readAt),
      ),
    )
  return count
}

/**
 * 标记单条已读。返回是否成功(越权 / 不存在返回 false)。
 * 越权保护:只能标记 recipientId 自己的通知。
 */
export async function markRead(
  notificationId: string,
  recipientId: string,
): Promise<boolean> {
  const result = await db
    .update(notifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.recipientId, recipientId),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id })
  return result.length > 0
}

/**
 * 标记某入口下全部已读(按 linkTarget 限定,避免误清后台通知)。
 * 返回被更新的条数。
 */
export async function markAllRead(
  recipientId: string,
  linkTarget: NotificationLinkTarget,
): Promise<number> {
  const result = await db
    .update(notifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(notifications.recipientId, recipientId),
        eq(notifications.linkTarget, linkTarget),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id })
  return result.length
}
