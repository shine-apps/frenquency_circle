import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { signJsConfig } from "@/lib/wechat/oa"
import { WechatMpError } from "@/lib/wechat/miniprogram"

/**
 * GET /api/wechat/jssdk-config?url=...
 *
 * 生成 H5 微信浏览器内 JSSDK 的 wx.config 签名配置（公开，不需要鉴权）。
 *
 * 前端需传当前页完整 URL（去掉 #hash 后的 location.href），签名结果只对
 * 该 URL 生效。返回 `IResponse<{ appId, timestamp, noncestr, signature }>`。
 *
 * 安全校验：
 * - url 非空、长度 ≤ 2048、必须 http(s):// 开头
 * - 域名须匹配安全域名白名单 `WECHAT_OA_JS_DOMAINS`（逗号分隔，可带协议），
 *   未配置时回退 `NEXT_PUBLIC_APP_URL`；两者都未配置则不做域名限制（便于本地开发）。
 */
export const dynamic = "force-dynamic"

const MAX_URL_LENGTH = 2048

function isValidUrl(raw: string): boolean {
  if (!raw || raw.length > MAX_URL_LENGTH) return false
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return false
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false

  const allowList = (
    process.env.WECHAT_OA_JS_DOMAINS ?? process.env.NEXT_PUBLIC_APP_URL ?? ""
  )
    .split(",")
    .map(s => s.trim())
    .filter(Boolean)
  if (allowList.length === 0) return true

  return allowList.some((host) => {
    try {
      const allowed = new URL(host.includes("://") ? host : `https://${host}`)
      return u.hostname === allowed.hostname
    } catch {
      return false
    }
  })
}

export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const target = url.searchParams.get("url") ?? ""

  if (!isValidUrl(target)) {
    return withCors(
      fail(400, "Invalid url parameter: must be an http(s) URL within the allowed domain"),
      req
    )
  }

  try {
    const config = await signJsConfig({ url: target })
    return withCors(ok(config), req)
  } catch (err) {
    // 公众号凭据未配置：返回 503 明确提示，而非静默 500
    if (err instanceof WechatMpError && err.errcode === -10) {
      return withCors(fail(503, "WeChat OA JSSDK is not configured on the server"), req)
    }
    console.error("[wechat/jssdk-config] sign failed:", err)
    return withCors(fail(500, "Failed to generate JSSDK config"), req)
  }
}
