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
  /** 手机号(可空,空串按 null 处理) */
  phone: z.string().max(30).nullable().optional(),
  /** 练习年限(可空,仅整数 0-100) */
  practiceYears: z.number().int().min(0).max(100).nullable().optional(),
  /** 活跃度等级 */
  activityLevel: z.enum(["low", "medium", "high"]).optional(),
  /** 地址文本(可空) */
  address: z.string().max(255).nullable().optional(),
  /** 经纬度位置(可空,成对设置;与 address 通常一起更新) */
  location: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .nullable()
    .optional(),
  /** 头像 URL(可空) */
  avatarUrl: z.string().max(500).nullable().optional(),
  /** 隐私设置 */
  privacySettings: z
    .object({
      allowMatch: z.boolean(),
      publicContact: z.boolean(),
      locationPrecision: z.enum(["exact", "community", "region"]),
    })
    .optional(),
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

  // 空串归一化为 null，避免存下无意义空字符串
  const data: Record<string, unknown> = { ...parsed.data }
  if (data.phone === "") data.phone = null
  if (data.address === "") data.address = null
  if (data.avatarUrl === "") data.avatarUrl = null

  // location 对象展开为 latitude / longitude 双列，成对清空或设置
  if ("location" in data) {
    const loc = data.location
    if (loc === null || loc === undefined) {
      data.latitude = null
      data.longitude = null
    } else {
      const { latitude, longitude } = loc as {
        latitude: number
        longitude: number
      }
      data.latitude = latitude
      data.longitude = longitude
    }
    delete data.location
  }

  const [updated] = await db
    .update(users)
    .set({ ...(data as typeof users.$inferInsert), updatedAt: new Date() })
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
