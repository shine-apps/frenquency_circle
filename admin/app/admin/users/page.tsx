import { desc } from "drizzle-orm"

import { db } from "@/lib/db"
import { users } from "@/db/schema"
import { UsersTable } from "./_components/users-table"
import type { UserDTO } from "@/types/api"

export default async function AdminUsersPage() {
  const rows = await db
    .select()
    .from(users)
    .orderBy(desc(users.createdAt))

  const items: UserDTO[] = rows.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          共 {items.length} 个用户
        </p>
      </div>
      <UsersTable items={items} />
    </div>
  )
}
