import { and, count, eq, ne, desc } from "drizzle-orm"

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
import { toCircleDTO } from "@/lib/circles"
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

  // 4. 查询总数(与列表同口径,交给数据库 count)
  const [totalRow] = await db
    .select({ value: count() })
    .from(circles)
    .where(
      and(eq(circles.creatorId, userId), ne(circles.status, "deleted"))
    )

  const list: CircleDTO[] = rows.map(toCircleDTO)

  const result: Paginated<CircleDTO> = {
    list,
    total: Number(totalRow?.value ?? 0),
    page: pagination.page,
    pageSize: pagination.pageSize,
  }

  return withCors(ok(result), req)
}
