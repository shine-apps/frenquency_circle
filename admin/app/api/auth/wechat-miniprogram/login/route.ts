import { CredentialsSignin } from "next-auth"
import type { NextResponse } from "next/server"
import { z } from "zod"

import { corsOptions, fail, withCors } from "@/lib/api"
import { signInAndIssueToken } from "@/lib/auth/token-login"
import { logger, LOG_PREFIX } from "@/lib/logger"

/**
 * 微信小程序登录入口(Token 模式)。单 provider 双模式：
 *
 * - 静默登录：客户端 `wx.login()` 拿 js_code → POST body `{ code }`。
 *   服务端按 openid 查 accounts 绑定关系，已绑定才签发 token；未绑定返回
 *   `[WECHAT] 该微信未绑定账号...`(400)，由登录页静默忽略。
 * - 手机号授权登录：`wx.login()` + `<button open-type="getPhoneNumber">` 拿 phoneCode →
 *   POST body `{ code, phoneCode }`。登录成功后服务端自动绑定 openid。
 *
 * 成功后返回 `{ token, user, expiresIn }`；客户端持久化 token 并以 Bearer 携带。
 * 微信小程序 wx.request 不强制 CORS，无需额外 CORS 头(h5 调用时由 withCors 兜底)。
 */
const loginSchema = z.object({
  code: z.string().min(1),
  // 可选：缺失 => 静默登录；存在 => 手机号授权登录并自动绑定
  phoneCode: z.string().min(1).optional(),
})

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * 提取 Auth.js `CredentialsSignin` 子类携带的 `code`。
 *
 * 普通 Error 会被 Auth.js 包装成 `CallbackRouteError`(message 丢失),
 * 因此微信侧错误改用 `CredentialsSignin` 子类 + 自定义 code 传递,
 * 详见 `admin/auth.ts` 的 `WechatNotBoundSignInError` / `WechatApiSignInError`。
 */
function errorCode(err: unknown): string | undefined {
  if (err && typeof err === "object" && "code" in err) {
    const code = (err as { code?: unknown }).code
    if (typeof code === "string" && code) return code
  }
  return undefined
}

/** 微信未绑定账号时的提示文案(登录页静默场景会忽略该错误) */
const WECHAT_NOT_BOUND_MESSAGE =
  "该微信未绑定账号，请先用手机号或邮箱登录后在个人资料中绑定微信"

/**
 * 微信登录错误映射；返回 null 表示交回 `signInAndIssueToken` 默认处理。
 *
 * - `wechat_not_bound` / `wechat_api_error`：authorize 内主动抛出的可辨识错误 → 400
 * - 微信配置缺失 / access_token 失败等 authorize 返回 null 的场景：属服务端异常 → 500
 *   (不能按 401 反馈,否则会被误认为用户凭据问题)
 */
function mapWechatSignInError(err: unknown): NextResponse | null {
  const msg = errMessage(err)
  const code = errorCode(err)

  if (code === "wechat_not_bound" || msg.includes("wechat_not_bound")) {
    logger.warn(LOG_PREFIX.WECHAT, "Silent login rejected: wechat not bound")
    return fail(400, WECHAT_NOT_BOUND_MESSAGE)
  }
  if (code === "wechat_api_error" || msg.includes("wechat_api_error")) {
    logger.error(LOG_PREFIX.WECHAT, "signIn threw", { error: msg, code })
    return fail(400, "微信登录凭证校验失败，请稍后重试")
  }
  // 兜底:兼容带 [WECHAT] 前缀的错误,便于排障直接透传
  if (msg.startsWith("[WECHAT]")) {
    logger.error(LOG_PREFIX.WECHAT, "signIn threw", { error: msg, code })
    return fail(400, msg)
  }
  if (err instanceof CredentialsSignin) {
    logger.error(LOG_PREFIX.WECHAT, "signIn threw", { error: msg, code })
    return fail(500, "登录服务异常")
  }
  return null
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

  const { code, phoneCode } = parsed.data
  return signInAndIssueToken({
    req,
    provider: "wechat-miniprogram",
    // 只在有值时透传，避免静默登录请求带上 undefined 参数
    credentials: phoneCode ? { code, phoneCode } : { code },
    label: "WeChat MP token login",
    invalidCredentialsMessage: "登录失败",
    logContext: { mode: phoneCode ? "phone" : "silent" },
    mapError: mapWechatSignInError,
  })
}
