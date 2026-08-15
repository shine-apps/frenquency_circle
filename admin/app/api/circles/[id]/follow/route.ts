import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles, circleFollows } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/circles/:id/follow
 *
 * 关注圈子(幂等)。仅 active 状态的圈子可被关注;已关注时直接返回 ok,不重复插入。
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

  // 2. 校验圈子存在且 active
  const [circleRow] = await db
    .select({ id: circles.id, status: circles.status })
    .from(circles)
    .where(eq(circles.id, id))
  if (!circleRow || circleRow.status !== "active") {
    return withCors(fail(404, "圈子不存在或已下线"), req)
  }

  // 3. 幂等插入:唯一索引 circle_follows_circle_user_idx 吸收重复关注,
  //    避免先查后插的 TOCTOU 竞态(与 seed.ts / account-service.ts 的 onConflictDoNothing 模式一致)
  await db
    .insert(circleFollows)
    .values({ circleId: id, userId })
    .onConflictDoNothing({
      target: [circleFollows.circleId, circleFollows.userId],
    })

  logger.info(LOG_PREFIX.CIRCLE, "Circle followed", { circleId: id, userId })
  return withCors(ok({ followed: true }), req)
}

/**
 * DELETE /api/circles/:id/follow
 *
 * 取消关注(幂等)。圈子不存在返回 404;未关注时直接返回 ok。
 */
export async function DELETE(req: Request, context: RouteContext) {
  const { id } = await context.params

  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 校验圈子存在
  const [circleRow] = await db
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.id, id))
  if (!circleRow) {
    return withCors(fail(404, "圈子不存在"), req)
  }

  // 3. 删除关注记录(幂等)
  await db
    .delete(circleFollows)
    .where(
      and(eq(circleFollows.circleId, id), eq(circleFollows.userId, userId))
    )

  logger.info(LOG_PREFIX.CIRCLE, "Circle unfollowed", { circleId: id, userId })
  return withCors(ok({ followed: false }), req)
}
