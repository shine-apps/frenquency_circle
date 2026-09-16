import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { activities } from "@/db/schema"
import { fail, isUuid, ok } from "@/lib/api"
import { requireTeacher } from "@/lib/auth-utils"
import {
  buildActivityUpdatePatch,
  cancelActivity,
  toActivityDTO,
  updateActivitySchema,
  type UpdateActivityInput,
} from "@/lib/activities"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ activityId: string }> }

/**
 * 教师后台活动操作的公共前置:鉴权 + 查活动 + 归属校验。
 *
 * 归属规则与圈子一致:创建者本人,或 ADMIN(代管)。
 * 通过时返回活动行;不通过时返回可直接 `return` 的响应。
 */
async function loadManageableActivity(activityId: string) {
  const guard = await requireTeacher()
  if (!guard.ok) return { ok: false as const, response: guard.response }

  // 路径参数必须是 uuid,否则 Postgres 抛 22P02 → 500
  if (!isUuid(activityId)) {
    return { ok: false as const, response: fail(400, "activityId 格式不正确") }
  }

  const [row] = await db
    .select()
    .from(activities)
    .where(eq(activities.id, activityId))
  if (!row) {
    return { ok: false as const, response: fail(404, "活动不存在") }
  }
  if (row.creatorId !== guard.userId && guard.role !== "ADMIN") {
    return { ok: false as const, response: fail(403, "只有活动发布者可以操作活动") }
  }
  return { ok: true as const, row, userId: guard.userId, role: guard.role }
}

/**
 * PATCH /api/teacher/activities/:activityId
 *
 * 老师编辑自己的活动(部分更新)。
 */
export async function PATCH(req: Request, context: RouteContext) {
  const { activityId } = await context.params

  const loaded = await loadManageableActivity(activityId)
  if (!loaded.ok) return loaded.response

  const body = await req.json().catch(() => null)
  const parsed = updateActivitySchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }
  const input = parsed.data as UpdateActivityInput
  if (Object.keys(input).length === 0) {
    return fail(400, "没有提供任何更新字段")
  }

  const [updated] = await db
    .update(activities)
    .set(buildActivityUpdatePatch(input))
    .where(eq(activities.id, activityId))
    .returning()

  logger.info(LOG_PREFIX.CIRCLE, "Teacher updated activity", {
    activityId,
    by: loaded.userId,
    role: loaded.role,
  })

  return ok(toActivityDTO(updated as typeof activities.$inferSelect))
}

/**
 * DELETE /api/teacher/activities/:activityId
 *
 * 软取消活动(置 `status=cancelled`,非硬删)。
 */
export async function DELETE(_req: Request, context: RouteContext) {
  const { activityId } = await context.params

  const loaded = await loadManageableActivity(activityId)
  if (!loaded.ok) return loaded.response

  await cancelActivity(activityId)

  logger.info(LOG_PREFIX.CIRCLE, "Teacher cancelled activity", {
    activityId,
    by: loaded.userId,
    role: loaded.role,
  })

  return ok({ id: activityId, status: "cancelled" })
}
