import { beforeEach, describe, expect, it, vi } from "vitest"

const { signInMock } = vi.hoisted(() => ({
  signInMock: vi.fn(),
}))

vi.mock("@/auth", () => ({
  signIn: signInMock,
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
import type { IResponse } from "@/types/api"

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/wechat-miniprogram/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  signInMock.mockReset()
  // signIn in success case is "no-op then returns", with redirect:false
  signInMock.mockResolvedValue({ ok: true, error: undefined, url: null, status: 200 })
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

  it("returns 401 when signIn returns error", async () => {
    signInMock.mockResolvedValueOnce({
      ok: false,
      error: "CredentialsSignin",
      url: null,
      status: 401,
    })

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

  it("returns 200 with provider on success", async () => {
    const res = await POST(makeRequest({ code: "js-1", phoneCode: "pc-1" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ provider: string }>
    expect(body.code).toBe(200)
    expect(body.message).toBe("OK")
    expect(body.data).toEqual({ provider: "wechat-miniprogram" })
    expect(signInMock).toHaveBeenCalledTimes(1)
  })

  it("returns 500 when signIn throws", async () => {
    signInMock.mockRejectedValueOnce(new Error("boom"))

    const res = await POST(makeRequest({ code: "js-1", phoneCode: "pc-1" }))
    expect(res.status).toBe(500)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(500)
    expect(body.message).toBe("登录服务异常")
  })
})
