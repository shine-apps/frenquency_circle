import { cookies } from "next/headers"

import { corsOptions, ok, withCors } from "@/lib/api"
import { logger, LOG_PREFIX } from "@/lib/logger"

/**
 * 需要清除的 session cookie 名称。
 * Auth.js v5 默认使用 `authjs.session-token`(HTTPS 环境对应
 * `__Secure-authjs.session-token`)，v4 时代为 `next-auth.session-token`。
 * 这里保留两套以兼容历史 token。与 `lib/auth/session-token.ts` 中的
 * SESSION_COOKIE_NAMES 保持一致。
 */
const SESSION_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
] as const

/**
 * 退出登录(Token 双模式兼容)。
 *
 * - Cookie 模式(浏览器 / NextAuth 客户端):
 *   逐个清除 Auth.js 写下的 session cookie,使其立即失效。
 * - Bearer Token 模式(小程序 / h5):
 *   JWT 无状态、服务端无黑名单,无法真正销毁 token;
 *   由前端丢弃本地存储的 token 即可。服务端始终返回成功。
 *
 * 无论是否携带有效 token,退出都视为成功(幂等),避免客户端陷入
 * "因为 token 失效而无法登出" 的死锁。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  try {
    const store = await cookies()
    for (const name of SESSION_COOKIE_NAMES) {
      // 清除时注意只按 name 删除;Auth.js 自行写的 cookie 属性
      // (path/domain/secure) 在删除时无需完全匹配,浏览器会按 name 命中。
      store.delete(name)
    }
  } catch (err) {
    // cookies() 在特殊调用栈(如某些中间件场景)下可能抛错,
    // 但不应阻断登出流程——Bearer 模式本就不依赖 cookie。
    logger.warn(LOG_PREFIX.AUTH, "logout: failed to clear session cookies", {
      error: err instanceof Error ? err.message : String(err),
    })
  }

  logger.info(LOG_PREFIX.AUTH, "logout: success")
  return withCors(ok({ success: true }), req)
}
