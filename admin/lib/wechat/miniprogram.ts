import { logger, LOG_PREFIX } from "@/lib/logger"

/**
 * 微信小程序服务端 API 客户端。
 *
 * 仅封装三类调用：
 * - code2Session: 用 wx.login() 的 js_code 换 openid / session_key
 * - getAccessToken: 拉接口调用凭据（cgi-bin/stable_token），进程内缓存
 * - getPhoneNumber: 用 getPhoneNumber 按钮返回的 phone_code 换真实手机号
 *
 * 错误统一抛 WechatMpError，errcode / errmsg 透传便于排障。
 * 配置从环境变量 WECHAT_MP_APP_ID / WECHAT_MP_APP_SECRET / WECHAT_MP_API_BASE 读取。
 */

type Stage = "code2session" | "token" | "phone"

export class WechatMpError extends Error {
  readonly errcode: number
  readonly errmsg: string
  readonly stage: Stage
  constructor(errcode: number, errmsg: string, stage: Stage) {
    super(`WeChat MP ${stage} failed: [${errcode}] ${errmsg}`)
    this.name = "WechatMpError"
    this.errcode = errcode
    this.errmsg = errmsg
    this.stage = stage
  }
}

const DEFAULT_API_BASE = "https://api.weixin.qq.com"
const DEFAULT_TIMEOUT_MS = 8_000
/** access_token 缓存安全余量: 提前 5 分钟视为过期 */
const TOKEN_SAFETY_MARGIN_MS = 5 * 60 * 1000

type TokenCacheEntry = { token: string; expiresAt: number }
const tokenCache = new Map<string, TokenCacheEntry>()

function readConfig() {
  const appId = process.env.WECHAT_MP_APP_ID ?? ""
  const appSecret = process.env.WECHAT_MP_APP_SECRET ?? ""
  const apiBase = process.env.WECHAT_MP_API_BASE || DEFAULT_API_BASE
  return { appId, appSecret, apiBase }
}

async function wechatFetch(
  url: string,
  init: RequestInit,
  stage: Stage,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })
    if (!res.ok) {
      // WeChat 通常在 200 中返回 errcode; 非 200 多为网关层错误
      throw new WechatMpError(res.status, res.statusText, stage)
    }
    return (await res.json()) as unknown
  } catch (err) {
    if (err instanceof WechatMpError) throw err
    if (err instanceof Error && err.name === "AbortError") {
      throw new WechatMpError(-1, "request timeout", stage)
    }
    throw new WechatMpError(-1, err instanceof Error ? err.message : String(err), stage)
  } finally {
    clearTimeout(timer)
  }
}

function requireErrcodeZero(
  payload: unknown,
  stage: Stage
): asserts payload is Record<string, unknown> {
  if (
    !payload ||
    typeof payload !== "object" ||
    (payload as { errcode?: unknown }).errcode !== 0
  ) {
    const errcode = Number((payload as { errcode?: number })?.errcode ?? -1)
    const errmsg =
      (payload as { errmsg?: string })?.errmsg ?? "unknown wechat mp error"
    throw new WechatMpError(errcode, errmsg, stage)
  }
}

export type Code2SessionResult = {
  openid: string
  session_key: string
  unionid?: string
}

/**
 * 用 js_code 换 openid / session_key。
 * @see https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/login/auth.code2Session.html
 */
export async function code2Session(params: {
  appId: string
  appSecret: string
  code: string
  apiBase?: string
}): Promise<Code2SessionResult> {
  const { appId, appSecret, code, apiBase } = params
  const base = apiBase || DEFAULT_API_BASE
  const url =
    `${base}/sns/jscode2session` +
    `?appid=${encodeURIComponent(appId)}` +
    `&secret=${encodeURIComponent(appSecret)}` +
    `&js_code=${encodeURIComponent(code)}` +
    `&grant_type=authorization_code`

  const payload = (await wechatFetch(url, { method: "GET" }, "code2session")) as Record<
    string,
    unknown
  >
  requireErrcodeZero(payload, "code2session")

  const openid = String(payload.openid ?? "")
  const session_key = String(payload.session_key ?? "")
  const unionid =
    typeof payload.unionid === "string" && payload.unionid
      ? payload.unionid
      : undefined

  if (!openid || !session_key) {
    throw new WechatMpError(-2, "missing openid or session_key", "code2session")
  }
  return { openid, session_key, unionid }
}

/**
 * 拉服务端 access_token。进程内按 appId 缓存，提前 5 分钟视为过期。
 * @see https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/access-token/stable_token.html
 */
export async function getAccessToken(params: {
  appId: string
  appSecret: string
  apiBase?: string
}): Promise<string> {
  const { appId, appSecret, apiBase } = params
  const base = apiBase || DEFAULT_API_BASE
  const cached = tokenCache.get(appId)
  const now = Date.now()
  if (cached && cached.expiresAt > now) {
    return cached.token
  }

  const url = `${base}/cgi-bin/stable_token`
  const payload = (await wechatFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credential",
      appid: appId,
      secret: appSecret,
    }),
  }, "token")) as Record<string, unknown>
  requireErrcodeZero(payload, "token")

  const accessToken = String(payload.access_token ?? "")
  const expiresIn = Number(payload.expires_in ?? 0)
  if (!accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new WechatMpError(-3, "invalid access_token response", "token")
  }

  const expiresAt = now + (expiresIn * 1000 - TOKEN_SAFETY_MARGIN_MS)
  tokenCache.set(appId, { token: accessToken, expiresAt })
  logger.info(LOG_PREFIX.WECHAT, cached ? "Access token refreshed" : "Access token fetched", {
    appId,
    expiresIn,
  })
  return accessToken
}

export type GetPhoneNumberResult = {
  phoneNumber: string
  purePhoneNumber: string
  countryCode: string
}

/**
 * 用 phone_code 换真实手机号。
 * @see https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/phonenumber/phonenumber.getPhoneNumber.html
 */
export async function getPhoneNumber(params: {
  accessToken: string
  phoneCode: string
  apiBase?: string
}): Promise<GetPhoneNumberResult> {
  const { accessToken, phoneCode, apiBase } = params
  const base = apiBase || DEFAULT_API_BASE
  const url = `${base}/wxa/business/getuserphonenumber?access_token=${encodeURIComponent(accessToken)}`
  const payload = (await wechatFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: phoneCode }),
  }, "phone")) as Record<string, unknown>
  requireErrcodeZero(payload, "phone")

  const phoneInfo = (payload.phone_info ?? {}) as Record<string, unknown>
  const purePhoneNumber = String(phoneInfo.purePhoneNumber ?? "")
  const phoneNumber = String(phoneInfo.phoneNumber ?? "")
  const countryCode = String(phoneInfo.countryCode ?? "")
  if (!purePhoneNumber) {
    throw new WechatMpError(-4, "missing purePhoneNumber", "phone")
  }
  return { phoneNumber, purePhoneNumber, countryCode }
}

/**
 * 读取并校验 WECHAT_MP_* 环境变量；任一必填空时抛错。
 * 在 authorize 入口处调用，避免拿到空配置时静默失败。
 */
export function readWechatMpConfig(): {
  appId: string
  appSecret: string
  apiBase: string
} {
  const { appId, appSecret, apiBase } = readConfig()
  if (!appId || !appSecret) {
    throw new WechatMpError(
      -10,
      "missing WECHAT_MP_APP_ID or WECHAT_MP_APP_SECRET",
      "code2session"
    )
  }
  return { appId, appSecret, apiBase }
}

/** 仅供测试使用：清空 access_token 缓存。 */
export function __resetWechatMpForTest(): void {
  tokenCache.clear()
}
