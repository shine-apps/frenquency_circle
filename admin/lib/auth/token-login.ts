import { CredentialsSignin } from "next-auth"
import type { NextResponse } from "next/server"

import { signIn } from "@/auth"
import { fail, ok, withCors } from "@/lib/api"
import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session-config"
import {
  extractSessionToken,
  readSessionTokenFromCookies,
  readUserFromToken,
} from "@/lib/auth/session-token"
import { logger, LOG_PREFIX } from "@/lib/logger"
import type { AuthLoginResponse } from "@/types/api"

/**
 * 用 Auth.js `signIn` 完成一次 Credentials 登录并签发 Token 模式响应。
 *
 * Token 模式(小程序 / H5,不便依赖 cookie)的登录入口流程完全一致:
 *   1. `signIn(provider, { ...credentials, redirect: false })`
 *   2. 从 Set-Cookie 提取 JWT,拿不到再从 `next/headers` cookies() 兜底
 *   3. 用该 JWT 解析用户信息
 *   4. 返回 `{ token, user, expiresIn }`
 *
 * 抽到此处是为了避免三份复制粘贴的骨架「一处修好、另一处漏掉」
 * (phone 路由就曾漏掉 CredentialsSignin → 401 的映射,把验证码错误报成 500)。
 */
export type TokenLoginParams = {
  req: Request
  /** Auth.js provider id,如 "credentials" | "phone" | "wechat-miniprogram" */
  provider: string
  /** 透传给 provider.authorize 的凭据 */
  credentials: Record<string, unknown>
  /** 日志动作名,如 "Credentials token login" */
  label: string
  /** 凭据不匹配(authorize 返回 null / 无 session token)时的响应文案 */
  invalidCredentialsMessage?: string
  /** 附加上下文,写入日志(如 `{ email }` / `{ phone }`),勿传敏感大对象 */
  logContext?: Record<string, unknown>
  /**
   * 自定义错误映射。返回响应表示已处理;返回 null 交回默认处理
   * (CredentialsSignin → 401,其它 → 500)。
   */
  mapError?: (err: unknown) => NextResponse | null
}

/**
 * 执行登录并返回 Token 模式响应(`IResponse<AuthLoginResponse>`)。
 * 所有分支都会返回带 CORS 头的响应,调用方直接 return 即可。
 */
export async function signInAndIssueToken(params: TokenLoginParams) {
  const {
    req,
    provider,
    credentials,
    label,
    invalidCredentialsMessage = "登录失败",
    logContext,
    mapError,
  } = params

  let res: Response | undefined
  try {
    res = await signIn(provider, { ...credentials, redirect: false })
  } catch (err) {
    const mapped = mapError?.(err)
    if (mapped) return withCors(mapped, req)

    // authorize 返回 null 时 @auth/core 会抛 CredentialsSignin(AuthError 原样抛出):
    // 属于「凭据不正确」,应按 401 反馈,而不是 500
    if (err instanceof CredentialsSignin) {
      logger.warn(LOG_PREFIX.AUTH, `${label}: invalid credentials`, logContext)
      return withCors(fail(401, invalidCredentialsMessage), req)
    }

    logger.error(LOG_PREFIX.AUTH, `${label}: signIn threw`, {
      ...logContext,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
    return withCors(fail(500, "登录服务异常"), req)
  }

  // Auth.js v5 的 signIn 在不同调用栈下返回形态不一致:
  //   - 旧路径:返回 NextResponse,Set-Cookie 头在上面;
  //   - 新路径:返回空对象 `{}`,cookie 通过 next/headers 写入。
  let token = extractSessionToken(res)
  if (!token) {
    token = await readSessionTokenFromCookies()
  }
  if (!token) {
    logger.warn(LOG_PREFIX.AUTH, `${label}: no session token`, logContext)
    return withCors(fail(401, invalidCredentialsMessage), req)
  }

  // 用新签发的 token 构造请求,解析出用户信息
  const authReq = new Request(req.url, {
    headers: { authorization: `Bearer ${token}` },
  })
  const user = await readUserFromToken(authReq)
  if (!user) {
    logger.error(LOG_PREFIX.AUTH, `${label}: token decode failed`, logContext)
    return withCors(fail(500, "会话解析失败"), req)
  }

  logger.info(LOG_PREFIX.AUTH, `${label}: success`, {
    ...logContext,
    userId: user.id,
  })

  const data: AuthLoginResponse = {
    token,
    user,
    // 与 authConfig.session.maxAge 同源,前端据此判定 token 有效期
    expiresIn: SESSION_MAX_AGE_SECONDS,
  }
  return withCors(ok(data), req)
}
