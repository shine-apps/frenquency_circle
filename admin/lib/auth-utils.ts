import { NextResponse } from "next/server"

import { auth } from "@/auth"
import { fail, withCors } from "@/lib/api"
import { readUserFromToken } from "@/lib/auth/session-token"
import type { AuthUser } from "@/types/api"

export type AuthGuardResult =
  | { ok: true; userId: string; role: string }
  | { ok: false; response: Response }

export async function requireAdmin(): Promise<AuthGuardResult> {
  const session = await auth()
  if (!session?.user?.id) {
    return {
      ok: false,
      response: fail(401, "Unauthorized"),
    }
  }
  if (session.user.role !== "ADMIN") {
    return {
      ok: false,
      response: fail(403, "Forbidden: admin role required"),
    }
  }
  return {
    ok: true,
    userId: session.user.id,
    role: session.user.role,
  }
}

/**
 * Token 模式会话守卫结果。
 * - 成功:`{ user: AuthUser }`
 * - 失败:`{ response: NextResponse }`(已带 CORS 头,可直接 return)
 *
 * 用于非 admin 业务接口(普通登录用户即可访问),
 * 与 `/api/auth/me`、`/api/upload` 一致地走 `readUserFromToken(req)`。
 */
export type SessionGuardResult =
  | { user: AuthUser }
  | { response: NextResponse }

/**
 * 校验请求的 Bearer token,从中解析出当前登录用户。
 *
 * 与 `requireAdmin` 的区别:
 * - `requireAdmin` 走 NextAuth cookie session,适用于 admin Web(/admin/*)后台
 * - `requireSession(req)` 走 JWT Bearer token,适用于小程序 / H5 业务接口
 *
 * 调用方式:
 * ```ts
 * const guard = await requireSession(req)
 * if ("response" in guard) return guard.response
 * const userId = guard.user.id
 * ```
 */
export async function requireSession(
  req: Request
): Promise<SessionGuardResult> {
  const authUser = await readUserFromToken(req)
  if (!authUser) {
    return {
      response: withCors(fail(401, "未登录或登录已过期"), req),
    }
  }
  return { user: authUser }
}
