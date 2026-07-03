import { desc, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { users } from "@/db/schema"
import { UsersTable } from "./_components/users-table"
import type { UserDTO } from "@/types/api"

// SSR 用户列表单页上限，防止全量加载导致内存膨胀 / 慢查询。
// 完整分页可通过 /api/users 接口（已支持分页）消费。
const SSR_USER_LIMIT = 100

export default async function AdminUsersPage() {
  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(SSR_USER_LIMIT),
    db.select({ count: sql<number>`count(*)::int` }).from(users),
  ])

  const items: UserDTO[] = rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }))

  const total = Number(count)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          共 {total} 个用户{total > SSR_USER_LIMIT ? `（仅展示最近 ${SSR_USER_LIMIT} 条）` : ""}
        </p>
      </div>
      <UsersTable items={items} />
    </div>
  )
}
