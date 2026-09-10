import { desc, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { users, DEFAULT_PRIVACY_SETTINGS } from "@/db/schema"
import { buildUserListWhere, parseUserSearchKeyword } from "@/lib/user-search"
import { parseUserRoleFilter, USER_ROLE_LABEL } from "@/lib/user-role"
import { UsersTable } from "./_components/users-table"
import { UsersSearch } from "./_components/users-search"
import { UsersPagination } from "./_components/users-pagination"
import type { UserDTO, UserRole, PrivacySettings } from "@/types/api"

// 每页条数（服务端分页，与 /api/users 默认 pageSize 保持一致）
const PAGE_SIZE = 20

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[]
    role?: string | string[]
    page?: string | string[]
  }>
}) {
  const params = await searchParams
  const rawQ = Array.isArray(params.q) ? params.q[0] : params.q
  const rawRole = Array.isArray(params.role) ? params.role[0] : params.role
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page
  const q = (rawQ ?? "").trim()
  const role = parseUserRoleFilter(rawRole)

  // 页码兜底：非法（非数字 / <1）时回到第 1 页
  const parsedPage = Number.parseInt(rawPage ?? "", 10)
  const page = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : 1
  const offset = (page - 1) * PAGE_SIZE

  // 关键词必须是完整邮箱或手机号，否则视为非法输入且不执行查询
  const matcher = parseUserSearchKeyword(q)
  const invalidQuery = q.length > 0 && matcher === null
  const where = buildUserListWhere({ keyword: matcher, role })

  // 非法关键词直接返回空结果，不执行查询
  let rows: (typeof users.$inferSelect)[] = []
  let total = 0
  let currentPage = page
  if (!invalidQuery) {
    const [rowList, [{ count }]] = await Promise.all([
      db
        .select()
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(PAGE_SIZE)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(users).where(where),
    ])
    rows = rowList
    total = Number(count)

    // 页码越界（手动改 URL 等）：回退到最后一页的数据，避免展示空白页
    const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE))
    if (total > 0 && page > lastPage) {
      currentPage = lastPage
      rows = await db
        .select()
        .from(users)
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(PAGE_SIZE)
        .offset((lastPage - 1) * PAGE_SIZE)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  // 已生效的过滤条件（用于文案展示）
  const filters: string[] = []
  if (q) filters.push(`关键词 “${q}”`)
  if (role) filters.push(`角色 ${USER_ROLE_LABEL[role]}`)
  const hasFilter = filters.length > 0

  const items: UserDTO[] = rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as UserRole,
    phone: u.phone ?? null,
    practiceYears: u.practiceYears ?? null,
    activityLevel: u.activityLevel as UserDTO["activityLevel"],
    privacySettings:
      (u.privacySettings as PrivacySettings | null) ?? DEFAULT_PRIVACY_SETTINGS,
    location:
      u.latitude !== null && u.longitude !== null
        ? { latitude: u.latitude, longitude: u.longitude }
        : null,
    address: u.address ?? null,
    tags: u.tags ?? [],
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          {invalidQuery
            ? "搜索关键词需为完整的手机号或邮箱"
            : hasFilter
              ? `${filters.join("，")} 匹配到 ${total} 个用户`
              : `共 ${total} 个用户`}
        </p>
      </div>
      {/* key 绑定当前筛选条件：URL 变化（前进/后退）时重挂载，输入框自动回到 URL 值 */}
      <UsersSearch
        key={`${q}|${role ?? ""}`}
        defaultValue={q}
        defaultRole={role ?? ""}
        invalid={invalidQuery}
      />
      <div className="space-y-3">
        <UsersTable
          items={items}
          emptyText={
            invalidQuery
              ? "请输入完整的手机号或邮箱"
              : hasFilter
                ? "未找到匹配的用户"
                : "暂无数据"
          }
        />
        {/* 关键词非法时未执行查询，不展示分页信息 */}
        {invalidQuery ? null : (
          <UsersPagination
            page={currentPage}
            totalPages={totalPages}
            total={total}
            keyword={q}
            role={role ?? ""}
          />
        )}
      </div>
    </div>
  )
}
