import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { users } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { readUserFromToken } from "@/lib/auth/session-token"
import { logger, LOG_PREFIX } from "@/lib/logger"
import type { UserDTO } from "@/types/api"

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

  const dto: UserDTO = {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
  return withCors(ok(dto), req)
}
