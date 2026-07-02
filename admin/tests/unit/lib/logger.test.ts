import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { logger, LOG_PREFIX } from "@/lib/logger"

describe("lib/logger", () => {
  let infoSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("logger.info calls console.info with timestamped prefixed line", () => {
    logger.info(LOG_PREFIX.AUTH, "hello")
    expect(infoSpy).toHaveBeenCalledTimes(1)
    const line = infoSpy.mock.calls[0]?.[0] as string
    expect(line).toContain("[AUTH]")
    expect(line).toContain("hello")
    // ISO timestamp 形如 2026-01-01T00:00:00.000Z
    expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/)
  })

  it("logger.warn calls console.warn", () => {
    logger.warn(LOG_PREFIX.SMS, "warn msg")
    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(warnSpy.mock.calls[0]?.[0]).toContain("[SMS]")
    expect(warnSpy.mock.calls[0]?.[0]).toContain("warn msg")
  })

  it("logger.error calls console.error", () => {
    logger.error(LOG_PREFIX.ACCOUNT, "err")
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0]?.[0]).toContain("[ACCOUNT]")
  })

  it("appends JSON context when provided", () => {
    logger.info(LOG_PREFIX.AUTH, "with ctx", { userId: "u1", ok: true })
    const line = infoSpy.mock.calls[0]?.[0] as string
    expect(line).toContain('"userId":"u1"')
    expect(line).toContain('"ok":true')
  })

  it("does not append trailing space when context is absent", () => {
    logger.info(LOG_PREFIX.AUTH, "no ctx")
    const line = infoSpy.mock.calls[0]?.[0] as string
    // 行尾即消息本身，无多余空格
    expect(line.endsWith("no ctx")).toBe(true)
  })

  it("LOG_PREFIX exposes AUTH / SMS / ACCOUNT constants", () => {
    expect(LOG_PREFIX.AUTH).toBe("AUTH")
    expect(LOG_PREFIX.SMS).toBe("SMS")
    expect(LOG_PREFIX.ACCOUNT).toBe("ACCOUNT")
  })
})
