import { desc, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { checkins } from "@/db/schema"
import {
  CHECKIN_STATUS_LABEL,
  parseCheckinStatusFilter,
} from "@/lib/checkin-status"
import { buildCheckinListWhere, hydrateAdminCheckins } from "@/lib/checkins"
import { CheckinsFilters } from "./_components/checkins-filters"
import { CheckinsPagination } from "./_components/checkins-pagination"
import { CheckinsTable } from "./_components/checkins-table"
import type { AdminCheckinItem } from "@/types/api"

// 每页条数（服务端分页，与 /api/admin/checkins 默认 pageSize 保持一致）
const PAGE_SIZE = 20

/**
 * 管理后台打卡管理页（server component）。
 *
 * 直接从 db 查询（不经 HTTP），列表**包含软删记录**以便管理员恢复；
 * 筛选条件（关键词 / 状态）与页码均来自 URL，由服务端分页查询，
 * 与 `GET /api/admin/checkins` 复用同一套条件构建与组装逻辑。
 */
export default async function AdminCheckinsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[]
    status?: string | string[]
    page?: string | string[]
  }>
}) {
  const params = await searchParams
  const rawQ = Array.isArray(params.q) ? params.q[0] : params.q
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page
  const q = (rawQ ?? "").trim()
  const status = parseCheckinStatusFilter(rawStatus)

  // 页码兜底：非法（非数字 / <1）时回到第 1 页
  const parsedPage = Number.parseInt(rawPage ?? "", 10)
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1
  const offset = (page - 1) * PAGE_SIZE

  // 列表条件 + 一次「按状态聚合」完成 Tabs 计数（口径与列表一致，均含当前关键词）。
  // 比两次独立 count 少一次表扫描；「全部」计数 = 正常 + 已删除（status 只有两种取值）。
  const where = buildCheckinListWhere({ status, keyword: q })
  const keywordWhere = buildCheckinListWhere({ status: null, keyword: q })

  const [rowList, statusCounts] = await Promise.all([
    db
      .select()
      .from(checkins)
      .where(where)
      .orderBy(desc(checkins.createdAt), desc(checkins.id))
      .limit(PAGE_SIZE)
      .offset(offset),
    db
      .select({ status: checkins.status, count: sql<number>`count(*)::int` })
      .from(checkins)
      .where(keywordWhere)
      .groupBy(checkins.status),
  ])

  const activeTotal = Number(
    statusCounts.find((row) => row.status === "active")?.count ?? 0
  )
  const deletedTotal = Number(
    statusCounts.find((row) => row.status === "deleted")?.count ?? 0
  )
  const total =
    status === "active"
      ? activeTotal
      : status === "deleted"
        ? deletedTotal
        : activeTotal + deletedTotal

  // 页码越界（手动改 URL 等）：回退到最后一页的数据，避免展示空白页
  let rows = rowList
  let currentPage = page
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
  if (total > 0 && page > lastPage) {
    currentPage = lastPage
    rows = await db
      .select()
      .from(checkins)
      .where(where)
      .orderBy(desc(checkins.createdAt), desc(checkins.id))
      .limit(PAGE_SIZE)
      .offset((lastPage - 1) * PAGE_SIZE)
  }

  const items: AdminCheckinItem[] = await hydrateAdminCheckins(rows)

  // 已生效的过滤条件（用于文案展示）
  const filters: string[] = []
  if (q) filters.push(`关键词 “${q}”`)
  if (status) filters.push(`状态 ${CHECKIN_STATUS_LABEL[status]}`)
  const hasFilter = filters.length > 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">打卡管理</h1>
        <p className="text-sm text-muted-foreground">
          {hasFilter
            ? `${filters.join("，")} 匹配到 ${total} 条打卡`
            : `共 ${total} 条打卡（含已删除）`}
        </p>
      </div>
      {/* key 绑定当前筛选条件：URL 变化（前进/后退）时重挂载，输入框自动回到 URL 值 */}
      <CheckinsFilters
        key={`${q}|${status ?? ""}`}
        keyword={q}
        status={status}
        counts={{ active: activeTotal, deleted: deletedTotal }}
      />
      <div className="space-y-3">
        <CheckinsTable
          items={items}
          emptyText={hasFilter ? "未找到匹配的打卡" : "暂无数据"}
        />
        <CheckinsPagination
          page={currentPage}
          totalPages={lastPage}
          total={total}
          keyword={q}
          status={status}
        />
      </div>
    </div>
  )
}
