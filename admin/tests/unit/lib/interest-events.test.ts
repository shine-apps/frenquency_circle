import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * lib/interest-events 单元测试。
 *
 * 覆盖:
 * - chinaDay 东八区自然日(凌晨/UTC 边界不跨天)
 * - interestScore 与锚定日期 2026-08-24 的天数差(含 0 / 钳制 / 跨月)
 * - recordInterestEvents 幂等 insert(onConflictDoNothing target)、空标签跳过、旁路吞错
 *
 * mock 层级:
 * - @/lib/db:insert 返回可链式 .values().onConflictDoNothing() 的对象
 * - @/lib/logger:静默 logger,记录 error 调用
 */
const { mockDb, chainInsert } = vi.hoisted(() => {
  const chainInsert = {
    values: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    onConflictDoNothing: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    returning: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve([]).then(resolve, reject),
  }
  const mockDb = {
    insert: vi.fn(function (this: unknown) {
      return chainInsert
    }),
  }
  return { mockDb, chainInsert }
}) as {
  mockDb: { insert: ReturnType<typeof vi.fn> }
  chainInsert: {
    values: ReturnType<typeof vi.fn>
    onConflictDoNothing: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise<unknown>
  }
}

vi.mock("@/lib/db", () => ({ db: mockDb }))

const { logger } = vi.hoisted(() => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}))

vi.mock("@/lib/logger", () => ({
  logger,
  LOG_PREFIX: { INTEREST: "INTEREST" },
}))

import { chinaDay, interestScore, recordInterestEvents } from "@/lib/interest-events"
import { interestEvents } from "@/db/schema"

beforeEach(() => {
  vi.useRealTimers()
  mockDb.insert.mockClear()
  chainInsert.values.mockClear()
  chainInsert.onConflictDoNothing.mockClear()
  logger.error.mockClear()
})

describe("chinaDay", () => {
  it("returns the China Standard Time natural day (YYYY-MM-DD)", () => {
    // 2026-08-25 09:00 CST = 2026-08-25T01:00:00Z
    expect(chinaDay(new Date("2026-08-25T01:00:00Z"))).toBe("2026-08-25")
  })

  it("does not roll over at midnight (00:30 CST belongs to the 25th)", () => {
    // 2026-08-25 00:30 CST = 2026-08-24T16:30:00Z
    expect(chinaDay(new Date("2026-08-24T16:30:00Z"))).toBe("2026-08-25")
  })

  it("maps an early-UTC date to the previous China day", () => {
    // 2026-08-24T16:00:00Z = 2026-08-25 00:00 CST
    expect(chinaDay(new Date("2026-08-24T16:00:00Z"))).toBe("2026-08-25")
  })
})

describe("interestScore", () => {
  it("scores 0 on the anchor day", () => {
    expect(interestScore("2026-08-24")).toBe(0)
  })

  it("scores 1 one day after the anchor", () => {
    expect(interestScore("2026-08-25")).toBe(1)
  })

  it("clamps to 0 before the anchor", () => {
    expect(interestScore("2026-08-20")).toBe(0)
  })

  it("scores the day difference across months", () => {
    expect(interestScore("2026-08-31")).toBe(7)
    expect(interestScore("2026-09-01")).toBe(8)
  })
})

describe("recordInterestEvents", () => {
  it("builds rows with eventDate + score and inserts with onConflictDoNothing target", async () => {
    vi.useFakeTimers()
    // 2026-08-25 00:30 CST = 2026-08-24T16:30Z,仍属于 08-25,得分 1
    vi.setSystemTime(new Date("2026-08-24T16:30:00Z"))

    await recordInterestEvents([
      { userId: "u1", tagNames: ["太极拳", "书法"], eventType: "hobby_tag_save" },
    ])

    expect(chainInsert.values).toHaveBeenCalledWith([
      { userId: "u1", tagName: "太极拳", eventType: "hobby_tag_save", eventDate: "2026-08-25", score: 1 },
      { userId: "u1", tagName: "书法", eventType: "hobby_tag_save", eventDate: "2026-08-25", score: 1 },
    ])
    expect(chainInsert.onConflictDoNothing).toHaveBeenCalledWith({
      target: [interestEvents.userId, interestEvents.tagName, interestEvents.eventDate],
    })
  })

  it("does nothing when there are no tag names", async () => {
    await recordInterestEvents([{ userId: "u1", tagNames: [], eventType: "tag_search" }])
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("swallows insert errors (side-effect must not fail the caller)", async () => {
    chainInsert.values.mockImplementationOnce(() => {
      throw new Error("db down")
    })

    await expect(
      recordInterestEvents([{ userId: "u1", tagNames: ["太极拳"], eventType: "hobby_tag_save" }])
    ).resolves.toBeUndefined()

    expect(logger.error).toHaveBeenCalled()
  })
})
