import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { courseFollows, courses, users } from "@/db/schema"
import { corsOptions, fail, isUuid, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"
import { notifyUser } from "@/lib/notifications"

type RouteContext = { params: Promise<{ courseId: string }> }

/**
 * POST /api/courses/:courseId/follow
 *
 * 关注视频课程(幂等)。仅 `active`(已上线)的课程可被关注;
 * 已关注时直接返回 ok,不重复插入、不重复通知。
 * 首次关注会通知课程创建者(`course_followed`,本人创建者不通知)。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request, context: RouteContext) {
  const { courseId } = await context.params

  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 路径参数必须是 uuid,否则 Postgres 抛 22P02 → 500
  if (!isUuid(courseId)) {
    return withCors(fail(400, "courseId 格式不正确"), req)
  }

  // 3. 校验课程存在且已上线(并取 creatorId / title 用于通知)
  const [courseRow] = await db
    .select({
      id: courses.id,
      status: courses.status,
      creatorId: courses.creatorId,
      title: courses.title,
    })
    .from(courses)
    .where(eq(courses.id, courseId))
  if (!courseRow || courseRow.status !== "active") {
    return withCors(fail(404, "课程不存在或已下线"), req)
  }

  // 4. 幂等插入:唯一索引 course_follows_course_user_idx 吸收重复关注,
  //    避免先查后插的 TOCTOU 竞态;用 .returning() 判断是否为首次关注。
  const inserted = await db
    .insert(courseFollows)
    .values({ courseId, userId })
    .onConflictDoNothing({
      target: [courseFollows.courseId, courseFollows.userId],
    })
    .returning({ id: courseFollows.id })

  const isFirstFollow = inserted.length > 0

  // 5. 首次关注且非创建者本人时,通知课程创建者(actorId=关注者)
  if (isFirstFollow && courseRow.creatorId !== userId) {
    const [follower] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
    const followerName = follower?.name ?? "有人"
    await notifyUser({
      recipientId: courseRow.creatorId,
      actorId: userId,
      entityType: "course",
      entityId: courseId,
      type: "course_followed",
      title: "有人关注了你的课程",
      content: `${followerName} 关注了你发布的课程「${courseRow.title}」`,
      linkUrl: `/pages/course-detail/course-detail?id=${courseId}`,
      linkTarget: "miniprogram",
    })
  }

  logger.info(LOG_PREFIX.COURSE, "Course followed", {
    courseId,
    userId,
    isFirstFollow,
  })
  return withCors(ok({ followed: true }), req)
}

/**
 * DELETE /api/courses/:courseId/follow
 *
 * 取消关注(幂等)。课程不存在 / 非法 id 返回 404 / 400;未关注时直接返回 ok。
 */
export async function DELETE(req: Request, context: RouteContext) {
  const { courseId } = await context.params

  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 路径参数必须是 uuid
  if (!isUuid(courseId)) {
    return withCors(fail(400, "courseId 格式不正确"), req)
  }

  // 3. 校验课程存在(已下线的课程也允许取关,避免关注页残留无法清理)
  const [courseRow] = await db
    .select({ id: courses.id })
    .from(courses)
    .where(eq(courses.id, courseId))
  if (!courseRow) {
    return withCors(fail(404, "课程不存在"), req)
  }

  // 4. 删除关注记录(幂等)
  await db
    .delete(courseFollows)
    .where(
      and(eq(courseFollows.courseId, courseId), eq(courseFollows.userId, userId))
    )

  logger.info(LOG_PREFIX.COURSE, "Course unfollowed", { courseId, userId })
  return withCors(ok({ followed: false }), req)
}
