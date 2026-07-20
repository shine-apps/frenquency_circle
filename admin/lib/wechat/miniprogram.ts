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

/** 序列化原始响应到 errmsg 时最多保留的字符数，防止日志爆炸 */
const RAW_PAYLOAD_LOG_LIMIT = 500

function truncateForLog(s: string): string {
  return s.length > RAW_PAYLOAD_LOG_LIMIT
    ? s.slice(0, RAW_PAYLOAD_LOG_LIMIT) + "...<truncated>"
    : s
}

export class WechatMpError extends Error {
  readonly errcode: number
  readonly errmsg: string
  readonly stage: Stage
  /** 原始响应体（解析后的 JSON 或原始文本），仅用于排障日志，可能含敏感信息 */
  readonly raw?: unknown
  constructor(
    errcode: number,
    errmsg: string,
    stage: Stage,
    raw?: unknown
  ) {
    super(`WeChat MP ${stage} failed: [${errcode}] ${errmsg}`)
    this.name = "WechatMpError"
    this.errcode = errcode
    this.errmsg = errmsg
    this.stage = stage
    this.raw = raw
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
    // 显式 no-store：避免 Next.js 对 fetch 的默认缓存命中导致拿到陈旧/空响应。
    // 微信接口都是动态数据，缓存无意义且会破坏排障。
    const res = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    })
    if (!res.ok) {
      // WeChat 通常在 200 中返回 errcode; 非 200 多为网关层错误
      const bodyText = await res.text().catch(() => "<unreadable>")
      throw new WechatMpError(
        res.status,
        `${res.statusText} | body=${truncateForLog(bodyText)}`,
        stage,
        bodyText
      )
    }
    // 先拿原始文本再手动 JSON.parse，避免 res.json() 抛错后丢失响应内容
    const text = await res.text()
    if (!text || !text.trim()) {
      throw new WechatMpError(
        -1,
        "empty response body",
        stage,
        text
      )
    }
    try {
      return JSON.parse(text) as unknown
    } catch (parseErr) {
      throw new WechatMpError(
        -1,
        `invalid JSON: ${parseErr instanceof Error ? parseErr.message : String(parseErr)} | body=${truncateForLog(text)}`,
        stage,
        text
      )
    }
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

/**
 * 检查微信响应是否为错误。
 *
 * 微信 API 的响应约定存在不一致：
 * - `/sns/jscode2session`、`/cgi-bin/stable_token`：**成功响应不带 `errcode`**，
 *   直接返回业务字段（如 `{ openid, session_key }` 或 `{ access_token, expires_in }`）；
 *   仅在出错时才带 `errcode/errmsg`。
 * - `/wxa/business/getuserphonenumber`：成功响应**带 `errcode: 0`**。
 *
 * 统一判定：响应是对象、且（不含 `errcode` 或 `errcode` 为 0）即视为成功；
 * `errcode` 为非零数字时按错误处理并透传 `errcode/errmsg`。
 *
 * 之前实现要求 `errcode === 0`，会把 `code2session`、`stable_token` 的成功响应当错误抛出。
 */
function assertNoWechatError(
  payload: unknown,
  stage: Stage
): asserts payload is Record<string, unknown> {
  if (!payload || typeof payload !== "object") {
    throw new WechatMpError(-1, "non-object response", stage, payload)
  }
  const obj = payload as Record<string, unknown>
  const errcode = obj.errcode
  if (typeof errcode === "number" && errcode !== 0) {
    const payloadStr = (() => {
      try {
        return JSON.stringify(obj)
      } catch {
        return String(obj)
      }
    })()
    const errmsg =
      typeof obj.errmsg === "string" && obj.errmsg
        ? obj.errmsg
        : `unknown wechat mp error | payload=${truncateForLog(payloadStr)}`
    throw new WechatMpError(errcode, errmsg, stage, payload)
  }
}

export type Code2SessionResult = {
  openid: string
  session_key: string
  unionid?: string
}

/**
 * 用 js_code 换 openid / session_key。
 *
 * `/sns/jscode2session` 成功响应**不带 `errcode`**（只返回 `{ openid, session_key, unionid? }`），
 * 由 `assertNoWechatError` 统一兼容；出错时透传 `errcode/errmsg`。
 *
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
  assertNoWechatError(payload, "code2session")

  const openid = typeof payload.openid === "string" ? payload.openid : ""
  const session_key =
    typeof payload.session_key === "string" ? payload.session_key : ""
  const unionid =
    typeof payload.unionid === "string" && payload.unionid
      ? payload.unionid
      : undefined

  if (!openid || !session_key) {
    throw new WechatMpError(
      -2,
      `missing openid or session_key | payload=${truncateForLog(JSON.stringify(payload))}`,
      "code2session",
      payload
    )
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
  assertNoWechatError(payload, "token")

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
  assertNoWechatError(payload, "phone")

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
