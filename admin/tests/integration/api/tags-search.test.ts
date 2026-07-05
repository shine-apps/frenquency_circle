import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * /api/tags/* 集成测试。
 *
 * 覆盖:
 * - GET /api/tags/search?q=陈氏太极拳 返回匹配标签
 * - GET /api/tags/search?q=cstj 拼音首字母匹配
 * - GET /api/tags/search 无 q 返回热门标签
 * - GET /api/tags/categories 返回分类树
 * - POST /api/tags/custom 未登录返回 401
 * - POST /api/tags/custom 登录后创建 pending 标签
 *
 * mock 层级:
 * - @/lib/db:支持 select().from().where().orderBy().limit() 与
 *   query.tags.findFirst / insert().values().returning() 链式调用
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值
 * - @/lib/logger:避免输出噪音
 *
 * 直接调用 route handler(参考 tests/integration/api/auth/me-patch.test.ts 模式)。
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

const {
  mockDb,
  chainSelect,
  chainInsert,
  findFirstMock,
  readUserFromTokenMock,
} = vi.hoisted(() => {
  let selectResult: TagRow[] = []
  let insertResult: TagRow[] = []

  // 链式 mock:支持 select().from().where().orderBy().limit() 与
  // select().from().where().orderBy() (无 limit,categories 路由用)
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
    // thenable:使 `await chain.orderBy(...)` 等无 limit 终止的链也能解析
    then: (
      resolve: (value: TagRow[]) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(selectResult).then(resolve, reject),
  }

  const chainInsert = {
    values: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    returning: vi.fn(async function () {
      return insertResult
    }),
  }

  const mockDb = {
    select: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    insert: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    query: {
      tags: {
        findFirst: vi.fn(),
      },
    },
    _setSelectResult(rows: TagRow[]) {
      selectResult = rows
    },
    _setInsertResult(rows: TagRow[]) {
      insertResult = rows
    },
  }

  return {
    mockDb,
    chainSelect,
    chainInsert,
    findFirstMock: mockDb.query.tags.findFirst,
    readUserFromTokenMock: vi.fn(),
  }
}) as {
  mockDb: {
    select: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    query: { tags: { findFirst: ReturnType<typeof vi.fn> } }
    _setSelectResult: (rows: TagRow[]) => void
    _setInsertResult: (rows: TagRow[]) => void
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
  chainInsert: {
    values: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
  }
  findFirstMock: ReturnType<typeof vi.fn>
  readUserFromTokenMock: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/db", () => ({ db: mockDb }))
vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
}))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: {
    AUTH: "AUTH",
    SMS: "SMS",
    ACCOUNT: "ACCOUNT",
    WECHAT: "WECHAT",
    UPLOAD: "UPLOAD",
  },
}))

import { GET as searchGet } from "@/app/api/tags/search/route"
import { GET as categoriesGet } from "@/app/api/tags/categories/route"
import { POST as customPost } from "@/app/api/tags/custom/route"
import type { IResponse, TagDTO } from "@/types/api"

const FAKE_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "user@example.com",
  name: "User",
  role: "USER" as const,
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

function makeUrl(path: string): URL {
  return new URL(`http://localhost${path}`)
}

beforeEach(() => {
  mockDb.select.mockClear()
  chainSelect.from.mockClear()
  chainSelect.where.mockClear()
  chainSelect.orderBy.mockClear()
  chainSelect.limit.mockClear()
  mockDb.insert.mockClear()
  chainInsert.values.mockClear()
  chainInsert.returning.mockClear()
  findFirstMock.mockReset()
  readUserFromTokenMock.mockReset()
  mockDb._setSelectResult([])
  mockDb._setInsertResult([])
})

describe("GET /api/tags/search", () => {
  it("returns matching tags for Chinese query '陈氏太极拳'", async () => {
    const rows = [
      makeTagRow({
        id: "tag-1",
        name: "陈氏太极拳养生八式",
        pinyin: "chenshitaijiquanyangshengbashi",
        pinyinInitials: "cstjysbs",
      }),
      makeTagRow({
        id: "tag-2",
        name: "陈氏太极拳老架一路",
        pinyin: "chenshitaijiquanlaojiayilu",
        pinyinInitials: "cstjljyl",
      }),
    ]
    mockDb._setSelectResult(rows)

    const req = new Request(makeUrl("/api/tags/search?q=陈氏太极拳"), {
      method: "GET",
    })
    const res = await searchGet(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ list: TagDTO[] }>
    expect(body.code).toBe(200)
    expect(body.data.list).toHaveLength(2)
    expect(body.data.list[0]!.name).toBe("陈氏太极拳养生八式")
    expect(body.data.list[1]!.name).toBe("陈氏太极拳老架一路")
    // 每条 DTO 应包含必需字段
    expect(body.data.list[0]).toHaveProperty("id")
    expect(body.data.list[0]).toHaveProperty("name")
    expect(body.data.list[0]).toHaveProperty("category")
    expect(body.data.list[0]).toHaveProperty("pinyin")
  })

  it("returns matching tags for pinyin initials 'cstj'", async () => {
    const rows = [
      makeTagRow({
        id: "tag-1",
        name: "陈氏太极拳",
        pinyinInitials: "cstjq",
      }),
    ]
    mockDb._setSelectResult(rows)

    const req = new Request(makeUrl("/api/tags/search?q=cstj"), {
      method: "GET",
    })
    const res = await searchGet(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ list: TagDTO[] }>
    expect(body.data.list).toHaveLength(1)
    expect(body.data.list[0]!.name).toBe("陈氏太极拳")
  })

  it("returns popular tags when q is missing", async () => {
    const rows = [
      makeTagRow({ id: "p1", name: "古筝" }),
      makeTagRow({ id: "p2", name: "琵琶" }),
    ]
    mockDb._setSelectResult(rows)

    const req = new Request(makeUrl("/api/tags/search"), { method: "GET" })
    const res = await searchGet(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ list: TagDTO[] }>
    expect(body.data.list).toHaveLength(2)
    // 应该调用了 orderBy(popular 走 createdAt desc 排序)
    expect(chainSelect.orderBy).toHaveBeenCalledTimes(1)
  })

  it("returns popular tags when q is empty string", async () => {
    mockDb._setSelectResult([])
    const req = new Request(makeUrl("/api/tags/search?q="), {
      method: "GET",
    })
    const res = await searchGet(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ list: TagDTO[] }>
    expect(body.data.list).toEqual([])
  })

  it("respects limit query parameter (default 10, max 50)", async () => {
    mockDb._setSelectResult([])
    const req = new Request(makeUrl("/api/tags/search?q=太极&limit=20"), {
      method: "GET",
    })
    await searchGet(req)
    expect(chainSelect.limit).toHaveBeenCalledWith(20)
  })

  it("returns 400 when limit is invalid", async () => {
    const req = new Request(makeUrl("/api/tags/search?q=太极&limit=0"), {
      method: "GET",
    })
    const res = await searchGet(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid query parameters")
  })

  it("caps limit at 50", async () => {
    mockDb._setSelectResult([])
    const req = new Request(makeUrl("/api/tags/search?q=太极&limit=100"), {
      method: "GET",
    })
    const res = await searchGet(req)
    expect(res.status).toBe(400)
  })
})

describe("GET /api/tags/categories", () => {
  it("returns category tree grouped by category with deduped subCategories", async () => {
    const rows = [
      { category: "武术养生", subCategory: "太极拳" },
      { category: "武术养生", subCategory: "太极拳" }, // 重复 subCategory,应被去重
      { category: "武术养生", subCategory: "气功功法" },
      { category: "民族器乐", subCategory: "弹拨乐器" },
      { category: "民族器乐", subCategory: null }, // null subCategory,不参与二级分类
    ]
    // categories 路由用 select({ category, subCategory }) 链式调用
    mockDb._setSelectResult(rows as unknown as TagRow[])

    const req = new Request(makeUrl("/api/tags/categories"), { method: "GET" })
    const res = await categoriesGet(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{
      categories: { category: string; subCategories: string[] }[]
    }>
    expect(body.code).toBe(200)
    expect(body.data.categories).toHaveLength(2)
    const wushu = body.data.categories.find((c) => c.category === "武术养生")
    expect(wushu).toBeDefined()
    expect(wushu!.subCategories).toEqual(["太极拳", "气功功法"])
    const yueqi = body.data.categories.find((c) => c.category === "民族器乐")
    expect(yueqi).toBeDefined()
    expect(yueqi!.subCategories).toEqual(["弹拨乐器"])
  })

  it("returns empty array when no approved tags exist", async () => {
    mockDb._setSelectResult([])
    const req = new Request(makeUrl("/api/tags/categories"), { method: "GET" })
    const res = await categoriesGet(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{
      categories: { category: string; subCategories: string[] }[]
    }>
    expect(body.data.categories).toEqual([])
  })
})

describe("POST /api/tags/custom", () => {
  function makeJsonRequest(body: unknown): Request {
    return new Request("http://localhost/api/tags/custom", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  }

  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await customPost(makeJsonRequest({ name: "王派快板" }))
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(401)
    expect(body.message).toBe("未登录或登录已过期")
  })

  it("creates a pending tag when logged in with valid name", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    // 名称不冲突
    findFirstMock.mockResolvedValue(null)

    const createdRow = makeTagRow({
      id: "new-tag-1",
      name: "王派快板",
      category: "自定义",
      subCategory: null,
      pinyin: "wangpaikuaiban",
      pinyinInitials: "wpkb",
      status: "pending",
      createdBy: FAKE_USER.id,
    })
    // insert().values().returning() 解析为 insertResult
    mockDb._setInsertResult([createdRow])

    const res = await customPost(makeJsonRequest({ name: "王派快板" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<TagDTO>
    expect(body.code).toBe(200)
    expect(body.data.id).toBe("new-tag-1")
    expect(body.data.name).toBe("王派快板")
    expect(body.data.category).toBe("自定义")
    expect(body.data.status).toBe("pending")
    expect(body.data.createdBy).toBe(FAKE_USER.id)
    // 自动计算拼音字段
    expect(body.data.pinyin).toBe("wangpaikuaiban")
    expect(body.data.pinyinInitials).toBe("wpkb")
    // 应调用 insert
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
  })

  it("returns 409 when tag name already exists", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    findFirstMock.mockResolvedValue(
      makeTagRow({ id: "existing-tag", name: "王派快板" })
    )

    const res = await customPost(makeJsonRequest({ name: "王派快板" }))
    expect(res.status).toBe(409)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(409)
    expect(body.message).toBe("标签名已存在")
    // 冲突时不应执行 insert
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when name is missing or empty", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await customPost(makeJsonRequest({ name: "" }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when name exceeds 30 characters", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const longName = "一二三四五六七八九十一二三四五六七八九十一二三四五六"
    expect(longName.length).toBeGreaterThan(30)
    const res = await customPost(makeJsonRequest({ name: longName }))
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 on malformed json body", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await customPost(makeJsonRequest("not-json"))
    expect(res.status).toBe(400)
  })
})
