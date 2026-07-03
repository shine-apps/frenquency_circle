import { beforeEach, describe, expect, it, vi } from "vitest"

const { signInMock, extractSessionTokenMock, readUserFromTokenMock } =
  vi.hoisted(() => ({
    signInMock: vi.fn(),
    extractSessionTokenMock: vi.fn(),
    readUserFromTokenMock: vi.fn(),
  }))

vi.mock("@/auth", () => ({ signIn: signInMock }))
vi.mock("@/lib/auth/session-token", () => ({
  extractSessionToken: extractSessionTokenMock,
  readUserFromToken: readUserFromTokenMock,
}))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { AUTH: "AUTH", SMS: "SMS", ACCOUNT: "ACCOUNT", WECHAT: "WECHAT" },
}))

import { POST } from "@/app/api/auth/login/phone/route"
import type { AuthLoginResponse, IResponse } from "@/types/api"

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login/phone", {
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
  signInMock.mockResolvedValue(new Response(null, { status: 200 }))
  extractSessionTokenMock.mockReturnValue(FAKE_TOKEN)
  readUserFromTokenMock.mockResolvedValue(FAKE_USER)
})

describe("POST /api/auth/login/phone", () => {
  it("returns 400 when phone is missing", async () => {
    const res = await POST(makeRequest({ code: "123456" }))
    expect(res.status).toBe(400)
    expect(signInMock).not.toHaveBeenCalled()
  })

  it("returns 400 when code is not 6 digits", async () => {
    const res = await POST(makeRequest({ phone: "13800138000", code: "123" }))
    expect(res.status).toBe(400)
    expect(signInMock).not.toHaveBeenCalled()
  })

  it("returns 401 when signIn yields no session token", async () => {
    extractSessionTokenMock.mockReturnValue(null)

    const res = await POST(
      makeRequest({ phone: "13800138000", code: "123456" })
    )
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("手机号或验证码错误")
    expect(signInMock).toHaveBeenCalledWith("phone", {
      phone: "13800138000",
      code: "123456",
      redirect: false,
    })
  })

  it("returns 200 with { token, user } on success", async () => {
    const res = await POST(
      makeRequest({ phone: "13800138000", code: "123456" })
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<AuthLoginResponse>
    expect(body.data.token).toBe(FAKE_TOKEN)
    expect(body.data.user).toEqual(FAKE_USER)
  })

  it("returns 500 when signIn throws", async () => {
    signInMock.mockRejectedValueOnce(new Error("boom"))

    const res = await POST(
      makeRequest({ phone: "13800138000", code: "123456" })
    )
    expect(res.status).toBe(500)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("登录服务异常")
  })
})
