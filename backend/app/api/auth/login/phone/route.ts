import { z } from "zod"

import { corsOptions, fail, withCors } from "@/lib/api"
import { signInAndIssueToken } from "@/lib/auth/token-login"
import { logger, LOG_PREFIX } from "@/lib/logger"

const phoneSchema = z.object({
  phone: z.string().min(1),
  code: z.string().length(6),
})

/**
 * 手机号+验证码登录(Token 模式)。
 *
 * 内部调用 Auth.js `signIn("phone", { redirect: false })`,
 * 成功后从 Set-Cookie(或 next/headers cookies())提取 JWT,以 JSON body 回传。
 *
 * 验证码错误时 `authorize` 返回 null,Auth.js 抛 `CredentialsSignin`,
 * 由 `lib/auth/token-login.ts` 统一映射为 401(而非 500)。
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
  return signInAndIssueToken({
    req,
    provider: "phone",
    credentials: { phone, code },
    label: "Phone token login",
    invalidCredentialsMessage: "手机号或验证码错误",
    logContext: { phone },
  })
}
