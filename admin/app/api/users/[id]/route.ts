import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/lib/db"
import { users, DEFAULT_PRIVACY_SETTINGS } from "@/db/schema"
import { fail, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import type { UserDTO, UserRole, PrivacySettings } from "@/types/api"

const updateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  role: z.enum(["ADMIN", "USER", "TEACHER"]).optional(),
})

function toUserDTO(row: typeof users.$inferSelect): UserDTO {
  const privacySettings =
    (row.privacySettings as PrivacySettings | null) ?? DEFAULT_PRIVACY_SETTINGS
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    phone: row.phone ?? null,
    practiceYears: row.practiceYears ?? null,
    activityLevel: row.activityLevel as UserDTO["activityLevel"],
    privacySettings,
    location:
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude }
        : null,
    address: row.address ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params
  const row = await db.query.users.findFirst({ where: eq(users.id, id) })
  if (!row) return fail(404, "User not found")
  return ok(toUserDTO(row))
}

export async function PATCH(req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params
  const body = await req.json().catch(() => null)
  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }

  // 禁止管理员降级自己，避免自锁出后台
  if (
    id === guard.userId &&
    parsed.data.role !== undefined &&
    parsed.data.role !== "ADMIN"
  ) {
    return fail(400, "不能降级自己的管理员角色")
  }

  const [updated] = await db
    .update(users)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning()

  if (!updated) return fail(404, "User not found")
  return ok(toUserDTO(updated))
}

export async function DELETE(_req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params
  // 禁止管理员删除自己
  if (id === guard.userId) {
    return fail(400, "不能删除自己的账号")
  }

  const [deleted] = await db
    .delete(users)
    .where(eq(users.id, id))
    .returning({ id: users.id })

  if (!deleted) return fail(404, "User not found")
  return ok({ id: deleted.id })
}
