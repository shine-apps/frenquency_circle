import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { checkins } from "@/db/schema"
import { corsOptions, fail, isUuid, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { hydrateCheckins } from "@/lib/checkins"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

/**
 * GET /api/checkins/:id
 *
 * 打卡详情(分享落地页/从列表点入)。
 *
 * - 未登录 401;id 非法 400;
 * - 已软删除的打卡对外等同于「不存在」,统一返回 404,不泄漏历史数据。
 */
export async function GET(req: Request, context: RouteContext) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response

  // 2. 校验路径参数(非法 uuid 会在 Postgres 触发 22P02 → 500,提前拦成 400)
  const { id } = await context.params
  if (!isUuid(id)) {
    return withCors(fail(400, "打卡 id 格式不正确"), req)
  }

  // 3. 查询打卡本体
  const [row] = await db.select().from(checkins).where(eq(checkins.id, id))
  if (!row || row.status !== "active") {
    return withCors(fail(404, "打卡不存在或已删除"), req)
  }

  // 4. 批量补全作者与圈子标题(单条场景同样复用共享组装层)
  const [dto] = await hydrateCheckins([row])
  return withCors(ok(dto), req)
}

/**
 * DELETE /api/checkins/:id
 *
 * 作者软删除自己的打卡(status → `deleted`),删除后不再出现在广场 / 我的打卡 / 圈子打卡。
 *
 * - 未登录 401;id 非法 400;打卡不存在 404;非作者 403;
 * - 幂等:已删除再删一次仍返回 200,不重复写库。
 */
export async function DELETE(req: Request, context: RouteContext) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 校验路径参数(非法 uuid 会在 Postgres 触发 22P02 → 500,提前拦成 400)
  const { id } = await context.params
  if (!isUuid(id)) {
    return withCors(fail(400, "打卡 id 格式不正确"), req)
  }

  // 3. 查询归属
  const [row] = await db
    .select({ id: checkins.id, userId: checkins.userId, status: checkins.status })
    .from(checkins)
    .where(eq(checkins.id, id))
  if (!row) {
    return withCors(fail(404, "打卡不存在"), req)
  }
  if (row.userId !== userId) {
    return withCors(fail(403, "只能删除自己的打卡"), req)
  }

  // 4. 软删除(幂等:已删除则跳过写库)
  if (row.status === "active") {
    await db
      .update(checkins)
      .set({ status: "deleted", updatedAt: new Date() })
      .where(eq(checkins.id, id))
  }

  logger.info(LOG_PREFIX.CHECKIN, "checkin deleted", { checkinId: id, userId })
  return withCors(ok({ deleted: true }), req)
}
