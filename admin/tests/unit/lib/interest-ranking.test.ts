import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * lib/interest-ranking 单元测试。
 *
 * 覆盖:
 * - resolveWindow:默认最近 N 天 / startDate 优先 / endDate 含当日
 * - computeHotInterests:SUM(score) 聚合映射 HotInterestDTO、非 approved/缺失标签跳过、空结果
 *
 * mock 层级:
 * - @/lib/db:select 返回可链式 .from().where().groupBy().orderBy().limit() 的对象,
 *   通过 `_setQueue` 预置两次查询结果(聚合行 + 分类行)依次 shift。
 */
type AggRow = { tagName: string; totalScore: number }

type TagRow = {
  id: string
  name: string
  categoryId: string
  pinyin: string | null
  pinyinInitials: string | null
  status: string
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
  categoryName?: string | null
  subCategoryName?: string | null
  categoryLevel?: number | null
}

function makeTagRow(overrides: Partial<TagRow> = {}): TagRow {
  return {
    id: overrides.id ?? "tag-1",
    name: overrides.name ?? "太极拳",
    categoryId: overrides.categoryId ?? "sub-martial",
    pinyin: overrides.pinyin !== undefined ? overrides.pinyin : "taijiquan",
    pinyinInitials: overrides.pinyinInitials !== undefined ? overrides.pinyinInitials : "tjq",
    status: overrides.status ?? "approved",
    createdBy: overrides.createdBy !== undefined ? overrides.createdBy : null,
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-01-01T00:00:00Z"),
    categoryName: overrides.categoryName !== undefined ? overrides.categoryName : "传统与民族文化",
    subCategoryName: overrides.subCategoryName !== undefined ? overrides.subCategoryName : "武术养生",
    categoryLevel: overrides.categoryLevel !== undefined ? overrides.categoryLevel : 2,
  }
}

const { mockDb, chainSelect, whereSpy, groupBySpy, orderBySpy, limitSpy } = vi.hoisted(() => {
  let queue: unknown[][] = []

  const chainSelect = {
    from: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    leftJoin: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    where: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    groupBy: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    orderBy: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    limit: vi.fn(async function () {
      return queue.shift() ?? []
    }),
    then: (
      resolve: (value: unknown[]) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(queue.shift() ?? []).then(resolve, reject),
  }

  const mockDb = {
    select: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    _setQueue(rows: unknown[][]) {
      queue = rows
    },
  }

  return {
    mockDb,
    chainSelect,
    whereSpy: chainSelect.where,
    groupBySpy: chainSelect.groupBy,
    orderBySpy: chainSelect.orderBy,
    limitSpy: chainSelect.limit,
  }
}) as {
  mockDb: {
    select: ReturnType<typeof vi.fn>
    _setQueue: (rows: unknown[][]) => void
  }
  chainSelect: {
    from: ReturnType<typeof vi.fn>
    leftJoin: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    groupBy: ReturnType<typeof vi.fn>
    orderBy: ReturnType<typeof vi.fn>
    limit: ReturnType<typeof vi.fn>
    then: (
      resolve: (value: unknown[]) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise<unknown>
  }
  whereSpy: ReturnType<typeof vi.fn>
  groupBySpy: ReturnType<typeof vi.fn>
  orderBySpy: ReturnType<typeof vi.fn>
  limitSpy: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/db", () => ({ db: mockDb }))

import { computeHotInterests, resolveWindow } from "@/lib/interest-ranking"

beforeEach(() => {
  vi.useRealTimers()
  mockDb.select.mockClear()
  chainSelect.from.mockClear()
  chainSelect.leftJoin.mockClear()
  chainSelect.where.mockClear()
  chainSelect.groupBy.mockClear()
  chainSelect.orderBy.mockClear()
  chainSelect.limit.mockClear()
  mockDb._setQueue([])
})

describe("resolveWindow", () => {
  it("defaults to the last 30 China-standard days (inclusive end)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-25T04:00:00Z")) // 2026-08-25 12:00 CST
    const w = resolveWindow({})
    expect(w.start).toBe("2026-07-26")
    expect(w.end).toBe("2026-08-25")
  })

  it("uses days when provided", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-25T04:00:00Z"))
    const w = resolveWindow({ days: 7 })
    expect(w.start).toBe("2026-08-18")
    expect(w.end).toBe("2026-08-25")
  })

  it("startDate takes precedence over days (end defaults to today)", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-08-25T04:00:00Z"))
    const w = resolveWindow({ days: 7, startDate: "2026-08-01" })
    expect(w.start).toBe("2026-08-01")
    expect(w.end).toBe("2026-08-25")
  })

  it("endDate is inclusive (both bounds explicit)", () => {
    const w = resolveWindow({ startDate: "2026-08-01", endDate: "2026-08-24" })
    expect(w.start).toBe("2026-08-01")
    expect(w.end).toBe("2026-08-24")
  })
})

describe("computeHotInterests", () => {
  it("maps aggregated scores to HotInterestDTO in the given order", async () => {
    const aggRows: AggRow[] = [
      { tagName: "太极拳", totalScore: 15 },
      { tagName: "书法", totalScore: 9 },
    ]
    const tagRows: TagRow[] = [
      makeTagRow({ id: "t1", name: "太极拳" }),
      makeTagRow({ id: "t2", name: "书法" }),
    ]
    mockDb._setQueue([aggRows, tagRows])

    const res = await computeHotInterests({ days: 7, limit: 2 })

    expect(res.list).toHaveLength(2)
    expect(res.list[0].name).toBe("太极拳")
    expect(res.list[0].heat).toBe(15)
    expect(res.list[1].name).toBe("书法")
    expect(res.list[1].heat).toBe(9)
    expect(groupBySpy).toHaveBeenCalled()
    expect(orderBySpy).toHaveBeenCalled()
    expect(limitSpy).toHaveBeenCalledWith(2)
  })

  it("skips tags that are missing or not approved in the tag library", async () => {
    const aggRows: AggRow[] = [
      { tagName: "太极拳", totalScore: 15 },
      { tagName: "已删除标签", totalScore: 3 },
    ]
    const tagRows: TagRow[] = [makeTagRow({ id: "t1", name: "太极拳" })]
    mockDb._setQueue([aggRows, tagRows])

    const res = await computeHotInterests({ days: 7 })

    expect(res.list).toHaveLength(1)
    expect(res.list[0].name).toBe("太极拳")
    expect(res.list[0].heat).toBe(15)
  })

  it("returns an empty list when the aggregation has no rows", async () => {
    mockDb._setQueue([])
    const res = await computeHotInterests({ days: 7 })
    expect(res.list).toEqual([])
    expect(mockDb.select).toHaveBeenCalledTimes(1)
  })

  it("applies the event_date window filter", async () => {
    mockDb._setQueue([[], []])
    await computeHotInterests({ startDate: "2026-08-01", endDate: "2026-08-24" })
    expect(whereSpy).toHaveBeenCalled()
  })
})
