import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 业务接入层缓存行为的单元测试(不连真实数据库/Redis):
 * - 分类树 / 系统设置 / 标签搜索:命中缓存不再查库;
 * - 写接口失效函数:调用后下一次读取重新查库。
 *
 * mock 层级:@/lib/db 用可链式调用并记录 select 次数的假实现。
 */

const { dbMock, selectCalls } = vi.hoisted(() => {
  const selectCalls = { count: 0 }
  let rows: unknown[] = []

  const chain: Record<string, unknown> = {}
  const passthrough = () => chain
  Object.assign(chain, {
    from: passthrough,
    leftJoin: passthrough,
    where: passthrough,
    orderBy: async () => rows,
    limit: async () => rows,
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  })

  const dbMock = {
    select: () => {
      selectCalls.count += 1
      return chain
    },
    _setRows: (next: unknown[]) => {
      rows = next
    },
  }

  return { dbMock, selectCalls }
})

vi.mock("@/lib/db", () => ({ db: dbMock }))

import { __resetCacheForTest } from "@/lib/cache"
import { getCategoryTreeCached, invalidateCategoryCaches } from "@/lib/categories"
import { searchTagsCached } from "@/lib/search/tag-search"
import { getSystemSettingsCached, invalidateSettingsCache } from "@/lib/settings"

beforeEach(() => {
  __resetCacheForTest()
  selectCalls.count = 0
  dbMock._setRows([])
})

describe("business cache wiring", () => {
  it("serves the settings list from cache and re-reads after invalidation", async () => {
    dbMock._setRows([{ key: "app_name", value: { zh: "趣邻圈" } }])

    const first = await getSystemSettingsCached()
    const second = await getSystemSettingsCached()
    expect(second).toEqual(first)
    expect(selectCalls.count).toBe(1)

    await invalidateSettingsCache("contentModerationEnabled")
    const third = await getSystemSettingsCached()
    expect(third).toEqual(first)
    expect(selectCalls.count).toBe(2)
  })

  it("serves the category tree from cache and invalidates on category/tag writes", async () => {
    dbMock._setRows([{ id: "c-1", name: "传统文化", slug: "ct", level: 1, parentId: null, sortOrder: 0 }])

    const first = await getCategoryTreeCached()
    expect(first).toHaveLength(1)
    await getCategoryTreeCached()
    expect(selectCalls.count).toBe(1)

    await invalidateCategoryCaches()
    await getCategoryTreeCached()
    expect(selectCalls.count).toBe(2)
  })

  it("caches tag searches per query and expires by short ttl only in the cache layer", async () => {
    const now = new Date("2026-01-01T00:00:00Z")
    dbMock._setRows([
      {
        id: "t-1",
        name: "太极拳",
        categoryId: null,
        pinyin: "taijiquan",
        pinyinInitials: "tjq",
        status: "approved",
        createdBy: null,
        createdAt: now,
        updatedAt: now,
        categoryName: null,
        subCategoryName: null,
        categoryLevel: null,
      },
    ])

    const first = await searchTagsCached("太极", 10)
    const second = await searchTagsCached("太极", 10)
    expect(second).toEqual(first)
    expect(selectCalls.count).toBe(1)

    // 不同检索词 / limit 使用独立 key,需重新查库
    await searchTagsCached("太极", 5)
    await searchTagsCached("书法", 10)
    expect(selectCalls.count).toBe(3)
  })

  it("does not cache blank tag searches", async () => {
    expect(await searchTagsCached("   ", 10)).toEqual([])
    expect(selectCalls.count).toBe(0)
  })
})
