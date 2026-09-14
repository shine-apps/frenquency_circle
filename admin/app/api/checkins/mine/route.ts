import { and, count, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { checkins } from "@/db/schema"
import { corsOptions, fail, ok, parsePagination, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { hydrateCheckins } from "@/lib/checkins"
import type { CheckinDTO, Paginated } from "@/types/api"

export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

/**
 * GET /api/checkins/mine?page=&pageSize=
 *
 * 我的打卡:当前用户发布过的全部 active 打卡(含纯文字),按发布时间倒序分页。
 *
 * 注意:静态段 `mine` 优先于动态段 `[id]`(与 /api/circles/mine 同理)。
 */
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

  // 3. 列表 + 总数(同口径)
  const where = and(
    eq(checkins.userId, userId),
    eq(checkins.status, "active")
  )

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
