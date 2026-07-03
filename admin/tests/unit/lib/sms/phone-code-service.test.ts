import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * phone-code-service 单元测试。
 * 重点覆盖 verifyCode 的状态机（not_found / expired / max_attempts / mismatch / ok）
 * 以及 mismatch 路径的原子自增更新。
 */

type Row = Record<string, unknown>

const { mockDb, chainSelect, chainUpdate, chainInsert } = vi.hoisted(() => {
  const mockDb = {
    _selectResult: [] as Row[],
    select: vi.fn(function () {
      return chainSelect
    }),
    update: vi.fn(function () {
      return chainUpdate
    }),
    _insertResult: [] as Row[],
    insert: vi.fn(function () {
      return chainInsert
    }),
  }

  const chainSelect = {
    from: vi.fn(() => chainSelect),
    where: vi.fn(() => chainSelect),
    orderBy: vi.fn(() => chainSelect),
    limit: vi.fn(async () => mockDb._selectResult),
  }

  const chainUpdate = {
    set: vi.fn(() => chainUpdate),
    where: vi.fn(async () => ({ rowsChanged: 1 })),
  }

  const chainInsert = {
    values: vi.fn(async () => undefined),
  }

  return { mockDb, chainSelect, chainUpdate, chainInsert }
})

vi.mock("@/lib/db", () => ({ db: mockDb }))

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { AUTH: "AUTH", SMS: "SMS", ACCOUNT: "ACCOUNT", WECHAT: "WECHAT" },
}))

// 控制 bcrypt.compare 的返回值
const { compareMock, hashMock } = vi.hoisted(() => ({
  compareMock: vi.fn(),
  hashMock: vi.fn(),
}))
vi.mock("bcryptjs", () => ({
  default: { compare: compareMock, hash: hashMock },
}))

import { verifyCode, issueCode } from "@/lib/sms/phone-code-service"

function resetMock() {
  mockDb._selectResult = []
  mockDb._insertResult = []
  mockDb.select.mockClear()
  mockDb.update.mockClear()
  mockDb.insert.mockClear()
  chainSelect.from.mockClear()
  chainSelect.where.mockClear()
  chainSelect.orderBy.mockClear()
  chainSelect.limit.mockClear()
  chainUpdate.set.mockClear()
  chainUpdate.where.mockClear()
  chainInsert.values.mockClear()
  compareMock.mockReset()
  hashMock.mockReset()
}

describe("lib/sms/phone-code-service", () => {
  beforeEach(() => {
    resetMock()
    hashMock.mockResolvedValue("hashed-code")
  })

  describe("issueCode", () => {
    it("hashes the code and inserts a record, returns plaintext code", async () => {
      const code = await issueCode("13800138000")
      expect(code).toMatch(/^\d{6}$/)
      expect(hashMock).toHaveBeenCalledTimes(1)
      expect(mockDb.insert).toHaveBeenCalledTimes(1)
      expect(chainInsert.values).toHaveBeenCalledTimes(1)
    })
  })

  describe("verifyCode", () => {
    it("returns not_found when no unconsumed record exists", async () => {
      mockDb._selectResult = []
      const r = await verifyCode("13800138000", "123456")
      expect(r).toEqual({ ok: false, reason: "not_found" })
      expect(compareMock).not.toHaveBeenCalled()
    })

    it("returns expired when expiresAt is in the past", async () => {
      mockDb._selectResult = [
        {
          id: "c1",
          phone: "13800138000",
          codeHash: "hashed",
          attempts: 0,
          expiresAt: new Date("2020-01-01"),
          consumedAt: null,
          createdAt: new Date("2020-01-01"),
        },
      ]
      const r = await verifyCode("13800138000", "123456")
      expect(r).toEqual({ ok: false, reason: "expired" })
      expect(compareMock).not.toHaveBeenCalled()
      // 过期不应消费或自增
      expect(mockDb.update).not.toHaveBeenCalled()
    })

    it("returns max_attempts and consumes the record when attempts cap reached", async () => {
      mockDb._selectResult = [
        {
          id: "c1",
          phone: "13800138000",
          codeHash: "hashed",
          attempts: 5, // 默认上限 5
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
          createdAt: new Date(),
        },
      ]
      const r = await verifyCode("13800138000", "123456")
      expect(r).toEqual({ ok: false, reason: "max_attempts" })
      expect(compareMock).not.toHaveBeenCalled()
      // 应标记 consumedAt 阻断后续尝试
      expect(mockDb.update).toHaveBeenCalledTimes(1)
      expect(chainUpdate.set).toHaveBeenCalledTimes(1)
    })

    it("returns ok and consumes the record on matching code", async () => {
      mockDb._selectResult = [
        {
          id: "c1",
          phone: "13800138000",
          codeHash: "hashed",
          attempts: 0,
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
          createdAt: new Date(),
        },
      ]
      compareMock.mockResolvedValue(true)

      const r = await verifyCode("13800138000", "123456")
      expect(r).toEqual({ ok: true })
      expect(mockDb.update).toHaveBeenCalledTimes(1)
      // set 被调用以写入 consumedAt
      expect(chainUpdate.set).toHaveBeenCalledTimes(1)
    })

    it("returns mismatch and triggers an update on mismatch", async () => {
      mockDb._selectResult = [
        {
          id: "c1",
          phone: "13800138000",
          codeHash: "hashed",
          attempts: 2,
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
          createdAt: new Date(),
        },
      ]
      compareMock.mockResolvedValue(false)

      const r = await verifyCode("13800138000", "000000")
      expect(r).toEqual({ ok: false, reason: "mismatch" })
      // 必须发起一次 update（原子自增 attempts）
      expect(mockDb.update).toHaveBeenCalledTimes(1)
      expect(chainUpdate.set).toHaveBeenCalledTimes(1)
      expect(chainUpdate.where).toHaveBeenCalledTimes(1)
    })
  })
})
