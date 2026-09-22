import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { activities } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"
import {
  buildActivityUpdatePatch,
  cancelActivity,
  toActivityDTO,
  updateActivitySchema,
  type UpdateActivityInput,
} from "@/lib/activities"

type RouteContext = {
  params: Promise<{
    activityId: string
  }>
}

/**
 * GET /api/activities/:activityId
 *
 * 活动详情。非创建者不可见已取消活动(返回 404)。
 */
export async function OPTIONS(req: Request, _ctx: RouteContext) {
  return corsOptions(req)
}

export async function GET(req: Request, context: RouteContext) {
  const { activityId } = await context.params

  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  const [row] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, activityId))
  if (!row) {
    return withCors(fail(404, "活动不存在"), req)
  }
  if (row.status === "cancelled" && row.creatorId !== userId) {
    return withCors(fail(404, "活动不存在"), req)
  }

  return withCors(ok(toActivityDTO(row)), req)
}

/**
 * PATCH /api/activities/:activityId
 *
 * 更新活动(仅发布者)。部分更新,返回更新后 DTO。
 */
export async function PATCH(req: Request, context: RouteContext) {
  const { activityId } = await context.params

  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  const [row] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, activityId))
  if (!row) {
    return withCors(fail(404, "活动不存在"), req)
  }
  if (row.creatorId !== userId) {
    return withCors(fail(403, "只有活动发布者可以编辑活动"), req)
  }

  const body = await req.json().catch(() => null)
  const parsed = updateActivitySchema.safeParse(body)
  if (!parsed.success) {
    return withCors(fail(400, "Invalid request body", parsed.error.flatten()), req)
  }
  const input = parsed.data as UpdateActivityInput
  if (Object.keys(input).length === 0) {
    return withCors(fail(400, "没有提供任何更新字段"), req)
  }

  const [updated] = await db
    .update(activities)
    .set(buildActivityUpdatePatch(input))
    .where(eq(activities.id, activityId))
    .returning()

  logger.info(LOG_PREFIX.CIRCLE, "Activity updated", {
    activityId,
    userId,
  })

  return withCors(ok(toActivityDTO(updated)), req)
}

/**
 * DELETE /api/activities/:activityId
 *
 * 软取消(置 status=cancelled),非硬删。仅发布者。
 */
export async function DELETE(req: Request, context: RouteContext) {
  const { activityId } = await context.params

  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  const [row] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, activityId))
  if (!row) {
    return withCors(fail(404, "活动不存在"), req)
  }
  if (row.creatorId !== userId) {
    return withCors(fail(403, "只有活动发布者可以取消活动"), req)
  }

  await cancelActivity(activityId)

  logger.info(LOG_PREFIX.CIRCLE, "Activity cancelled", {
    activityId,
    userId,
  })

  return withCors(ok({ id: activityId, status: "cancelled" }), req)
}
