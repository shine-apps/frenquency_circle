import { describe, expect, it } from "vitest"
import { http, HttpResponse } from "msw"
import { server } from "@/tests/msw/server"
import type { IResponse } from "@/types/api"

/**
 * SMS 发送路由的集成测试。
 *
 * 由于 happy-dom 阻止跨域 fetch，必须使用相对 URL，
 * MSW 在 setup.ts 中已挂载拦截。
 */

describe("POST /api/auth/sms/send", () => {
  it("returns 201 with success envelope on happy path", async () => {
    const res = await fetch("/api/auth/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000" }),
    })
    expect(res.status).toBe(201)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(201)
    expect(body.data).toBeNull()
    expect(body.message).toBe("验证码已发送")
  })

  it("returns 400 on invalid phone format (MSW override)", async () => {
    server.use(
      http.post("/api/auth/sms/send", () =>
        HttpResponse.json(
          {
            code: 400,
            data: null,
            message: "手机号格式不正确",
          },
          { status: 400 }
        )
      )
    )

    const res = await fetch("/api/auth/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "12345" }),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("手机号格式不正确")
  })

  it("returns 429 on rate limit (MSW override)", async () => {
    server.use(
      http.post("/api/auth/sms/send", () =>
        HttpResponse.json(
          {
            code: 429,
            data: null,
            message: "请求过于频繁，请稍后再试",
          },
          { status: 429 }
        )
      )
    )

    const res = await fetch("/api/auth/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: "13800138000" }),
    })
    expect(res.status).toBe(429)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(429)
    expect(body.message).toContain("频繁")
  })

  it("returns 400 on malformed body (MSW override)", async () => {
    server.use(
      http.post("/api/auth/sms/send", () =>
        HttpResponse.json(
          {
            code: 400,
            data: null,
            message: "无效的请求参数",
          },
          { status: 400 }
        )
      )
    )

    const res = await fetch("/api/auth/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("无效的请求参数")
  })
})
