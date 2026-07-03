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

import { POST } from "@/app/api/auth/login/credentials/route"
import type { AuthLoginResponse, IResponse } from "@/types/api"

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const FAKE_TOKEN = "fake.jwt.token"
const FAKE_USER = {
  id: "u-1",
  email: "admin@example.com",
  name: "Admin",
  role: "ADMIN",
}

beforeEach(() => {
  signInMock.mockReset()
  extractSessionTokenMock.mockReset()
  readUserFromTokenMock.mockReset()
  signInMock.mockResolvedValue(new Response(null, { status: 200 }))
  extractSessionTokenMock.mockReturnValue(FAKE_TOKEN)
  readUserFromTokenMock.mockResolvedValue(FAKE_USER)
})

describe("POST /api/auth/login/credentials", () => {
  it("returns 400 when email is missing", async () => {
    const res = await POST(makeRequest({ password: "secret1" }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("无效的请求参数")
    expect(signInMock).not.toHaveBeenCalled()
  })

  it("returns 400 when password too short", async () => {
    const res = await POST(
      makeRequest({ email: "a@b.com", password: "12345" })
    )
    expect(res.status).toBe(400)
    expect(signInMock).not.toHaveBeenCalled()
  })

  it("returns 401 when signIn yields no session token", async () => {
    extractSessionTokenMock.mockReturnValue(null)

    const res = await POST(
      makeRequest({ email: "a@b.com", password: "secret1" })
    )
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(401)
    expect(body.message).toBe("邮箱或密码错误")
    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: "a@b.com",
      password: "secret1",
      redirect: false,
    })
  })

  it("returns 200 with { token, user } on success", async () => {
    const res = await POST(
      makeRequest({ email: "a@b.com", password: "secret1" })
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<AuthLoginResponse>
    expect(body.code).toBe(200)
    expect(body.data.token).toBe(FAKE_TOKEN)
    expect(body.data.user).toEqual(FAKE_USER)
  })

  it("returns 500 when signIn throws", async () => {
    signInMock.mockRejectedValueOnce(new Error("boom"))

    const res = await POST(
      makeRequest({ email: "a@b.com", password: "secret1" })
    )
    expect(res.status).toBe(500)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("登录服务异常")
  })

  it("returns 500 when token decode fails", async () => {
    readUserFromTokenMock.mockResolvedValue(null)

    const res = await POST(
      makeRequest({ email: "a@b.com", password: "secret1" })
    )
    expect(res.status).toBe(500)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("会话解析失败")
  })
})
