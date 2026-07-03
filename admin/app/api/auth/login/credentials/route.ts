import { z } from "zod"
import { signIn } from "@/auth"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import {
  extractSessionToken,
  readUserFromToken,
} from "@/lib/auth/session-token"
import { logger, LOG_PREFIX } from "@/lib/logger"
import type { AuthLoginResponse } from "@/types/api"

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

/**
 * 邮箱+密码登录(Token 模式)。
 *
 * 内部调用 Auth.js `signIn("credentials", { redirect: false })`,
 * 成功后从 Response 的 Set-Cookie 提取 JWT,以 JSON body 回传给客户端。
 * 适用于 Taro 小程序 / h5 等不便依赖 cookie 的客户端。
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
  let res: Response
  try {
    res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })
  } catch (err) {
    logger.error(LOG_PREFIX.AUTH, "Credentials token login: signIn threw", {
      error: err instanceof Error ? err.message : String(err),
    })
    return withCors(fail(500, "登录服务异常"), req)
  }

  // signIn 失败时不写 Set-Cookie;extractSessionToken 返回 null 即视为登录失败
  const token = extractSessionToken(res)
  if (!token) {
    logger.warn(LOG_PREFIX.AUTH, "Credentials token login failed", { email })
    return withCors(fail(401, "邮箱或密码错误"), req)
  }

  // 用新签发的 token 构造请求,解析出用户信息
  const authReq = new Request(req.url, {
    headers: { authorization: `Bearer ${token}` },
  })
  const user = await readUserFromToken(authReq)
  if (!user) {
    logger.error(LOG_PREFIX.AUTH, "Credentials token login: decode failed")
    return withCors(fail(500, "会话解析失败"), req)
  }

  logger.info(LOG_PREFIX.AUTH, "Credentials token login success", {
    userId: user.id,
  })
  const data: AuthLoginResponse = { token, user }
  return withCors(ok(data), req)
}
