import { beforeEach, describe, expect, it, vi } from "vitest"

const { signInMock, extractSessionTokenMock, readUserFromTokenMock } =
  vi.hoisted(() => ({
    signInMock: vi.fn(),
    extractSessionTokenMock: vi.fn(),
    readUserFromTokenMock: vi.fn(),
  }))

vi.mock("@/auth", () => ({
  signIn: signInMock,
}))

vi.mock("@/lib/auth/session-token", () => ({
  extractSessionToken: extractSessionTokenMock,
  readUserFromToken: readUserFromTokenMock,
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  LOG_PREFIX: { AUTH: "AUTH", SMS: "SMS", ACCOUNT: "ACCOUNT", WECHAT: "WECHAT" },
}))

import { POST } from "@/app/api/auth/wechat-miniprogram/login/route"
import type { AuthLoginResponse, IResponse } from "@/types/api"

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/wechat-miniprogram/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const FAKE_TOKEN = "fake.jwt.token"
const FAKE_USER = {
  id: "u-1",
  email: "13800138000@phonedomain.com",
  name: "13800138000",
  role: "USER",
}

beforeEach(() => {
  signInMock.mockReset()
  extractSessionTokenMock.mockReset()
  readUserFromTokenMock.mockReset()
  // 默认成功路径:signIn 返回任意值(被 extractSessionToken mock 接管)
  signInMock.mockResolvedValue(new Response(null, { status: 200 }))
  extractSessionTokenMock.mockReturnValue(FAKE_TOKEN)
  readUserFromTokenMock.mockResolvedValue(FAKE_USER)
})

describe("POST /api/auth/wechat-miniprogram/login", () => {
  it("returns 400 when code is missing", async () => {
    const res = await POST(makeRequest({ phoneCode: "pc-1" }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("无效的请求参数")
    expect(signInMock).not.toHaveBeenCalled()
  })

  it("returns 400 when phoneCode is missing", async () => {
    const res = await POST(makeRequest({ code: "js-1" }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("无效的请求参数")
    expect(signInMock).not.toHaveBeenCalled()
  })

  it("returns 400 when body is malformed JSON", async () => {
    const res = await POST(makeRequest("not-json"))
    expect(res.status).toBe(400)
    expect(signInMock).not.toHaveBeenCalled()
  })

  it("returns 401 when signIn yields no session token", async () => {
    extractSessionTokenMock.mockReturnValue(null)

    const res = await POST(makeRequest({ code: "js-1", phoneCode: "pc-1" }))
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(401)
    expect(body.message).toBe("登录失败")
    expect(signInMock).toHaveBeenCalledWith("wechat-miniprogram", {
      code: "js-1",
      phoneCode: "pc-1",
      redirect: false,
    })
  })

  it("returns 200 with { token, user } on success", async () => {
    const res = await POST(makeRequest({ code: "js-1", phoneCode: "pc-1" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<AuthLoginResponse>
    expect(body.code).toBe(200)
    expect(body.message).toBe("OK")
    expect(body.data.token).toBe(FAKE_TOKEN)
    expect(body.data.user).toEqual(FAKE_USER)
    expect(signInMock).toHaveBeenCalledTimes(1)
    expect(extractSessionTokenMock).toHaveBeenCalledTimes(1)
    expect(readUserFromTokenMock).toHaveBeenCalledTimes(1)
  })

  it("returns 500 when token decode fails", async () => {
    readUserFromTokenMock.mockResolvedValue(null)

    const res = await POST(makeRequest({ code: "js-1", phoneCode: "pc-1" }))
    expect(res.status).toBe(500)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(500)
    expect(body.message).toBe("会话解析失败")
  })

  it("returns 500 when signIn throws", async () => {
    signInMock.mockRejectedValueOnce(new Error("boom"))

    const res = await POST(makeRequest({ code: "js-1", phoneCode: "pc-1" }))
    expect(res.status).toBe(500)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(500)
    expect(body.message).toBe("登录服务异常")
  })

  it("attaches CORS headers on success", async () => {
    const res = await POST(makeRequest({ code: "js-1", phoneCode: "pc-1" }))
    expect(res.headers.get("access-control-allow-origin")).toBe("*")
    expect(res.headers.get("access-control-allow-headers")).toContain(
      "Authorization"
    )
  })
})
