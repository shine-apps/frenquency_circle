import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getCacheStore } from "@/lib/cache"
import { rateLimiter } from "@/lib/sms/rate-limit"

describe("lib/sms/rate-limit", () => {
  beforeEach(async () => {
    await rateLimiter.__resetForTest()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe("checkAndConsumePhone", () => {
    it("allows first consume", async () => {
      const r = await rateLimiter.checkAndConsumePhone("13800138000")
      expect(r).toEqual({ ok: true })
    })

    it("blocks second consume within cooldown (60s)", async () => {
      await rateLimiter.checkAndConsumePhone("13800138000")
      vi.setSystemTime(new Date("2026-01-01T00:00:30Z"))
      const r = await rateLimiter.checkAndConsumePhone("13800138000")
      expect(r).toEqual({ ok: false, reason: "cooldown" })
    })

    it("allows consume after cooldown elapsed", async () => {
      await rateLimiter.checkAndConsumePhone("13800138000")
      vi.setSystemTime(new Date("2026-01-01T00:01:01Z"))
      const r = await rateLimiter.checkAndConsumePhone("13800138000")
      expect(r).toEqual({ ok: true })
    })

    it("blocks after hourly cap (default 5) within the hour", async () => {
      // 5 次成功（每次推进 61s 跳过冷却）
      for (let i = 0; i < 5; i++) {
        const r = await rateLimiter.checkAndConsumePhone("13800138000")
        expect(r).toEqual({ ok: true })
        vi.setSystemTime(new Date(Date.now() + 61_000))
      }
      // 第 6 次：仍在同一小时内（5*61s = 305s < 3600s）
      const r = await rateLimiter.checkAndConsumePhone("13800138000")
      expect(r).toEqual({ ok: false, reason: "hourly" })
    })

    it("does not leave a cooldown behind when blocked by the hourly cap", async () => {
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkAndConsumePhone("13800138000")
        vi.setSystemTime(new Date(Date.now() + 61_000))
      }
      expect(await rateLimiter.checkAndConsumePhone("13800138000")).toEqual({
        ok: false,
        reason: "hourly",
      })
      // 超限拒绝不应消费冷却窗口：紧接着重试仍报 hourly 而非 cooldown
      expect(await rateLimiter.checkAndConsumePhone("13800138000")).toEqual({
        ok: false,
        reason: "hourly",
      })
    })

    it("resets hourly cap after 1 hour", async () => {
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkAndConsumePhone("13800138000")
        vi.setSystemTime(new Date(Date.now() + 61_000))
      }
      // 推进至满 1 小时后
      vi.setSystemTime(new Date(Date.now() + 3_600_000))
      const r = await rateLimiter.checkAndConsumePhone("13800138000")
      expect(r).toEqual({ ok: true })
    })

    it("isolates different phone numbers", async () => {
      await rateLimiter.checkAndConsumePhone("13800138000")
      const r = await rateLimiter.checkAndConsumePhone("13900139000")
      expect(r).toEqual({ ok: true })
    })

    it("fails open when the cache layer throws", async () => {
      const store = await getCacheStore()
      vi.spyOn(store, "setIfAbsent").mockRejectedValueOnce(new Error("cache down"))
      await expect(rateLimiter.checkAndConsumePhone("13800138000")).resolves.toEqual({
        ok: true,
      })
    })
  })

  describe("checkAndConsumeIp", () => {
    it("allows first consume", async () => {
      await expect(rateLimiter.checkAndConsumeIp("1.2.3.4")).resolves.toEqual({ ok: true })
    })

    it("blocks after IP hourly cap (default 10)", async () => {
      for (let i = 0; i < 10; i++) {
        const r = await rateLimiter.checkAndConsumeIp("1.2.3.4")
        expect(r).toEqual({ ok: true })
      }
      const r = await rateLimiter.checkAndConsumeIp("1.2.3.4")
      expect(r).toEqual({ ok: false, reason: "hourly" })
    })

    it("isolates different IPs", async () => {
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkAndConsumeIp("1.2.3.4")
      }
      await expect(rateLimiter.checkAndConsumeIp("5.6.7.8")).resolves.toEqual({ ok: true })
    })

    it("resets after 1 hour", async () => {
      for (let i = 0; i < 10; i++) {
        await rateLimiter.checkAndConsumeIp("1.2.3.4")
      }
      vi.setSystemTime(new Date(Date.now() + 3_600_000))
      await expect(rateLimiter.checkAndConsumeIp("1.2.3.4")).resolves.toEqual({ ok: true })
    })

    it("fails open when the cache layer throws", async () => {
      const store = await getCacheStore()
      vi.spyOn(store, "incr").mockRejectedValueOnce(new Error("cache down"))
      await expect(rateLimiter.checkAndConsumeIp("1.2.3.4")).resolves.toEqual({ ok: true })
    })
  })

  describe("resetPhone", () => {
    it("clears the phone bucket so a new consume is allowed immediately", async () => {
      await rateLimiter.checkAndConsumePhone("13800138000")
      // 未推进时间，正常应处于冷却期
      await expect(rateLimiter.checkAndConsumePhone("13800138000")).resolves.toEqual({
        ok: false,
        reason: "cooldown",
      })
      await rateLimiter.resetPhone("13800138000")
      await expect(rateLimiter.checkAndConsumePhone("13800138000")).resolves.toEqual({
        ok: true,
      })
    })

    it("also clears the hourly counter", async () => {
      for (let i = 0; i < 5; i++) {
        await rateLimiter.checkAndConsumePhone("13800138000")
        vi.setSystemTime(new Date(Date.now() + 61_000))
      }
      await rateLimiter.resetPhone("13800138000")
      await expect(rateLimiter.checkAndConsumePhone("13800138000")).resolves.toEqual({
        ok: true,
      })
    })
  })

  describe("key privacy", () => {
    it("hashes phone / ip in cache keys so PII never lands in the Redis keyspace", async () => {
      const store = await getCacheStore()
      const setIfAbsentSpy = vi.spyOn(store, "setIfAbsent")
      const incrSpy = vi.spyOn(store, "incr")

      await rateLimiter.checkAndConsumePhone("13800138000")
      await rateLimiter.checkAndConsumeIp("1.2.3.4")

      const keys = [
        ...setIfAbsentSpy.mock.calls.map(([key]) => key),
        ...incrSpy.mock.calls.map(([key]) => key),
      ]
      expect(keys).toHaveLength(3)
      for (const key of keys) {
        expect(key).toContain("ratelimit:")
        expect(key).not.toContain("13800138000")
        expect(key).not.toContain("1.2.3.4")
      }
    })
  })
})
