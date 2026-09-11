import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * /api/users/me/wechat 路由集成测试(直接调用 handler)。
 *
 * 依赖全部通过 vi.mock 替换:
 * - @/lib/auth-utils  -> requireSession(鉴权)
 * - @/lib/auth/account-service -> 绑定查询 / 占用判定 / 解绑守卫
 * - @/lib/wechat/miniprogram   -> code2Session(换 openid)
 */
const {
  requireSessionMock,
  findUserByAccountMock,
  hasBoundProviderMock,
  hasOtherLoginMethodMock,
  linkAccountMock,
  unlinkAccountMock,
  readWechatMpConfigMock,
  code2SessionMock,
  WechatMpErrorMock,
} = vi.hoisted(() => {
  class WechatMpErrorMock extends Error {
    readonly errcode: number
    readonly errmsg: string
    readonly stage: string
    readonly raw?: unknown
    constructor(errcode: number, errmsg: string, stage: string, raw?: unknown) {
      super(`WeChat MP ${stage} failed: [${errcode}] ${errmsg}`)
      this.name = "WechatMpError"
      this.errcode = errcode
      this.errmsg = errmsg
      this.stage = stage
      this.raw = raw
    }
  }

  return {
    requireSessionMock: vi.fn(),
    findUserByAccountMock: vi.fn(),
    hasBoundProviderMock: vi.fn(),
    hasOtherLoginMethodMock: vi.fn(),
    linkAccountMock: vi.fn(),
    unlinkAccountMock: vi.fn(),
    readWechatMpConfigMock: vi.fn(),
    code2SessionMock: vi.fn(),
    WechatMpErrorMock,
  }
})

vi.mock("@/lib/auth-utils", () => ({
  requireSession: requireSessionMock,
}))

vi.mock("@/lib/auth/account-service", () => ({
  findUserByAccount: findUserByAccountMock,
  hasBoundProvider: hasBoundProviderMock,
  hasOtherLoginMethod: hasOtherLoginMethodMock,
  linkAccount: linkAccountMock,
  unlinkAccount: unlinkAccountMock,
}))

vi.mock("@/lib/wechat/miniprogram", () => ({
  readWechatMpConfig: readWechatMpConfigMock,
  code2Session: code2SessionMock,
  WechatMpError: WechatMpErrorMock,
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  LOG_PREFIX: { AUTH: "AUTH", SMS: "SMS", ACCOUNT: "ACCOUNT", WECHAT: "WECHAT" },
}))

import { DELETE, GET, OPTIONS, POST } from "@/app/api/users/me/wechat/route"
import type { WechatBindStateDTO } from "@/types/api"

const URL = "http://localhost/api/users/me/wechat"
const USER = { id: "u-1", email: "a@b.com", name: "A", role: "USER" }

function makeRequest(method: string, body?: unknown) {
  return new Request(URL, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireSessionMock.mockResolvedValue({ user: USER })
  readWechatMpConfigMock.mockReturnValue({
    appId: "app",
    appSecret: "secret",
    apiBase: "https://api.weixin.qq.com",
  })
  code2SessionMock.mockResolvedValue({
    openid: "openid-1",
    session_key: "sk",
  })
  findUserByAccountMock.mockResolvedValue(undefined)
  hasBoundProviderMock.mockResolvedValue(false)
  hasOtherLoginMethodMock.mockResolvedValue(true)
  linkAccountMock.mockResolvedValue(undefined)
  unlinkAccountMock.mockResolvedValue(1)
})

describe("GET /api/users/me/wechat", () => {
  it("returns 401 when not authenticated", async () => {
    requireSessionMock.mockResolvedValueOnce({
      response: new Response(null, { status: 401 }),
    })
    const res = await GET(makeRequest("GET"))
    expect(res.status).toBe(401)
    expect(hasBoundProviderMock).not.toHaveBeenCalled()
  })

  it("returns bound=true when wechat is bound", async () => {
    hasBoundProviderMock.mockResolvedValueOnce(true)
    const res = await GET(makeRequest("GET"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: WechatBindStateDTO }
    expect(body.data.bound).toBe(true)
    expect(hasBoundProviderMock).toHaveBeenCalledWith("u-1", "wechat-miniprogram")
  })

  it("returns bound=false when wechat is not bound", async () => {
    const res = await GET(makeRequest("GET"))
    const body = (await res.json()) as { data: WechatBindStateDTO }
    expect(body.data.bound).toBe(false)
  })
})

describe("POST /api/users/me/wechat", () => {
  it("returns 400 when code is missing", async () => {
    const res = await POST(makeRequest("POST", {}))
    expect(res.status).toBe(400)
    expect(code2SessionMock).not.toHaveBeenCalled()
    expect(linkAccountMock).not.toHaveBeenCalled()
  })

  it("returns 400 when code2Session fails", async () => {
    code2SessionMock.mockRejectedValueOnce(
      new WechatMpErrorMock(40029, "invalid code", "code2session")
    )
    const res = await POST(makeRequest("POST", { code: "js-1" }))
    expect(res.status).toBe(400)
    expect(linkAccountMock).not.toHaveBeenCalled()
  })

  it("returns 409 when openid already bound to another account", async () => {
    findUserByAccountMock.mockResolvedValueOnce({
      id: "u-2",
      email: "other@b.com",
      name: "Other",
      role: "USER",
    })
    const res = await POST(makeRequest("POST", { code: "js-1" }))
    expect(res.status).toBe(409)
    expect(linkAccountMock).not.toHaveBeenCalled()
  })

  it("is idempotent when openid already bound to current user", async () => {
    findUserByAccountMock.mockResolvedValueOnce({
      id: "u-1",
      email: "a@b.com",
      name: "A",
      role: "USER",
    })
    const res = await POST(makeRequest("POST", { code: "js-1" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: WechatBindStateDTO }
    expect(body.data.bound).toBe(true)
    expect(linkAccountMock).not.toHaveBeenCalled()
  })

  it("binds openid to current user when not occupied", async () => {
    const res = await POST(makeRequest("POST", { code: "js-1" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: WechatBindStateDTO }
    expect(body.data.bound).toBe(true)
    expect(linkAccountMock).toHaveBeenCalledWith({
      userId: "u-1",
      provider: "wechat-miniprogram",
      providerAccountId: "openid-1",
      type: "oauth",
    })
  })
})

describe("DELETE /api/users/me/wechat", () => {
  it("returns 400 when wechat is not bound", async () => {
    hasBoundProviderMock.mockResolvedValueOnce(false)
    const res = await DELETE(makeRequest("DELETE"))
    expect(res.status).toBe(400)
    expect(unlinkAccountMock).not.toHaveBeenCalled()
  })

  it("returns 400 when no other login method remains", async () => {
    hasBoundProviderMock.mockResolvedValueOnce(true)
    hasOtherLoginMethodMock.mockResolvedValueOnce(false)
    const res = await DELETE(makeRequest("DELETE"))
    expect(res.status).toBe(400)
    const body = (await res.json()) as { message: string }
    expect(body.message).toContain("请先绑定手机号或邮箱")
    expect(unlinkAccountMock).not.toHaveBeenCalled()
  })

  it("returns 400 when the atomic guard removes nothing (race)", async () => {
    hasBoundProviderMock.mockResolvedValueOnce(true)
    hasOtherLoginMethodMock.mockResolvedValueOnce(true)
    unlinkAccountMock.mockResolvedValueOnce(0)
    const res = await DELETE(makeRequest("DELETE"))
    expect(res.status).toBe(400)
  })

  it("unbinds and returns bound=false on success", async () => {
    hasBoundProviderMock.mockResolvedValueOnce(true)
    const res = await DELETE(makeRequest("DELETE"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { data: WechatBindStateDTO }
    expect(body.data.bound).toBe(false)
    expect(unlinkAccountMock).toHaveBeenCalledWith({
      userId: "u-1",
      provider: "wechat-miniprogram",
    })
  })
})

describe("OPTIONS /api/users/me/wechat", () => {
  it("returns 204 with CORS headers", async () => {
    const res = await OPTIONS(makeRequest("OPTIONS"))
    expect(res.status).toBe(204)
    expect(res.headers.get("access-control-allow-origin")).toBe("*")
  })
})
