import { cookies } from "next/headers"
import { getToken } from "next-auth/jwt"
import type { AuthUser, UserRole } from "@/types/api"

/**
 * Session cookie 名称。
 * Auth.js v5 默认使用 `authjs.session-token`(HTTPS 环境对应 `__Secure-authjs.session-token`),
 * v4 时代则是 `next-auth.session-token`。本数组保留两套以兼容历史 token。
 */
const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
] as const

type HeadersWithSetCookie = Headers & { getSetCookie?: () => string[] }

/**
 * 从 signIn 返回的 Response 中提取 session token。
 *
 * Auth.js v5 中 `signIn(provider, { redirect: false })` 在不同版本/调用栈下
 * 行为不一致:有时返回 `NextResponse`(带 Set-Cookie 头),有时返回空对象 `{}`,
 * cookie 通过 `cookies()` API 写入。所以本函数对入参 `res` 做防御性处理:
 *   1. 若 `res` 有 `headers.getSetCookie()`,优先用它(支持多 Set-Cookie);
 *   2. 否则回退到 `res.headers.get("set-cookie")`;
 *   3. 都没有时返回 null,调用方应再尝试 `next/headers` 的 `cookies()`。
 */
export function extractSessionToken(res: Response | undefined | null): string | null {
  if (!res) return null
  const headers = (res.headers ?? undefined) as HeadersWithSetCookie | undefined
  if (!headers) return null

  const cookies: string[] = []

  // 优先用 getSetCookie()(Node 18+ / undici),回退到 get("set-cookie")
  if (typeof headers.getSetCookie === "function") {
    try {
      cookies.push(...headers.getSetCookie())
    } catch {
      // 忽略,继续尝试 get("set-cookie")
    }
  } else if (typeof headers.get === "function") {
    const raw = headers.get("set-cookie")
    if (raw) cookies.push(raw)
  }

  return findSessionTokenInCookies(cookies)
}

function findSessionTokenInCookies(cookies: string[]): string | null {
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
 * 从当前请求的 Cookie 头中读取 session token。
 *
 * Auth.js v5 在 `signIn(..., { redirect: false })` 成功后,会通过
 * `next/headers` 的 `cookies()` API 写入 `next-auth.session-token`。
 * 当 `extractSessionToken` 无法从 Response 拿到 token 时,可调用本函数兜底。
 *
 * 注意:此函数只能在 Server Component / Route Handler / Server Action 中调用。
 */
export async function readSessionTokenFromCookies(): Promise<string | null> {
  const store = await cookies()
  for (const name of SESSION_COOKIE_NAMES) {
    const value = store.get(name)?.value
    if (value) return value
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
    role: (token.role as UserRole) ?? "USER",
  }
}
