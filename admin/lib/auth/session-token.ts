import { getToken } from "next-auth/jwt"
import type { AuthUser } from "@/types/api"

/**
 * Session cookie 名称(开发环境 HTTP)。
 * 生产 HTTPS 环境对应 `__Secure-next-auth.session-token`。
 */
const SESSION_COOKIE_NAMES = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
] as const

type HeadersWithSetCookie = Headers & { getSetCookie?: () => string[] }

/**
 * 从 signIn 返回的 Response 中提取 session token。
 *
 * `signIn(provider, { redirect: false })` 成功时返回带 `Set-Cookie` 头的 Response,
 * 形如 `next-auth.session-token=<JWT>; Path=/; HttpOnly; SameSite=Lax`。
 * 本函数解析出 JWT 字符串,用于回传给小程序客户端(Token 模式)。
 */
export function extractSessionToken(res: Response): string | null {
  const headers = res.headers as HeadersWithSetCookie
  const cookies: string[] = []

  // 优先用 getSetCookie()(Node 18+ / undici),回退到 get("set-cookie")
  if (typeof headers.getSetCookie === "function") {
    cookies.push(...headers.getSetCookie())
  } else {
    const raw = res.headers.get("set-cookie")
    if (raw) cookies.push(raw)
  }

  for (const cookie of cookies) {
    const [pair] = cookie.split(";")
    const eq = pair.indexOf("=")
    if (eq < 0) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    if (
      SESSION_COOKIE_NAMES.includes(
        name as (typeof SESSION_COOKIE_NAMES)[number]
      )
    ) {
      return value
    }
  }
  return null
}

/**
 * 从请求头读取 Bearer token。
 */
export function readBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization")
  if (!auth) return null
  const match = /^Bearer\s+(.+)$/i.exec(auth)
  return match ? match[1].trim() : null
}

/**
 * 从请求的 Bearer token 解析出当前用户。
 *
 * 利用 Auth.js v5 的 `getToken`,原生支持从 `Authorization: Bearer` 头读取 JWT。
 * JWT payload 中的 `id` / `email` / `name` / `role` 由 `auth.config.ts` 的
 * `jwt` callback 写入。
 */
export async function readUserFromToken(
  req: Request
): Promise<AuthUser | null> {
  const token = await getToken({
    req,
    secret: process.env.AUTH_SECRET,
  })
  if (!token) return null
  return {
    id: (token.id as string) ?? "",
    email: (token.email as string) ?? "",
    name: (token.name as string) ?? "",
    role: (token.role as string) ?? "USER",
  }
}
