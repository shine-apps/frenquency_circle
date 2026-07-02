import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { rateLimiter } from "@/lib/sms/rate-limit"

describe("lib/sms/rate-limit", () => {
  beforeEach(() => {
    rateLimiter.__resetForTest()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe("checkAndConsumePhone", () => {
    it("allows first consume", () => {
      const r = rateLimiter.checkAndConsumePhone("13800138000")
      expect(r).toEqual({ ok: true })
    })

    it("blocks second consume within cooldown (60s)", () => {
      rateLimiter.checkAndConsumePhone("13800138000")
      vi.advanceTimersByTime(30_000)
      const r = rateLimiter.checkAndConsumePhone("13800138000")
      expect(r).toEqual({ ok: false, reason: "cooldown" })
    })

    it("allows consume after cooldown elapsed", () => {
      rateLimiter.checkAndConsumePhone("13800138000")
      vi.advanceTimersByTime(61_000)
      const r = rateLimiter.checkAndConsumePhone("13800138000")
      expect(r).toEqual({ ok: true })
    })

    it("blocks after hourly cap (default 5) within the hour", () => {
      // 5 次成功（每次推进 61s 跳过冷却）
      for (let i = 0; i < 5; i++) {
        const r = rateLimiter.checkAndConsumePhone("13800138000")
        expect(r).toEqual({ ok: true })
        vi.advanceTimersByTime(61_000)
      }
      // 第 6 次：仍在同一小时内（5*61s = 305s < 3600s）
      const r = rateLimiter.checkAndConsumePhone("13800138000")
      expect(r).toEqual({ ok: false, reason: "hourly" })
    })

    it("resets hourly cap after 1 hour", () => {
      for (let i = 0; i < 5; i++) {
        rateLimiter.checkAndConsumePhone("13800138000")
        vi.advanceTimersByTime(61_000)
      }
      // 推进至满 1 小时后
      vi.advanceTimersByTime(3_600_000)
      const r = rateLimiter.checkAndConsumePhone("13800138000")
      expect(r).toEqual({ ok: true })
    })

    it("isolates different phone numbers", () => {
      rateLimiter.checkAndConsumePhone("13800138000")
      const r = rateLimiter.checkAndConsumePhone("13900139000")
      expect(r).toEqual({ ok: true })
    })
  })

  describe("checkAndConsumeIp", () => {
    it("allows first consume", () => {
      expect(rateLimiter.checkAndConsumeIp("1.2.3.4")).toEqual({ ok: true })
    })

    it("blocks after IP hourly cap (default 10)", () => {
      for (let i = 0; i < 10; i++) {
        const r = rateLimiter.checkAndConsumeIp("1.2.3.4")
        expect(r).toEqual({ ok: true })
      }
      const r = rateLimiter.checkAndConsumeIp("1.2.3.4")
      expect(r).toEqual({ ok: false, reason: "hourly" })
    })

    it("isolates different IPs", () => {
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkAndConsumeIp("1.2.3.4")
      }
      expect(rateLimiter.checkAndConsumeIp("5.6.7.8")).toEqual({ ok: true })
    })

    it("resets after 1 hour", () => {
      for (let i = 0; i < 10; i++) {
        rateLimiter.checkAndConsumeIp("1.2.3.4")
      }
      vi.advanceTimersByTime(3_600_000)
      expect(rateLimiter.checkAndConsumeIp("1.2.3.4")).toEqual({ ok: true })
    })
  })

  describe("resetPhone", () => {
    it("clears the phone bucket so a new consume is allowed immediately", () => {
      rateLimiter.checkAndConsumePhone("13800138000")
      // 未推进时间，正常应处于冷却期
      expect(rateLimiter.checkAndConsumePhone("13800138000")).toEqual({
        ok: false,
        reason: "cooldown",
      })
      rateLimiter.resetPhone("13800138000")
      expect(rateLimiter.checkAndConsumePhone("13800138000")).toEqual({
        ok: true,
      })
    })
  })
})
