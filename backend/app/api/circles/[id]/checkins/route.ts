import { and, count, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { checkins, circles } from "@/db/schema"
import {
  corsOptions,
  fail,
  isUuid,
  ok,
  parsePagination,
  withCors,
} from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { hydrateCheckins } from "@/lib/checkins"
import type { CheckinDTO, Paginated } from "@/types/api"

type RouteContext = { params: Promise<{ id: string }> }

export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

/**
 * GET /api/circles/:id/checkins?page=&pageSize=
 *
 * 圈子打卡:该圈子下全部 active 打卡(含纯文字),按发布时间倒序分页。
 *
 * - 圈子不存在或已删除返回 404(避免对无效 id 返回空列表造成误导);
 * - 圈子被下线 / 违规时仍可查看历史打卡(仅 `deleted` 视为不存在)。
 */
export async function GET(req: Request, context: RouteContext) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response

  // 2. 校验路径参数
  const { id } = await context.params
  if (!isUuid(id)) {
    return withCors(fail(400, "圈子 id 格式不正确"), req)
  }

  // 3. 解析分页
  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }

  // 4. 校验圈子存在,并与 GET /api/circles/:id 的可见性口径保持一致:
  //    非创建者一律看不到非 active 圈子的打卡(审核中/未通过/已下线圈子不可被外部读取)
  const userId = guard.user.id
  const [circleRow] = await db
    .select({
      id: circles.id,
      status: circles.status,
      creatorId: circles.creatorId,
    })
    .from(circles)
    .where(eq(circles.id, id))
  if (
    !circleRow ||
    circleRow.status === "deleted" ||
    (circleRow.creatorId !== userId && circleRow.status !== "active")
  ) {
    return withCors(fail(404, "圈子不存在"), req)
  }

  // 5. 列表 + 总数(同口径)
  const where = and(eq(checkins.circleId, id), eq(checkins.status, "active"))

  const rows = await db
    .select()
    .from(checkins)
    .where(where)
    .orderBy(desc(checkins.createdAt))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize)

  const [totalRow] = await db
    .select({ value: count() })
    .from(checkins)
    .where(where)

  const list = await hydrateCheckins(rows)

  const result: Paginated<CheckinDTO> = {
    list,
    total: Number(totalRow?.value ?? 0),
    page: pagination.page,
    pageSize: pagination.pageSize,
  }
  return withCors(ok(result), req)
}
