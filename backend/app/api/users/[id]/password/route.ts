import { eq } from "drizzle-orm"
import { z } from "zod"
import bcrypt from "bcryptjs"

import { db } from "@/lib/db"
import { users } from "@/db/schema"
import { fail, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"

const passwordSchema = z.object({
  password: z.string().min(6).max(72),
})

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PATCH /api/users/[id]/password
 *
 * 管理员重置用户密码。
 * - 仅 ADMIN 角色可调用
 * - 新密码 6-72 位（bcrypt 输入上限 72 字节）
 * - 密码以 bcrypt 哈希落库，不回显明文
 */
export async function PATCH(req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params
  const body = await req.json().catch(() => null)
  const parsed = passwordSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }

  // 目标用户必须存在
  const target = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { id: true, email: true },
  })
  if (!target) return fail(404, "User not found")

  const passwordHash = await bcrypt.hash(parsed.data.password, 10)

  const [updated] = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning({ id: users.id })

  if (!updated) return fail(404, "User not found")

  logger.info(LOG_PREFIX.AUTH, "Admin reset user password", {
    targetUserId: id,
    targetEmail: target.email,
    operatorUserId: guard.userId,
  })

  return ok({ id: updated.id })
}
