import { describe, expect, it } from "vitest"
import { fail, getClientIp, ok, parsePagination } from "@/lib/api"

describe("lib/api", () => {
  describe("ok", () => {
    it("returns a JSON response with the given data and status 200 by default", async () => {
      const res = ok({ hello: "world" })
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual({ code: 200, data: { hello: "world" }, message: "OK" })
    })

    it("respects a custom status via init and mirrors it as code", async () => {
      const res = ok({ id: 1 }, { status: 201 })
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.code).toBe(201)
    })
  })

  describe("fail", () => {
    it("returns a JSON error response with the given status and message", async () => {
      const res = fail(400, "Bad request")
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body).toEqual({
        code: 400,
        data: null,
        message: "Bad request",
        details: undefined,
      })
    })

    it("includes details when provided", async () => {
      const details = { field: "email" }
      const res = fail(422, "Validation failed", details)
      const body = await res.json()
      expect(body.details).toEqual(details)
    })
  })

  describe("parsePagination", () => {
    it("returns defaults when params are missing", () => {
      expect(parsePagination(new URLSearchParams())).toEqual({ page: 1, pageSize: 20 })
    })

    it("coerces string numbers", () => {
      const params = new URLSearchParams({ page: "3", pageSize: "10" })
      expect(parsePagination(params)).toEqual({ page: 3, pageSize: 10 })
    })

    it("returns null on invalid values instead of throwing", () => {
      const params = new URLSearchParams({ page: "0" })
      expect(parsePagination(params)).toBeNull()
    })

    it("returns null when pageSize exceeds cap", () => {
      const params = new URLSearchParams({ pageSize: "500" })
      expect(parsePagination(params)).toBeNull()
    })
  })

  describe("getClientIp", () => {
    it("prefers x-real-ip (written by the trusted proxy, not spoofable)", () => {
      const req = new Request("http://localhost/api", {
        headers: {
          "x-real-ip": "203.0.113.7",
          // 客户端可伪造的首段不应生效
          "x-forwarded-for": "1.2.3.4, 203.0.113.7",
        },
      })
      expect(getClientIp(req)).toBe("203.0.113.7")
    })

    it("falls back to the last x-forwarded-for segment", () => {
      // nginx 的 $proxy_add_x_forwarded_for 会把真实地址追加到最后
      const req = new Request("http://localhost/api", {
        headers: { "x-forwarded-for": "1.2.3.4, 203.0.113.9" },
      })
      expect(getClientIp(req)).toBe("203.0.113.9")
    })

    it("returns unknown when no proxy headers exist", () => {
      expect(getClientIp(new Request("http://localhost/api"))).toBe("unknown")
    })

    it("ignores blank header values", () => {
      const req = new Request("http://localhost/api", {
        headers: { "x-real-ip": "  ", "x-forwarded-for": " , " },
      })
      expect(getClientIp(req)).toBe("unknown")
    })
  })
})
