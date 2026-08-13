import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  LOG_PREFIX: { AUTH: "AUTH", SMS: "SMS", ACCOUNT: "ACCOUNT", WECHAT: "WECHAT" },
}))

import {
  __resetOaForTest,
  getJsapiTicket,
  randomNonceStr,
  signJsConfig,
  signJsConfigString,
} from "@/lib/wechat/oa"
import { __resetWechatMpForTest, WechatMpError } from "@/lib/wechat/miniprogram"

type FetchResponse = {
  ok: boolean
  status: number
  statusText: string
  json: () => Promise<unknown>
  text: () => Promise<string>
}

function makeJsonResponse(body: unknown, status = 200, statusText = "OK"): FetchResponse {
  const text = typeof body === "string" ? body : JSON.stringify(body)
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
    text: async () => text,
  }
}

function makeFetchMock(impl: (url: string, init: RequestInit) => Promise<FetchResponse>) {
  return vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = typeof url === "string" ? url : url.toString()
    return impl(u, init)
  })
}

// 微信官方 JS-SDK 签名示例（用于对照算法正确性）
const OFFICIAL_EXAMPLE = {
  jsapiTicket: "sM4AOVdWfPE4DxkXGEs8VMCPGGVi4C3VM0P37wVUCFvkVAy_90u5h9nbSlYy3-Sl-HhTdfl2fzFy1AOcHKP7qg",
  noncestr: "Wm3WZYTPz0wzccnW",
  timestamp: 1414587457,
  url: "http://mp.weixin.qq.com?params=value",
  // 由 node:crypto sha1 计算得出的官方示例签名
  signature: "0f9de62fce790f9a083d5c99e95740ceb90c27ed",
} as const

beforeEach(() => {
  process.env.WECHAT_OA_APP_ID = "wx-oa-test-app-id"
  process.env.WECHAT_OA_APP_SECRET = "wx-oa-test-app-secret"
  __resetOaForTest()
  __resetWechatMpForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  delete process.env.WECHAT_OA_APP_ID
  delete process.env.WECHAT_OA_APP_SECRET
})

describe("lib/wechat/oa", () => {
  describe("signJsConfigString", () => {
    it("produces the official WeChat JS-SDK signature", () => {
      const sig = signJsConfigString({
        jsapiTicket: OFFICIAL_EXAMPLE.jsapiTicket,
        noncestr: OFFICIAL_EXAMPLE.noncestr,
        timestamp: OFFICIAL_EXAMPLE.timestamp,
        url: OFFICIAL_EXAMPLE.url,
      })
      expect(sig).toBe(OFFICIAL_EXAMPLE.signature)
    })

    it("sorts fields by ASCII order regardless of input order", () => {
      const sig = signJsConfigString({
        url: OFFICIAL_EXAMPLE.url,
        timestamp: OFFICIAL_EXAMPLE.timestamp,
        jsapiTicket: OFFICIAL_EXAMPLE.jsapiTicket,
        noncestr: OFFICIAL_EXAMPLE.noncestr,
      })
      expect(sig).toBe(OFFICIAL_EXAMPLE.signature)
    })
  })

  describe("randomNonceStr", () => {
    it("returns a string of the requested length with only alphanumerics", () => {
      const s = randomNonceStr(16)
      expect(s).toHaveLength(16)
      expect(s).toMatch(/^[a-zA-Z0-9]+$/)
    })

    it("returns different values across calls", () => {
      expect(randomNonceStr(16)).not.toBe(randomNonceStr(16))
    })
  })

  describe("getJsapiTicket", () => {
    it("fetches on first call, caches for subsequent calls", async () => {
      const fetchMock = makeFetchMock(async (url) => {
        expect(url).toContain("/cgi-bin/ticket/getticket")
        expect(url).toContain("access_token=tok-oa")
        expect(url).toContain("type=jsapi")
        return makeJsonResponse({
          errcode: 0,
          ticket: "ticket-1",
          expires_in: 7200,
        })
      })
      vi.stubGlobal("fetch", fetchMock)

      const t1 = await getJsapiTicket({ accessToken: "tok-oa", appId: "wx-oa-test-app-id" })
      const t2 = await getJsapiTicket({ accessToken: "tok-oa", appId: "wx-oa-test-app-id" })
      expect(t1).toBe("ticket-1")
      expect(t2).toBe("ticket-1")
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("re-fetches after ticket expiry (with safety margin)", async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

      let call = 0
      vi.stubGlobal(
        "fetch",
        makeFetchMock(async () => {
          call += 1
          return makeJsonResponse({
            errcode: 0,
            ticket: `ticket-${call}`,
            expires_in: 600, // 10 min
          })
        })
      )

      const t1 = await getJsapiTicket({ accessToken: "tok-oa", appId: "wx-oa-test-app-id" })
      // 600s - 5min 安全余量 = 300s，越过该点应重新拉取
      vi.setSystemTime(new Date("2026-01-01T00:06:00Z"))
      const t2 = await getJsapiTicket({ accessToken: "tok-oa", appId: "wx-oa-test-app-id" })
      expect(t1).toBe("ticket-1")
      expect(t2).toBe("ticket-2")
      expect(call).toBe(2)
    })

    it("throws on errcode != 0", async () => {
      vi.stubGlobal(
        "fetch",
        makeFetchMock(async () =>
          makeJsonResponse({ errcode: 40001, errmsg: "invalid credential" })
        )
      )
      await expect(
        getJsapiTicket({ accessToken: "tok-oa", appId: "wx-oa-test-app-id" })
      ).rejects.toMatchObject({ errcode: 40001, stage: "ticket" })
    })

    it("throws when ticket missing in response", async () => {
      vi.stubGlobal(
        "fetch",
        makeFetchMock(async () =>
          makeJsonResponse({ errcode: 0, expires_in: 7200 })
        )
      )
      await expect(
        getJsapiTicket({ accessToken: "tok-oa", appId: "wx-oa-test-app-id" })
      ).rejects.toBeInstanceOf(WechatMpError)
    })
  })

  describe("signJsConfig", () => {
    it("returns signature config using OA appId", async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

      const fetchMock = makeFetchMock(async (url) => {
        if (url.includes("/cgi-bin/stable_token")) {
          return makeJsonResponse({ access_token: "tok-oa", expires_in: 7200 })
        }
        if (url.includes("/cgi-bin/ticket/getticket")) {
          return makeJsonResponse({ errcode: 0, ticket: "ticket-oa", expires_in: 7200 })
        }
        throw new Error(`unexpected url: ${url}`)
      })
      vi.stubGlobal("fetch", fetchMock)

      const url = "https://fc.example.com/pages/circle/circle?id=1"
      const res = await signJsConfig({ url })

      expect(res.appId).toBe("wx-oa-test-app-id")
      expect(res.timestamp).toBe(1767225600)
      expect(res.noncestr).toHaveLength(16)
      expect(res.noncestr).toMatch(/^[a-zA-Z0-9]+$/)
      expect(res.signature).toHaveLength(40)
      // 与纯函数算法一致
      expect(res.signature).toBe(
        signJsConfigString({ jsapiTicket: "ticket-oa", noncestr: res.noncestr, timestamp: res.timestamp, url })
      )
      // 稳定签名 URL 时第二次调用应命中 token/ticket 缓存，不再请求微信
      await signJsConfig({ url })
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it("throws when OA credentials are not configured", async () => {
      delete process.env.WECHAT_OA_APP_ID
      await expect(signJsConfig({ url: "https://fc.example.com/" })).rejects.toBeInstanceOf(
        WechatMpError
      )
    })
  })
})
