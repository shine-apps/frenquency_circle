import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/lib/db"
import { checkins } from "@/db/schema"
import { fail, isUuid, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { hydrateAdminCheckins } from "@/lib/checkins"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

/** 状态变更请求体：下架 deleted / 恢复 active */
const updateStatusSchema = z.object({
  status: z.enum(["active", "deleted"]),
})

/**
 * PATCH /api/admin/checkins/:id
 *
 * 管理员下架（status → deleted）或恢复（status → active）打卡。
 *
 * - 未登录 401；非管理员 403；id 非法 400；打卡不存在 404；
 * - 幂等：目标状态与当前一致时跳过写库，仍返回 200 + 最新 DTO；
 * - 与本表软删字段同源（C 端作者删除同样写 `deleted`），管理端可反向恢复。
 */
export async function PATCH(req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params
  if (!isUuid(id)) {
    return fail(400, "打卡 id 格式不正确")
  }

  const body = await req.json().catch(() => null)
  const parsed = updateStatusSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }
  const { status } = parsed.data

  const [row] = await db.select().from(checkins).where(eq(checkins.id, id))
  if (!row) {
    return fail(404, "打卡不存在")
  }

  // 状态未变化时跳过写库（幂等），但仍返回最新 DTO
  if (row.status !== status) {
    await db
      .update(checkins)
      .set({ status, updatedAt: new Date() })
      .where(eq(checkins.id, id))

    logger.info(
      LOG_PREFIX.CHECKIN,
      status === "deleted" ? "checkin removed by admin" : "checkin restored by admin",
      { checkinId: id, userId: row.userId, by: guard.userId }
    )
  }

  const [updated] = await db.select().from(checkins).where(eq(checkins.id, id))
  if (!updated) {
    // 并发边界：写入期间作者账号被删除（user_id 级联删除）导致记录消失
    return fail(404, "打卡不存在")
  }
  const [dto] = await hydrateAdminCheckins([updated])
  return ok(dto)
}
