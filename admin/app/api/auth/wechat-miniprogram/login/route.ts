import { z } from "zod"
import { signIn } from "@/auth"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import {
  extractSessionToken,
  readUserFromToken,
} from "@/lib/auth/session-token"
import { logger, LOG_PREFIX } from "@/lib/logger"
import type { AuthLoginResponse } from "@/types/api"

/**
 * 微信小程序手机号登录入口(Token 模式)。
 *
 * 客户端调用流程：
 * 1. wx.login() 拿 js_code
 * 2. 用户点击 <button open-type="getPhoneNumber"> 拿到 phoneCode
 * 3. POST /api/auth/wechat-miniprogram/login, body: { code, phoneCode }
 * 4. 成功后返回 { token, user };客户端持久化 token 并以 Bearer 携带
 *
 * 微信小程序 wx.request 不强制 CORS，无需额外 CORS 头(h5 调用时由 withCors 兜底)。
 */
const loginSchema = z.object({
  code: z.string().min(1),
  phoneCode: z.string().min(1),
})

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    logger.warn(LOG_PREFIX.WECHAT, "Login rejected: invalid body")
    return withCors(fail(400, "无效的请求参数", parsed.error.flatten()), req)
  }

  let res: Response
  try {
    res = await signIn("wechat-miniprogram", {
      code: parsed.data.code,
      phoneCode: parsed.data.phoneCode,
      redirect: false,
    })
  } catch (err) {
    logger.error(LOG_PREFIX.WECHAT, "signIn threw", { error: errMessage(err) })
    return withCors(fail(500, "登录服务异常"), req)
  }

  // 从 signIn 返回的 Response 提取 session token
  const token = extractSessionToken(res)
  if (!token) {
    logger.warn(LOG_PREFIX.WECHAT, "Login failed: no session token")
    return withCors(fail(401, "登录失败"), req)
  }

  // 用新签发的 token 解析用户信息
  const authReq = new Request(req.url, {
    headers: { authorization: `Bearer ${token}` },
  })
  const user = await readUserFromToken(authReq)
  if (!user) {
    logger.error(LOG_PREFIX.WECHAT, "Login: token decode failed")
    return withCors(fail(500, "会话解析失败"), req)
  }

  logger.info(LOG_PREFIX.AUTH, "WeChat MP token login success", {
    userId: user.id,
  })
  const data: AuthLoginResponse = { token, user }
  return withCors(ok(data), req)
}
