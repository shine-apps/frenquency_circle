import { z } from "zod"

import { corsOptions, fail, withCors } from "@/lib/api"
import { signInAndIssueToken } from "@/lib/auth/token-login"
import { logger, LOG_PREFIX } from "@/lib/logger"

const credentialsSchema = z.object({
  // trim:避免前后空格导致登录失败(输入法/复制粘贴常见),与 auth.ts 的 provider 校验一致
  email: z.string().trim().email(),
  password: z.string().min(6),
})

/**
 * 邮箱+密码登录(Token 模式)。
 *
 * 内部调用 Auth.js `signIn("credentials", { redirect: false })`,
 * 成功后从 Set-Cookie(或 next/headers cookies())提取 JWT,以 JSON body 回传。
 * 适用于小程序 / h5 等不便依赖 cookie 的客户端。
 *
 * 具体签发流程与错误映射见 `lib/auth/token-login.ts`。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = credentialsSchema.safeParse(body)
  if (!parsed.success) {
    logger.warn(LOG_PREFIX.AUTH, "Credentials token login: invalid body")
    return withCors(
      fail(400, "无效的请求参数", parsed.error.flatten()),
      req
    )
  }

  const { email, password } = parsed.data
  return signInAndIssueToken({
    req,
    provider: "credentials",
    credentials: { email, password },
    label: "Credentials token login",
    invalidCredentialsMessage: "邮箱或密码错误",
    logContext: { email },
  })
}
