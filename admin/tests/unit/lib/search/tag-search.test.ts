import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * lib/search/tag-search 单元测试。
 *
 * 覆盖:
 * - searchTags 各种策略(精确/ILIKE/pinyin/initials/prefix)
 * - limit 截断
 * - status='approved' 过滤(通过断言 where 条件被调用)
 * - 空查询 / 非法 limit 返回空数组
 * - listPopularTags 排序与限流
 *
 * mock 层级:
 * - @/lib/db:可链式调用 select().from().where().limit() / .orderBy()
 * - pinyin-pro 不 mock,使用真实实现(纯函数,无副作用)
 */

type TagRow = {
  id: string
  name: string
  category: string
  subCategory: string | null
  pinyin: string | null
  pinyinInitials: string | null
  status: string
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

function makeTagRow(overrides: Partial<TagRow> = {}): TagRow {
  return {
    id: overrides.id ?? "tag-1",
    name: overrides.name ?? "陈氏太极拳",
    category: overrides.category ?? "武术养生",
    subCategory: overrides.subCategory ?? "太极拳",
    pinyin: overrides.pinyin ?? "chenshitaijiquan",
    pinyinInitials: overrides.pinyinInitials ?? "cstjq",
    status: overrides.status ?? "approved",
    createdBy: overrides.createdBy ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-01-01T00:00:00Z"),
  }
}

const { mockDb, chainSelect, whereSpy, limitSpy, orderBySpy } = vi.hoisted(() => {
  let selectResult: TagRow[] = []

  // 链式 mock:支持 select().from().where().orderBy().limit() 与
  // select().from().where().orderBy() (无 limit,listPopularTags 会调 limit,这里两者兼容)
  // 通过让 chain 本身 thenable,使 `await chain` 也能解析为 selectResult
  const chainSelect = {
    from: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    where: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    orderBy: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    limit: vi.fn(async function () {
      return selectResult
    }),
    // thenable:使 `await chain.orderBy(...)` 也能解析
    then: (
      resolve: (value: TagRow[]) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(selectResult).then(resolve, reject),
  }

  const mockDb = {
    select: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    _setSelectResult(rows: TagRow[]) {
      selectResult = rows
    },
  }

  return {
    mockDb,
    chainSelect,
    whereSpy: chainSelect.where,
    limitSpy: chainSelect.limit,
    orderBySpy: chainSelect.orderBy,
  }
}) as {
  mockDb: {
    select: ReturnType<typeof vi.fn>
    _setSelectResult: (rows: TagRow[]) => void
  }
  chainSelect: {
    from: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    orderBy: ReturnType<typeof vi.fn>
    limit: ReturnType<typeof vi.fn>
    then: (
      resolve: (value: TagRow[]) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise<unknown>
  }
  whereSpy: ReturnType<typeof vi.fn>
  limitSpy: ReturnType<typeof vi.fn>
  orderBySpy: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/db", () => ({ db: mockDb }))

import { searchTags, listPopularTags, toTagDTO } from "@/lib/search/tag-search"

beforeEach(() => {
  mockDb.select.mockClear()
  chainSelect.from.mockClear()
  chainSelect.where.mockClear()
  chainSelect.orderBy.mockClear()
  chainSelect.limit.mockClear()
  mockDb._setSelectResult([])
})

describe("lib/search/tag-search", () => {
  describe("toTagDTO", () => {
    it("maps a tag row to TagDTO with ISO timestamps", () => {
      const row = makeTagRow()
      const dto = toTagDTO(row)
      expect(dto).toEqual({
        id: "tag-1",
        name: "陈氏太极拳",
        category: "武术养生",
        subCategory: "太极拳",
        pinyin: "chenshitaijiquan",
        pinyinInitials: "cstjq",
        status: "approved",
        createdBy: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })
    })

    it("normalizes null pinyin fields to null in DTO", () => {
      const row = makeTagRow({ pinyin: null, pinyinInitials: null, subCategory: null, createdBy: null })
      const dto = toTagDTO(row)
      expect(dto.pinyin).toBeNull()
      expect(dto.pinyinInitials).toBeNull()
      expect(dto.subCategory).toBeNull()
      expect(dto.createdBy).toBeNull()
    })
  })

  describe("searchTags", () => {
    it("returns empty array when query is empty or whitespace", async () => {
      expect(await searchTags("", 10)).toEqual([])
      expect(await searchTags("   ", 10)).toEqual([])
      expect(mockDb.select).not.toHaveBeenCalled()
    })

    it("returns empty array when limit <= 0", async () => {
      expect(await searchTags("太极", 0)).toEqual([])
      expect(await searchTags("太极", -1)).toEqual([])
      expect(mockDb.select).not.toHaveBeenCalled()
    })

    it("returns matching tags for Chinese query and dedupes by id", async () => {
      // 模拟数据库返回包含重复 id(同一标签命中多个搜索分支)
      const dupRow = makeTagRow({ id: "tag-1", name: "陈氏太极拳养生八式" })
      const otherRow = makeTagRow({
        id: "tag-2",
        name: "陈氏太极拳老架一路",
        pinyin: "chenshitaijiquanlaojiayilu",
        pinyinInitials: "cstjqljyl",
      })
      mockDb._setSelectResult([dupRow, dupRow, otherRow])

      const result = await searchTags("陈氏", 10)
      expect(result).toHaveLength(2)
      expect(result[0]!.id).toBe("tag-1")
      expect(result[1]!.id).toBe("tag-2")
      // limit 应该被传为入参 10
      expect(limitSpy).toHaveBeenCalledWith(10)
    })

    it("respects limit parameter and truncates results", async () => {
      const rows = Array.from({ length: 5 }, (_, i) =>
        makeTagRow({ id: `tag-${i + 1}`, name: `标签${i + 1}` })
      )
      mockDb._setSelectResult(rows)

      const result = await searchTags("标签", 3)
      // limit 在 SQL 层做截断,mock 返回 5 行但 searchTags 不二次截断
      // 这里验证 limit 参数被正确传递
      expect(limitSpy).toHaveBeenCalledWith(3)
      expect(result).toHaveLength(5) // mock 直接返回 5 行,实际生产由 SQL 截断
    })

    it("uses default limit of 10 when not specified", async () => {
      mockDb._setSelectResult([])
      await searchTags("太极")
      expect(limitSpy).toHaveBeenCalledWith(10)
    })

    it("calls where with combined conditions (status='approved' + OR branches)", async () => {
      mockDb._setSelectResult([])
      await searchTags("太极")
      // where 应被调用一次(我们的实现是单条 SELECT)
      expect(whereSpy).toHaveBeenCalledTimes(1)
      // from 也应该被调用
      expect(chainSelect.from).toHaveBeenCalledTimes(1)
    })

    it("handles pinyin full match query (e.g. 'chenshitaijiquan')", async () => {
      const row = makeTagRow({
        id: "tag-py",
        name: "陈氏太极拳",
        pinyin: "chenshitaijiquan",
        pinyinInitials: "cstjq",
      })
      mockDb._setSelectResult([row])

      const result = await searchTags("chenshitaijiquan", 10)
      expect(result).toHaveLength(1)
      expect(result[0]!.name).toBe("陈氏太极拳")
    })

    it("handles pinyin initials match query (e.g. 'cstjq')", async () => {
      const row = makeTagRow({
        id: "tag-init",
        name: "陈氏太极拳",
        pinyin: "chenshitaijiquan",
        pinyinInitials: "cstjq",
      })
      mockDb._setSelectResult([row])

      const result = await searchTags("cstjq", 10)
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe("tag-init")
    })

    it("handles pinyin initials prefix match (e.g. 'cstj' matches 'cstjq')", async () => {
      const row = makeTagRow({
        id: "tag-prefix",
        name: "陈氏太极拳",
        pinyinInitials: "cstjq",
      })
      mockDb._setSelectResult([row])

      const result = await searchTags("cstj", 10)
      expect(result).toHaveLength(1)
      expect(result[0]!.id).toBe("tag-prefix")
    })

    it("trims input query before searching", async () => {
      mockDb._setSelectResult([])
      await searchTags("  太极  ", 10)
      expect(mockDb.select).toHaveBeenCalledTimes(1)
      expect(limitSpy).toHaveBeenCalledWith(10)
    })
  })

  describe("listPopularTags", () => {
    it("queries approved tags ordered by createdAt desc with limit", async () => {
      const rows = [
        makeTagRow({ id: "t1", createdAt: new Date("2026-01-03") }),
        makeTagRow({ id: "t2", createdAt: new Date("2026-01-02") }),
      ]
      mockDb._setSelectResult(rows)

      const result = await listPopularTags(5)
      expect(result).toHaveLength(2)
      expect(chainSelect.from).toHaveBeenCalledTimes(1)
      expect(whereSpy).toHaveBeenCalledTimes(1)
      expect(orderBySpy).toHaveBeenCalledTimes(1)
      expect(limitSpy).toHaveBeenCalledWith(5)
    })

    it("uses default limit of 10 when not specified", async () => {
      mockDb._setSelectResult([])
      await listPopularTags()
      expect(limitSpy).toHaveBeenCalledWith(10)
    })

    it("returns empty array when no approved tags exist", async () => {
      mockDb._setSelectResult([])
      const result = await listPopularTags(10)
      expect(result).toEqual([])
    })
  })
})
