import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * GET /api/interests/hot 集成测试。
 *
 * 覆盖:
 * - 参数校验:days 越界 / limit 越界 / 日期格式非法 → 400
 * - 合法请求:聚合 SUM(score) + 分类关联 → 按 heat 降序返回 HotInterestDTO
 * - 窗口内无事件 → { list: [] }
 * - 事件中的标签已删除/改名/非 approved → 跳过
 * - limit / 窗口参数透传到聚合查询
 *
 * mock 层级:
 * - @/lib/db:select 返回可链式 .from().where().groupBy().orderBy().limit() 的对象,
 *   通过 _setQueue 预置两次查询结果(聚合行 + 分类行)依次 shift。
 * - @/lib/logger:避免输出噪音。
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

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { INTEREST: "INTEREST" },
}))

import { GET } from "@/app/api/interests/hot/route"
import type { HotInterestDTO, IResponse } from "@/types/api"

beforeEach(() => {
  mockDb.select.mockClear()
  chainSelect.from.mockClear()
  chainSelect.leftJoin.mockClear()
  chainSelect.where.mockClear()
  chainSelect.groupBy.mockClear()
  chainSelect.orderBy.mockClear()
  chainSelect.limit.mockClear()
  mockDb._setQueue([])
})

function makeUrl(path: string): URL {
  return new URL(`http://localhost${path}`)
}

describe("GET /api/interests/hot", () => {
  it("returns 400 when days is out of range", async () => {
    for (const days of ["0", "91"]) {
      const req = new Request(makeUrl(`/api/interests/hot?days=${days}`), {
        method: "GET",
      })
      const res = await GET(req)
      expect(res.status).toBe(400)
      const body = (await res.json()) as IResponse<null>
      expect(body.code).toBe(400)
    }
  })

  it("returns 400 when limit is out of range", async () => {
    for (const limit of ["0", "51"]) {
      const req = new Request(makeUrl(`/api/interests/hot?limit=${limit}`), {
        method: "GET",
      })
      const res = await GET(req)
      expect(res.status).toBe(400)
    }
  })

  it("returns 400 when startDate/endDate have an invalid format", async () => {
    const req = new Request(makeUrl("/api/interests/hot?startDate=2026/08/01"), {
      method: "GET",
    })
    const res = await GET(req)
    expect(res.status).toBe(400)
  })

  it("returns hot interests ordered by score desc with category info", async () => {
    const aggRows: AggRow[] = [
      { tagName: "太极拳", totalScore: 15 },
      { tagName: "书法", totalScore: 9 },
    ]
    const tagRows: TagRow[] = [
      makeTagRow({ id: "t1", name: "太极拳" }),
      makeTagRow({ id: "t2", name: "书法", subCategoryName: "书画篆刻", categoryName: "视觉与造型艺术" }),
    ]
    mockDb._setQueue([aggRows, tagRows])

    const req = new Request(makeUrl("/api/interests/hot?days=7&limit=2"), {
      method: "GET",
    })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ list: HotInterestDTO[] }>
    expect(body.code).toBe(200)
    expect(body.data.list).toHaveLength(2)
    expect(body.data.list[0]!.name).toBe("太极拳")
    expect(body.data.list[0]!.heat).toBe(15)
    expect(body.data.list[0]!.category).toBe("传统与民族文化")
    expect(body.data.list[1]!.name).toBe("书法")
    expect(body.data.list[1]!.heat).toBe(9)
    // 聚合链路:groupBy + orderBy(SUM desc) + limit
    expect(groupBySpy).toHaveBeenCalled()
    expect(orderBySpy).toHaveBeenCalled()
    expect(limitSpy).toHaveBeenCalledWith(2)
  })

  it("returns an empty list when there are no events in the window", async () => {
    mockDb._setQueue([])
    const req = new Request(makeUrl("/api/interests/hot?days=7"), { method: "GET" })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ list: HotInterestDTO[] }>
    expect(body.data.list).toEqual([])
  })

  it("skips tags that are missing or not approved in the tag library", async () => {
    const aggRows: AggRow[] = [
      { tagName: "太极拳", totalScore: 15 },
      { tagName: "已删除标签", totalScore: 3 },
    ]
    const tagRows: TagRow[] = [makeTagRow({ id: "t1", name: "太极拳" })]
    mockDb._setQueue([aggRows, tagRows])

    const req = new Request(makeUrl("/api/interests/hot"), { method: "GET" })
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ list: HotInterestDTO[] }>
    expect(body.data.list).toHaveLength(1)
    expect(body.data.list[0]!.name).toBe("太极拳")
  })

  it("applies the explicit startDate/endDate window and default limit 10", async () => {
    mockDb._setQueue([[], []])
    const req = new Request(
      makeUrl("/api/interests/hot?startDate=2026-08-01&endDate=2026-08-24"),
      { method: "GET" }
    )
    const res = await GET(req)
    expect(res.status).toBe(200)
    // 窗口过滤(where)命中聚合查询;默认 limit 10
    expect(whereSpy).toHaveBeenCalled()
    expect(limitSpy).toHaveBeenCalledWith(10)
  })
})
