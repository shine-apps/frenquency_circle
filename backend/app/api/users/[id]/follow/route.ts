import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { userFollows, users } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { notifyUser } from "@/lib/notifications"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/users/:id/follow
 *
 * 关注同趣的人(幂等)。已关注时直接返回 ok,不重复插入。
 * 首次关注会通知被关注者(`user_followed`)。禁止关注自己。
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

  // 2. 禁止关注自己
  if (userId === id) {
    return withCors(fail(400, "不能关注自己"), req)
  }

  // 3. 校验目标用户存在(并取昵称用于通知文案)
  const [target] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
  if (!target) {
    return withCors(fail(404, "用户不存在"), req)
  }

  // 4. 幂等插入:唯一索引 user_follows_user_target_idx 吸收重复关注,
  //    避免先查后插的 TOCTOU 竞态(与圈子关注同一范式)
  const inserted = await db
    .insert(userFollows)
    .values({ userId, targetUserId: id })
    .onConflictDoNothing({
      target: [userFollows.userId, userFollows.targetUserId],
    })
    .returning({ id: userFollows.id })

  const isFirstFollow = inserted.length > 0

  // 5. 首次关注时通知被关注者(actorId = 关注者)
  if (isFirstFollow) {
    const [follower] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1)
    const followerName = follower?.name ?? "有人"

    await notifyUser({
      recipientId: id,
      actorId: userId,
      entityType: "user",
      entityId: userId,
      type: "user_followed",
      title: "有人关注了你",
      content: `${followerName} 关注了你,回看 TA 的主页打个招呼吧`,
      linkUrl: `/pages/user-home/user-home?id=${userId}`,
      linkTarget: "miniprogram",
    })
  }

  logger.info(LOG_PREFIX.CONTACT, "user followed", {
    userId,
    targetId: id,
    isFirstFollow,
  })

  return withCors(ok({ followed: true }), req)
}

/**
 * DELETE /api/users/:id/follow
 *
 * 取消关注(幂等)。用户不存在返回 404;未关注时直接返回 ok。
 */
export async function DELETE(req: Request, context: RouteContext) {
  const { id } = await context.params

  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 校验目标用户存在
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)
  if (!target) {
    return withCors(fail(404, "用户不存在"), req)
  }

  // 3. 删除关注记录(幂等)
  await db
    .delete(userFollows)
    .where(
      and(eq(userFollows.userId, userId), eq(userFollows.targetUserId, id))
    )

  logger.info(LOG_PREFIX.CONTACT, "user unfollowed", { userId, targetId: id })

  return withCors(ok({ followed: false }), req)
}
