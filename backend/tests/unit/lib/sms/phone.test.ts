import { afterEach, beforeEach, describe, expect, it } from "vitest"
import {
  generateCode,
  isValidPhone,
  normalizePhone,
  phoneToEmail,
} from "@/lib/sms/phone"

describe("lib/sms/phone", () => {
  describe("normalizePhone", () => {
    it("strips whitespace", () => {
      expect(normalizePhone("138 0013 8000")).toBe("13800138000")
    })
    it("strips +86 prefix", () => {
      expect(normalizePhone("+8613800138000")).toBe("13800138000")
    })
    it("strips 0086 prefix", () => {
      expect(normalizePhone("008613800138000")).toBe("13800138000")
    })
    it("strips 86 prefix when length is 13", () => {
      expect(normalizePhone("8613800138000")).toBe("13800138000")
    })
    it("returns digits only for plain input", () => {
      expect(normalizePhone("13800138000")).toBe("13800138000")
    })
    it("handles empty / null-ish input", () => {
      expect(normalizePhone("")).toBe("")
      expect(normalizePhone(null as unknown as string)).toBe("")
    })
  })

  describe("isValidPhone", () => {
    it("accepts valid Chinese mainland mobile numbers", () => {
      expect(isValidPhone("13800138000")).toBe(true)
      expect(isValidPhone("15912345678")).toBe(true)
      expect(isValidPhone("19900001111")).toBe(true)
    })
    it("accepts with +86 prefix", () => {
      expect(isValidPhone("+8613800138000")).toBe(true)
    })
    it("rejects too-short numbers", () => {
      expect(isValidPhone("12345")).toBe(false)
    })
    it("rejects numbers not starting with 1[3-9]", () => {
      expect(isValidPhone("12000000000")).toBe(false)
      expect(isValidPhone("11000000000")).toBe(false)
    })
    it("rejects empty", () => {
      expect(isValidPhone("")).toBe(false)
    })
  })

  describe("phoneToEmail", () => {
    afterEach(() => {
      delete process.env.PHONE_DOMAIN
    })

    it("uses default phonedomain.com when env not set", () => {
      delete process.env.PHONE_DOMAIN
      expect(phoneToEmail("13800138000")).toBe("13800138000@phonedomain.com")
    })

    it("honors PHONE_DOMAIN env override", () => {
      process.env.PHONE_DOMAIN = "example.test"
      expect(phoneToEmail("+8613800138000")).toBe(
        "13800138000@example.test"
      )
    })
  })

  describe("generateCode", () => {
    it("returns a 6-char numeric string", () => {
      const code = generateCode()
      expect(code).toMatch(/^\d{6}$/)
    })

    it("is in range [100000, 999999]", () => {
      for (let i = 0; i < 50; i++) {
        const n = Number(generateCode())
        expect(n).toBeGreaterThanOrEqual(100000)
        expect(n).toBeLessThanOrEqual(999999)
      }
    })
  })
})
