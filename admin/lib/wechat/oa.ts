import { createHash, randomBytes } from "node:crypto"
import { logger, LOG_PREFIX } from "@/lib/logger"
import {
  assertNoWechatError,
  getAccessToken,
  wechatFetch,
  WechatMpError,
} from "@/lib/wechat/miniprogram"

/**
 * 微信公众号（网页/H5）服务端 JSSDK 客户端。
 *
 * 与小程序（miniprogram.ts）共用微信 API 的 HTTP 封装与错误约定，但使用
 * 独立的公众号凭据（WECHAT_OA_APP_ID / WECHAT_OA_APP_SECRET），
 * 因为网页 JS 接口的 appId 与小程序 appId 不同。
 *
 * 能力：
 * - getJsapiTicket: 拉 jsapi_ticket（进程内按 appId 缓存，7200s 过期，提前 5 分钟视为过期）
 * - signJsConfig:   生成 wx.config 所需的签名配置（sha1 按字段字典序拼接）
 *
 * 配置从环境变量 WECHAT_OA_APP_ID / WECHAT_OA_APP_SECRET / WECHAT_OA_API_BASE 读取。
 * 错误统一抛 WechatMpError，errcode / errmsg 透传便于排障。
 */

const DEFAULT_API_BASE = "https://api.weixin.qq.com"
/** jsapi_ticket 缓存安全余量: 提前 5 分钟视为过期 */
const TICKET_SAFETY_MARGIN_MS = 5 * 60 * 1000

type TicketCacheEntry = { ticket: string; expiresAt: number }
const ticketCache = new Map<string, TicketCacheEntry>()

function readOaConfig() {
  const appId = process.env.WECHAT_OA_APP_ID ?? ""
  const appSecret = process.env.WECHAT_OA_APP_SECRET ?? ""
  const apiBase = process.env.WECHAT_OA_API_BASE || DEFAULT_API_BASE
  return { appId, appSecret, apiBase }
}

/**
 * 拉 jsapi_ticket，进程内按 OA appId 缓存，提前 5 分钟视为过期。
 * @see https://developers.weixin.qq.com/doc/offiaccount/OA_Web_Apps/JS-SDK.html
 */
export async function getJsapiTicket(params: {
  accessToken: string
  appId: string
  apiBase?: string
}): Promise<string> {
  const { accessToken, appId, apiBase } = params
  const base = apiBase || DEFAULT_API_BASE
  const cached = ticketCache.get(appId)
  const now = Date.now()
  if (cached && cached.expiresAt > now) {
    return cached.ticket
  }

  const url = `${base}/cgi-bin/ticket/getticket?access_token=${encodeURIComponent(accessToken)}&type=jsapi`
  const payload = (await wechatFetch(url, { method: "GET" }, "ticket")) as Record<
    string,
    unknown
  >
  assertNoWechatError(payload, "ticket")

  const ticket = String(payload.ticket ?? "")
  const expiresIn = Number(payload.expires_in ?? 0)
  if (!ticket || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new WechatMpError(-5, "invalid jsapi_ticket response", "ticket", payload)
  }

  const expiresAt = now + (expiresIn * 1000 - TICKET_SAFETY_MARGIN_MS)
  ticketCache.set(appId, { ticket, expiresAt })
  logger.info(LOG_PREFIX.WECHAT, "jsapi_ticket fetched", { appId, expiresIn })
  return ticket
}

/**
 * 微信 JS 接口签名：字段按 ASCII 字典序排序，拼 key=value&... 后 sha1。
 * 参与字段：jsapi_ticket、noncestr、timestamp、url。
 */
export function signJsConfigString(params: {
  jsapiTicket: string
  noncestr: string
  timestamp: number
  url: string
}): string {
  const { jsapiTicket, noncestr, timestamp, url } = params
  const string1 = [
    `jsapi_ticket=${jsapiTicket}`,
    `noncestr=${noncestr}`,
    `timestamp=${timestamp}`,
    `url=${url}`,
  ]
    .sort()
    .join("&")
  return createHash("sha1").update(string1).digest("hex")
}

/** 生成随机 noncestr（字母数字，默认 16 位，符合微信 ≤32 位要求） */
export function randomNonceStr(length = 16): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  const bytes = randomBytes(length)
  let out = ""
  for (let i = 0; i < length; i++) {
    out += charset[bytes[i]! % charset.length]
  }
  return out
}

/**
 * 生成 wx.config 所需签名配置。
 * 签名 URL 必须与前端 wx.config 时传入的 URL 完全一致（前端传 location.href 去掉 #hash 后的值）。
 */
export async function signJsConfig(params: { url: string }): Promise<{
  appId: string
  timestamp: number
  noncestr: string
  signature: string
}> {
  const { url } = params
  const { appId, appSecret, apiBase } = readOaConfig()
  if (!appId || !appSecret) {
    throw new WechatMpError(
      -10,
      "missing WECHAT_OA_APP_ID or WECHAT_OA_APP_SECRET",
      "ticket"
    )
  }
  const accessToken = await getAccessToken({ appId, appSecret, apiBase })
  const jsapiTicket = await getJsapiTicket({ accessToken, appId, apiBase })

  const noncestr = randomNonceStr(16)
  const timestamp = Math.floor(Date.now() / 1000)
  const signature = signJsConfigString({ jsapiTicket, noncestr, timestamp, url })

  return { appId, timestamp, noncestr, signature }
}

/** 仅供测试使用：清空 jsapi_ticket 缓存。 */
export function __resetOaForTest(): void {
  ticketCache.clear()
}
