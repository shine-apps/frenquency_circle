import type { NextRequest } from "next/server"
import { desc, eq, sql } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { z } from "zod"

import { db } from "@/lib/db"
import { users, DEFAULT_PRIVACY_SETTINGS } from "@/db/schema"
import { fail, ok, parsePagination } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { buildUserListWhere, parseUserSearchKeyword } from "@/lib/user-search"
import { parseUserRoleFilter } from "@/lib/user-role"
import type { UserDTO, UserRole, Paginated, PrivacySettings } from "@/types/api"

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(6).max(100),
  role: z.enum(["ADMIN", "USER", "TEACHER"]).default("USER"),
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
    tags: row.tags ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const pagination = parsePagination(req.nextUrl.searchParams)
  if (!pagination) return fail(400, "Invalid pagination")
  const { page, pageSize } = pagination
  const offset = (page - 1) * pageSize

  // 可选关键词：必须为完整邮箱或手机号，命中则精确匹配
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim()
  const matcher = parseUserSearchKeyword(q)
  if (q && matcher === null) {
    return fail(400, "搜索关键词需为完整的手机号或邮箱")
  }
  // 可选角色过滤：与关键词为 AND 关系
  const role = parseUserRoleFilter(req.nextUrl.searchParams.get("role"))
  const where = buildUserListWhere({ keyword: matcher, role })

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(users).where(where),
  ])

  const payload: Paginated<UserDTO> = {
    list: rows.map(toUserDTO),
    total: Number(count),
    page,
    pageSize,
  }
  return ok(payload)
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const body = await req.json().catch(() => null)
  const parsed = createUserSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }

  const { email, name, password, role } = parsed.data

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  })
  if (existing) {
    return fail(409, "Email already in use")
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const [created] = await db
    .insert(users)
    .values({ email, name, passwordHash, role })
    .returning()

  return ok(toUserDTO(created), { status: 201 })
}
