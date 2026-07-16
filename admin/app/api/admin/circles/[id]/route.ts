import { z } from "zod"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles, teacherApplications, users } from "@/db/schema"
import { fail, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"
import type { CircleDTO } from "@/types/api"

type RouteContext = { params: Promise<{ id: string }> }

/** 将 circles 表行转换为 CircleDTO */
function toCircleDTO(row: typeof circles.$inferSelect): CircleDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    creatorId: row.creatorId,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    contactPhone: row.contactPhone,
    wechat: row.wechat,
    activityTime: row.activityTime,
    maxMembers: row.maxMembers,
    memberCount: row.memberCount,
    status: row.status,
    coverImages: row.coverImages ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * 更新圈子状态请求体 schema。
 * - status: 可更新为 active(审核通过/恢复上线)/ offline(下线)/ violated(违规)/ rejected(审核驳回)
 * - reviewNote: 审核备注(驳回原因等,可选)
 *
 * deleted 状态由创建者自己 DELETE 触发,管理员不通过此接口删除。
 * pending 状态由圈子创建时自动设置,管理员不通过此接口设置。
 */
const updateCircleStatusSchema = z.object({
  status: z.enum(["active", "offline", "violated", "rejected"]),
  reviewNote: z.string().max(500).optional(),
})

/**
 * PATCH /api/admin/circles/:id
 *
 * 管理员更新圈子状态(审核通过 / 驳回 / 下线 / 标记违规 / 恢复上线)。
 *
 * 审核联动逻辑:
 * - pending → active:若存在关联的 pending 状态 teacher_application,则升级用户为 TEACHER 并标记申请已通过
 * - → rejected:同步驳回关联的 teacher_application(若存在)
 *
 * 响应:`CircleDTO`(更新后的圈子)
 */
export async function PATCH(req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params

  const body = await req.json().catch(() => null)
  const parsed = updateCircleStatusSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }

  const { status, reviewNote } = parsed.data

  // 查询圈子当前状态(用于判断是否为 pending → active 的审核通过场景)
  const [current] = await db.select().from(circles).where(eq(circles.id, id))
  if (!current) {
    return fail(404, "圈子不存在")
  }

  const [updated] = await db
    .update(circles)
    .set({ status, updatedAt: new Date() })
    .where(eq(circles.id, id))
    .returning()

  // 审核通过(pending → active):联动处理 teacher_application
  if (current.status === "pending" && status === "active") {
    const [app] = await db
      .select()
      .from(teacherApplications)
      .where(eq(teacherApplications.circleId, id))
    if (app && app.status === "pending") {
      // 升级用户为 TEACHER
      await db
        .update(users)
        .set({ role: "TEACHER", updatedAt: new Date() })
        .where(eq(users.id, app.userId))
      // 标记申请已通过
      await db
        .update(teacherApplications)
        .set({
          status: "approved",
          reviewerId: guard.userId,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(teacherApplications.id, app.id))
      logger.info(LOG_PREFIX.ADMIN, "Teacher application approved", {
        circleId: id,
        userId: app.userId,
        by: guard.userId,
      })
    }
  }

  // 审核驳回(→ rejected):同步驳回 teacher_application
  if (status === "rejected") {
    await db
      .update(teacherApplications)
      .set({
        status: "rejected",
        reviewerId: guard.userId,
        reviewedAt: new Date(),
        reviewNote: reviewNote ?? null,
        updatedAt: new Date(),
      })
      .where(eq(teacherApplications.circleId, id))
  }

  logger.info(LOG_PREFIX.ADMIN, "Circle status updated", {
    circleId: id,
    status,
    by: guard.userId,
  })

  return ok(toCircleDTO(updated))
}
