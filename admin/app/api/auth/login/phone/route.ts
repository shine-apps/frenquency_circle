import { z } from "zod"
import { signIn } from "@/auth"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import {
  extractSessionToken,
  readSessionTokenFromCookies,
  readUserFromToken,
} from "@/lib/auth/session-token"
import { logger, LOG_PREFIX } from "@/lib/logger"
import type { AuthLoginResponse } from "@/types/api"

const phoneSchema = z.object({
  phone: z.string().min(1),
  code: z.string().length(6),
})

/**
 * 手机号+验证码登录(Token 模式)。
 *
 * 内部调用 Auth.js `signIn("phone", { redirect: false })`,
 * 成功后从 Set-Cookie(或 next/headers cookies())提取 JWT,以 JSON body 回传。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = phoneSchema.safeParse(body)
  if (!parsed.success) {
    logger.warn(LOG_PREFIX.AUTH, "Phone token login: invalid body")
    return withCors(
      fail(400, "无效的请求参数", parsed.error.flatten()),
      req
    )
  }

  const { phone, code } = parsed.data
  let res: Response | undefined
  try {
    res = await signIn("phone", {
      phone,
      code,
      redirect: false,
    })
  } catch (err) {
    logger.error(LOG_PREFIX.AUTH, "Phone token login: signIn threw", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    return withCors(fail(500, "登录服务异常"), req)
  }

  // 兜底逻辑同 credentials 路由:从 Response 头拿不到 token 时,从 cookies() 读
  let token = extractSessionToken(res)
  if (!token) {
    token = await readSessionTokenFromCookies()
  }
  if (!token) {
    logger.warn(LOG_PREFIX.AUTH, "Phone token login failed", { phone })
    return withCors(fail(401, "手机号或验证码错误"), req)
  }

  const authReq = new Request(req.url, {
    headers: { authorization: `Bearer ${token}` },
  })
  const user = await readUserFromToken(authReq)
  if (!user) {
    logger.error(LOG_PREFIX.AUTH, "Phone token login: decode failed")
    return withCors(fail(500, "会话解析失败"), req)
  }

  logger.info(LOG_PREFIX.AUTH, "Phone token login success", {
    userId: user.id,
  })
  const data: AuthLoginResponse = { token, user }
  return withCors(ok(data), req)
}
