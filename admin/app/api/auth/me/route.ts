import { and, eq, ne } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/lib/db"
import { users } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { readUserFromToken } from "@/lib/auth/session-token"
import { logger, LOG_PREFIX } from "@/lib/logger"
import type { UserDTO } from "@/types/api"

/**
 * 将 users 表行映射为 UserDTO。
 * 集中在此处避免 GET/PATCH 两处重复定义。
 */
function toUserDTO(row: typeof users.$inferSelect): UserDTO {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    avatarUrl: row.avatarUrl ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * PATCH /api/auth/me 请求体校验。
 * - name: 1-100 字符
 * - email: 合法邮箱,且不能与他人重复
 * - avatarUrl: 合法 http(s) URL 或空串(空串视为清除,落库存 null)
 * 全部可选,但至少要传 1 个字段(refine)。
 */
const patchMeSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    email: z.string().email().optional(),
    avatarUrl: z.union([z.string().url(), z.literal("")]).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "至少提供一个字段" })

/**
 * 获取当前登录用户(Token 模式)。
 *
 * 从 `Authorization: Bearer` 头解析 JWT 拿到用户 id,
 * 再查 DB 返回完整 UserDTO(含时间戳)。用于前端 App 启动时
 * 校验 token 有效性、刷新用户信息。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  const authUser = await readUserFromToken(req)
  if (!authUser) {
    return withCors(fail(401, "未登录或登录已过期"), req)
  }

  const row = await db.query.users.findFirst({
    where: eq(users.id, authUser.id),
  })
  if (!row) {
    logger.warn(LOG_PREFIX.AUTH, "me: user not found in db", {
      userId: authUser.id,
    })
    return withCors(fail(401, "用户不存在"), req)
  }

  return withCors(ok(toUserDTO(row)), req)
}

/**
 * 更新当前登录用户自己的资料(昵称 / 邮箱 / 头像 URL)。
 *
 * 鉴权复用 `readUserFromToken`(与 GET 一致,不依赖 NextAuth session 缓存)。
 * 邮箱修改会校验全局唯一性;头像空串归一为 null(数据库列可空)。
 */
export async function PATCH(req: Request) {
  const authUser = await readUserFromToken(req)
  if (!authUser) {
    return withCors(fail(401, "未登录或登录已过期"), req)
  }

  const body = await req.json().catch(() => null)
  const parsed = patchMeSchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  const { name, email, avatarUrl } = parsed.data

  // 邮箱被他人占用 → 409
  if (email !== undefined) {
    const exists = await db.query.users.findFirst({
      where: and(eq(users.email, email), ne(users.id, authUser.id)),
    })
    if (exists) {
      return withCors(fail(409, "Email already in use"), req)
    }
  }

  // 组装 update payload(avatarUrl 空串归一为 null)
  const updatePayload: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  }
  if (name !== undefined) updatePayload.name = name
  if (email !== undefined) updatePayload.email = email
  if (avatarUrl !== undefined) {
    updatePayload.avatarUrl = avatarUrl === "" ? null : avatarUrl
  }

  const [updated] = await db
    .update(users)
    .set(updatePayload)
    .where(eq(users.id, authUser.id))
    .returning()

  if (!updated) {
    return withCors(fail(404, "User not found"), req)
  }

  logger.info(LOG_PREFIX.AUTH, "me: profile updated", {
    userId: authUser.id,
    fields: Object.keys(parsed.data),
  })

  return withCors(ok(toUserDTO(updated)), req)
}
