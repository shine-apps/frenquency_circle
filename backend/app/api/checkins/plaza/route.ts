import { and, count, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { checkins } from "@/db/schema"
import { corsOptions, fail, ok, parsePagination, withCors } from "@/lib/api"
import { readUserFromToken } from "@/lib/auth/session-token"
import { hasMediaCondition, hydrateCheckins } from "@/lib/checkins"
import type { CheckinDTO, Paginated } from "@/types/api"

/** 游客免登录预览时允许的单页最大条数(登录用户仍按 parsePagination 上限 100) */
const GUEST_PREVIEW_PAGE_SIZE = 20

export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

/**
 * GET /api/checkins/plaza?page=&pageSize=
 *
 * 打卡广场:仅返回「含图片或视频」的 active 打卡,按发布时间倒序分页。
 * 纯文字打卡不进入广场(需求第 4 条)。
 *
 * 鉴权(可选):游客可预览**第一页**,翻页(page > 1)必须登录,
 * 未登录翻页返回 401。该规则在服务端强制,前端只是提前引导登录。
 *
 * 注意:静态段 `plaza` 优先于动态段 `[id]`,不会被 DELETE /api/checkins/:id 捕获。
 */
export async function GET(req: Request) {
  // 1. 解析分页
  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }

  // 2. 可选鉴权:游客只放行第一页(预览),翻页需要登录
  const authUser = await readUserFromToken(req)
  if (!authUser && pagination.page > 1) {
    return withCors(fail(401, "登录后可查看更多打卡"), req)
  }
  // 游客预览同时夹紧单页条数,避免 ?page=1&pageSize=100 绕过「只预览一页」的产品约束
  if (!authUser && pagination.pageSize > GUEST_PREVIEW_PAGE_SIZE) {
    pagination.pageSize = GUEST_PREVIEW_PAGE_SIZE
  }

  // 3. 列表 + 总数(同口径,交给数据库 count)
  const where = and(eq(checkins.status, "active"), hasMediaCondition())

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
