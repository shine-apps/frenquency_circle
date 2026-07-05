import { and, eq, ne, desc } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles } from "@/db/schema"
import {
  corsOptions,
  fail,
  ok,
  withCors,
  parsePagination,
} from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import type { CircleDTO, Paginated } from "@/types/api"

/**
 * GET /api/circles/mine
 *
 * 返回当前用户创建的圈子列表(分页,排除已删除)。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 解析分页
  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }

  // 3. 查询当前用户创建的圈子(排除已删除)
  const rows = await db
    .select()
    .from(circles)
    .where(
      and(eq(circles.creatorId, userId), ne(circles.status, "deleted"))
    )
    .orderBy(desc(circles.createdAt))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize)

  // 4. 查询总数
  const allRows = await db
    .select({ id: circles.id })
    .from(circles)
    .where(
      and(eq(circles.creatorId, userId), ne(circles.status, "deleted"))
    )

  const list: CircleDTO[] = rows.map((row) => ({
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
  }))

  const result: Paginated<CircleDTO> = {
    list,
    total: allRows.length,
    page: pagination.page,
    pageSize: pagination.pageSize,
  }

  return withCors(ok(result), req)
}
