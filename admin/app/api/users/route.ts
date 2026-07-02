import type { NextRequest } from "next/server"
import { desc, eq, sql } from "drizzle-orm"
import bcrypt from "bcryptjs"
import { z } from "zod"

import { db } from "@/lib/db"
import { users } from "@/db/schema"
import { fail, ok, parsePagination } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import type { UserDTO, Paginated } from "@/types/api"

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string().min(6).max(100),
  role: z.enum(["ADMIN", "USER"]).default("USER"),
})

function toUserDTO(row: typeof users.$inferSelect): UserDTO {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
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

  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(users)
      .orderBy(desc(users.createdAt))
      .limit(pageSize)
      .offset(offset),
    db.select({ count: sql<number>`count(*)::int` }).from(users),
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
