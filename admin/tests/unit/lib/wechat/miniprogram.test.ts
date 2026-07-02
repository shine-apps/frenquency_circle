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
  code2Session,
  getAccessToken,
  getPhoneNumber,
  readWechatMpConfig,
  WechatMpError,
  __resetWechatMpForTest,
} from "@/lib/wechat/miniprogram"

type FetchResponse = {
  ok: boolean
  status: number
  statusText: string
  json: () => Promise<unknown>
}

function makeJsonResponse(body: unknown, status = 200, statusText = "OK"): FetchResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => body,
  }
}

function makeFetchMock(impl: (url: string, init: RequestInit) => Promise<FetchResponse>) {
  return vi.fn(async (url: string | URL | Request, init: RequestInit = {}) => {
    const u = typeof url === "string" ? url : url.toString()
    return impl(u, init)
  })
}

beforeEach(() => {
  process.env.WECHAT_MP_APP_ID = "wx-test-app-id"
  process.env.WECHAT_MP_APP_SECRET = "wx-test-app-secret"
  __resetWechatMpForTest()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  delete process.env.WECHAT_MP_APP_ID
  delete process.env.WECHAT_MP_APP_SECRET
})

describe("lib/wechat/miniprogram", () => {
  describe("readWechatMpConfig", () => {
    it("returns appId, appSecret, apiBase when env is set", () => {
      process.env.WECHAT_MP_API_BASE = "https://example.test"
      const cfg = readWechatMpConfig()
      expect(cfg.appId).toBe("wx-test-app-id")
      expect(cfg.appSecret).toBe("wx-test-app-secret")
      expect(cfg.apiBase).toBe("https://example.test")
    })

    it("uses default api base when env not set", () => {
      delete process.env.WECHAT_MP_API_BASE
      const cfg = readWechatMpConfig()
      expect(cfg.apiBase).toBe("https://api.weixin.qq.com")
    })

    it("throws when appId missing", () => {
      delete process.env.WECHAT_MP_APP_ID
      expect(() => readWechatMpConfig()).toThrow(WechatMpError)
    })

    it("throws when appSecret missing", () => {
      delete process.env.WECHAT_MP_APP_SECRET
      expect(() => readWechatMpConfig()).toThrow(WechatMpError)
    })
  })

  describe("code2Session", () => {
    it("returns openid, session_key, unionid on success", async () => {
      const fetchMock = makeFetchMock(async (url) => {
        expect(url).toContain("sns/jscode2session")
        expect(url).toContain("appid=wx-test-app-id")
        expect(url).toContain("js_code=js-test")
        return makeJsonResponse({
          errcode: 0,
          openid: "oXyz123",
          session_key: "sess-abc",
          unionid: "uXyz456",
        })
      })
      vi.stubGlobal("fetch", fetchMock)

      const r = await code2Session({
        appId: "wx-test-app-id",
        appSecret: "wx-test-app-secret",
        code: "js-test",
      })
      expect(r).toEqual({
        openid: "oXyz123",
        session_key: "sess-abc",
        unionid: "uXyz456",
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("throws WechatMpError when errcode != 0", async () => {
      vi.stubGlobal(
        "fetch",
        makeFetchMock(async () =>
          makeJsonResponse({ errcode: 40029, errmsg: "invalid code" })
        )
      )
      await expect(
        code2Session({
          appId: "wx-test-app-id",
          appSecret: "wx-test-app-secret",
          code: "bad",
        })
      ).rejects.toMatchObject({
        name: "WechatMpError",
        errcode: 40029,
        errmsg: "invalid code",
        stage: "code2session",
      })
    })

    it("throws when openid missing in response", async () => {
      vi.stubGlobal(
        "fetch",
        makeFetchMock(async () =>
          makeJsonResponse({ errcode: 0, session_key: "sess-abc" })
        )
      )
      await expect(
        code2Session({
          appId: "wx-test-app-id",
          appSecret: "wx-test-app-secret",
          code: "x",
        })
      ).rejects.toBeInstanceOf(WechatMpError)
    })

    it("throws when HTTP status not ok", async () => {
      vi.stubGlobal(
        "fetch",
        makeFetchMock(async () => makeJsonResponse({}, 502, "Bad Gateway"))
      )
      await expect(
        code2Session({
          appId: "wx-test-app-id",
          appSecret: "wx-test-app-secret",
          code: "x",
        })
      ).rejects.toBeInstanceOf(WechatMpError)
    })
  })

  describe("getAccessToken", () => {
    it("fetches token on first call, caches for subsequent calls", async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

      const fetchMock = makeFetchMock(async (url, init) => {
        expect(url).toContain("/cgi-bin/stable_token")
        expect(init.method).toBe("POST")
        return makeJsonResponse({
          errcode: 0,
          access_token: "tok-1",
          expires_in: 7200,
        })
      })
      vi.stubGlobal("fetch", fetchMock)

      const t1 = await getAccessToken({
        appId: "wx-test-app-id",
        appSecret: "wx-test-app-secret",
      })
      const t2 = await getAccessToken({
        appId: "wx-test-app-id",
        appSecret: "wx-test-app-secret",
      })
      expect(t1).toBe("tok-1")
      expect(t2).toBe("tok-1")
      // Only one network call thanks to cache
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it("re-fetches after token expiry (with safety margin)", async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))

      let call = 0
      vi.stubGlobal(
        "fetch",
        makeFetchMock(async () => {
          call += 1
          return makeJsonResponse({
            errcode: 0,
            access_token: `tok-${call}`,
            expires_in: 600, // 10 min
          })
        })
      )

      const t1 = await getAccessToken({
        appId: "wx-test-app-id",
        appSecret: "wx-test-app-secret",
      })
      // Advance past 600s - 5min safety margin = 300s
      vi.setSystemTime(new Date("2026-01-01T00:06:00Z"))
      const t2 = await getAccessToken({
        appId: "wx-test-app-id",
        appSecret: "wx-test-app-secret",
      })
      expect(t1).toBe("tok-1")
      expect(t2).toBe("tok-2")
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
        getAccessToken({
          appId: "wx-test-app-id",
          appSecret: "wx-test-app-secret",
        })
      ).rejects.toMatchObject({
        errcode: 40001,
        stage: "token",
      })
    })

    it("throws when access_token missing", async () => {
      vi.stubGlobal(
        "fetch",
        makeFetchMock(async () =>
          makeJsonResponse({ errcode: 0, expires_in: 7200 })
        )
      )
      await expect(
        getAccessToken({
          appId: "wx-test-app-id",
          appSecret: "wx-test-app-secret",
        })
      ).rejects.toBeInstanceOf(WechatMpError)
    })
  })

  describe("getPhoneNumber", () => {
    it("returns phone fields on success", async () => {
      const fetchMock = makeFetchMock(async (url, init) => {
        expect(url).toContain("/wxa/business/getuserphonenumber")
        expect(url).toContain("access_token=tok-x")
        expect(init.method).toBe("POST")
        return makeJsonResponse({
          errcode: 0,
          phone_info: {
            phoneNumber: "+8613800138000",
            purePhoneNumber: "13800138000",
            countryCode: "86",
          },
        })
      })
      vi.stubGlobal("fetch", fetchMock)

      const r = await getPhoneNumber({
        accessToken: "tok-x",
        phoneCode: "pc-1",
      })
      expect(r).toEqual({
        phoneNumber: "+8613800138000",
        purePhoneNumber: "13800138000",
        countryCode: "86",
      })
    })

    it("throws on errcode != 0", async () => {
      vi.stubGlobal(
        "fetch",
        makeFetchMock(async () =>
          makeJsonResponse({ errcode: 40029, errmsg: "invalid code" })
        )
      )
      await expect(
        getPhoneNumber({ accessToken: "tok-x", phoneCode: "bad" })
      ).rejects.toMatchObject({
        errcode: 40029,
        stage: "phone",
      })
    })

    it("throws when purePhoneNumber missing", async () => {
      vi.stubGlobal(
        "fetch",
        makeFetchMock(async () =>
          makeJsonResponse({ errcode: 0, phone_info: {} })
        )
      )
      await expect(
        getPhoneNumber({ accessToken: "tok-x", phoneCode: "x" })
      ).rejects.toBeInstanceOf(WechatMpError)
    })
  })
})
