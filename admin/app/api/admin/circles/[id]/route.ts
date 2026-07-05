import { z } from "zod"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles } from "@/db/schema"
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
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * 更新圈子状态请求体 schema。
 * - status: 可更新为 offline(下线)/ violated(违规)/ active(恢复)
 *
 * deleted 状态由创建者自己 DELETE 触发,管理员不通过此接口删除。
 */
const updateCircleStatusSchema = z.object({
  status: z.enum(["active", "offline", "violated"]),
})

/**
 * PATCH /api/admin/circles/:id
 *
 * 管理员更新圈子状态(下线 / 标记违规 / 恢复上线)。
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

  const { status } = parsed.data

  const [updated] = await db
    .update(circles)
    .set({ status, updatedAt: new Date() })
    .where(eq(circles.id, id))
    .returning()

  if (!updated) {
    return fail(404, "圈子不存在")
  }

  logger.info(LOG_PREFIX.ADMIN, "Circle status updated", {
    circleId: id,
    status,
    by: guard.userId,
  })

  return ok(toCircleDTO(updated))
}
