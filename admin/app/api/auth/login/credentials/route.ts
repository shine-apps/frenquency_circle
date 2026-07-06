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

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

/**
 * 邮箱+密码登录(Token 模式)。
 *
 * 内部调用 Auth.js `signIn("credentials", { redirect: false })`,
 * 成功后从 Set-Cookie(或 next/headers cookies())提取 JWT,以 JSON body 回传。
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
  let res: Response | undefined
  try {
    res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    })
  } catch (err) {
    logger.error(LOG_PREFIX.AUTH, "Credentials token login: signIn threw", {
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    return withCors(fail(500, "登录服务异常"), req)
  }

  // Auth.js v5 的 signIn 在不同调用栈下返回形态不一致:
  //   - 旧路径:返回 NextResponse,Set-Cookie 头在上面;
  //   - 新路径:返回空对象 `{}`,cookie 通过 next/headers 写入。
  // 所以优先从 Response 头拿,拿不到再从 cookies() 兜底。
  let token = extractSessionToken(res)
  if (!token) {
    token = await readSessionTokenFromCookies()
  }
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
