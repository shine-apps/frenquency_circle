import { desc, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { checkins } from "@/db/schema"
import { fail, ok, parsePagination } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { parseCheckinStatusFilter } from "@/lib/checkin-status"
import { buildCheckinListWhere, hydrateAdminCheckins } from "@/lib/checkins"
import type { AdminCheckinListDTO } from "@/types/api"

/**
 * GET /api/admin/checkins
 *
 * 管理员查询打卡列表（分页，按 createdAt 倒序）。
 *
 * - 鉴权：NextAuth cookie 会话 + ADMIN 角色（`requireAdmin`），
 *   与 C 端 `/api/checkins/*`（Bearer token）是两套独立入口；
 * - 与 C 端列表不同，此处**包含软删记录**（管理员需要看到并恢复）；
 * - 查询参数：page / pageSize / status=active|deleted / q=关键词（正文或作者昵称）。
 */
export async function GET(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) return fail(400, "Invalid pagination")
  const { page, pageSize } = pagination
  const offset = (page - 1) * pageSize

  const status = parseCheckinStatusFilter(url.searchParams.get("status"))
  const q = (url.searchParams.get("q") ?? "").trim()
  const where = buildCheckinListWhere({ status, keyword: q })

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(checkins)
      .where(where)
      .orderBy(desc(checkins.createdAt), desc(checkins.id))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(checkins).where(where),
  ])

  const payload: AdminCheckinListDTO = {
    list: await hydrateAdminCheckins(rows),
    total: Number(count),
    page,
    pageSize,
  }
  return ok(payload)
}
