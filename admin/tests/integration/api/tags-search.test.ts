import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * /api/hobby-tags/* 集成测试。
 *
 * 覆盖:
 * - GET /api/hobby-tags/search?q=太极拳 返回匹配标签(含分类名称)
 * - GET /api/hobby-tags/search?q=tjq 拼音首字母匹配
 * - GET /api/hobby-tags/search 无 q 返回热门标签
 * - GET /api/hobby-tags/categories 返回两级分类树(一级大类 → 二级中类 → 叶子标签)
 * - POST /api/hobby-tags/custom 未登录返回 401
 * - POST /api/hobby-tags/custom 登录后创建 pending 标签(归到指定二级中类)
 *
 * mock 层级:
 * - @/lib/db:支持 select().from(table).leftJoin().where().orderBy().limit(),
 *   并按 from 的表对象切分返回结果(categories / hobby_tags);
 *   query.hobbyTags.findFirst / query.categories.findFirst 链式调用
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值
 * - @/lib/logger:避免输出噪音
 *
 * 直接调用 route handler(参考 tests/integration/api/auth/me-patch.test.ts 模式)。
 */

// 真实 schema 表对象,用于 from() 引用比较(需在 mock db 之前导入)
import { categories, hobbyTags } from "@/db/schema"

const {
  mockDb,
  chainSelect,
  chainInsert,
  findFirstHobbyTagsMock,
  findFirstCategoriesMock,
  readUserFromTokenMock,
} = vi.hoisted(() => {
  let tagRows: TagRow[] = []
  let catRows: unknown[] = []
  let insertResult: TagRow[] = []
  let currentFromTable: unknown = null
  let categoriesRef: unknown = null

  const chainSelect = {
    from: vi.fn(function (this: unknown, table: unknown) {
      currentFromTable = table
      return chainSelect
    }),
    leftJoin: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    where: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    orderBy: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    limit: vi.fn(async function () {
      // limit 仅用于 hobby_tags 查询
      return tagRows
    }),
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) =>
      Promise.resolve(
        currentFromTable === categoriesRef ? catRows : tagRows
      ).then(resolve, reject),
    _setCategoriesRef: (t: unknown) => {
      categoriesRef = t
    },
  } as {
    from: ReturnType<typeof vi.fn>
    leftJoin: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    orderBy: ReturnType<typeof vi.fn>
    limit: ReturnType<typeof vi.fn>
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise<unknown>
    _setCategoriesRef: (t: unknown) => void
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
      hobbyTags: { findFirst: vi.fn() },
      categories: { findFirst: vi.fn() },
    },
    _setTagRows(rows: TagRow[]) {
      tagRows = rows
    },
    _setCatRows(rows: unknown[]) {
      catRows = rows
    },
    _setInsertResult(rows: TagRow[]) {
      insertResult = rows
    },
  }

  return {
    mockDb,
    chainSelect,
    chainInsert,
    findFirstHobbyTagsMock: mockDb.query.hobbyTags.findFirst,
    findFirstCategoriesMock: mockDb.query.categories.findFirst,
    readUserFromTokenMock: vi.fn(),
  }
}) as {
  mockDb: {
    select: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    query: {
      hobbyTags: { findFirst: ReturnType<typeof vi.fn> }
      categories: { findFirst: ReturnType<typeof vi.fn> }
    }
    _setTagRows: (rows: TagRow[]) => void
    _setCatRows: (rows: unknown[]) => void
    _setInsertResult: (rows: TagRow[]) => void
  }
  chainSelect: {
    from: ReturnType<typeof vi.fn>
    leftJoin: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    orderBy: ReturnType<typeof vi.fn>
    limit: ReturnType<typeof vi.fn>
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise<unknown>
    _setCategoriesRef: (t: unknown) => void
  }
  chainInsert: {
    values: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
  }
  findFirstHobbyTagsMock: ReturnType<typeof vi.fn>
  findFirstCategoriesMock: ReturnType<typeof vi.fn>
  readUserFromTokenMock: ReturnType<typeof vi.fn>
}

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
  subCategoryName?: string | null
  categoryName?: string | null
  categoryLevel?: number | null
}

// 注入 categories 表对象引用,用于 from() 结果切分
chainSelect._setCategoriesRef(categories)

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

import { GET as searchGet } from "@/app/api/hobby-tags/search/route"
import { GET as categoriesGet } from "@/app/api/hobby-tags/categories/route"
import { POST as customPost } from "@/app/api/hobby-tags/custom/route"
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
    name: overrides.name ?? "太极拳",
    categoryId: overrides.categoryId ?? "sub-martial",
    pinyin: overrides.pinyin ?? "taijiquan",
    pinyinInitials: overrides.pinyinInitials ?? "tjq",
    status: overrides.status ?? "approved",
    createdBy: overrides.createdBy ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-01-01T00:00:00Z"),
    subCategoryName: overrides.subCategoryName ?? "武术养生",
    categoryName: overrides.categoryName ?? "传统与民族文化",
    categoryLevel: overrides.categoryLevel ?? 2,
  }
}

function makeUrl(path: string): URL {
  return new URL(`http://localhost${path}`)
}

beforeEach(() => {
  mockDb.select.mockClear()
  chainSelect.from.mockClear()
  chainSelect.leftJoin.mockClear()
  chainSelect.where.mockClear()
  chainSelect.orderBy.mockClear()
  chainSelect.limit.mockClear()
  mockDb.insert.mockClear()
  chainInsert.values.mockClear()
  chainInsert.returning.mockClear()
  findFirstHobbyTagsMock.mockReset()
  findFirstCategoriesMock.mockReset()
  readUserFromTokenMock.mockReset()
  mockDb._setTagRows([])
  mockDb._setCatRows([])
  mockDb._setInsertResult([])
})

describe("GET /api/hobby-tags/search", () => {
  it("returns matching tags for Chinese query '太极拳'", async () => {
    const rows = [
      makeTagRow({ id: "tag-1", name: "太极拳" }),
      makeTagRow({
        id: "tag-2",
        name: "书法",
        pinyin: "shufa",
        pinyinInitials: "sf",
        subCategoryName: "书画篆刻",
        categoryName: "视觉与造型艺术",
      }),
    ]
    mockDb._setTagRows(rows)

    const req = new Request(makeUrl("/api/hobby-tags/search?q=太极"), {
      method: "GET",
    })
    const res = await searchGet(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ list: TagDTO[] }>
    expect(body.code).toBe(200)
    expect(body.data.list).toHaveLength(2)
    expect(body.data.list[0]!.name).toBe("太极拳")
    expect(body.data.list[1]!.name).toBe("书法")
    expect(body.data.list[0]).toHaveProperty("id")
    expect(body.data.list[0]).toHaveProperty("name")
    expect(body.data.list[0]).toHaveProperty("category")
    expect(body.data.list[0]).toHaveProperty("subCategory")
    expect(body.data.list[0]).toHaveProperty("categoryId")
  })

  it("returns matching tags for pinyin initials 'tjq'", async () => {
    const rows = [
      makeTagRow({
        id: "tag-1",
        name: "太极拳",
        pinyinInitials: "tjq",
      }),
    ]
    mockDb._setTagRows(rows)

    const req = new Request(makeUrl("/api/hobby-tags/search?q=tjq"), {
      method: "GET",
    })
    const res = await searchGet(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ list: TagDTO[] }>
    expect(body.data.list).toHaveLength(1)
    expect(body.data.list[0]!.name).toBe("太极拳")
  })

  it("returns popular tags when q is missing", async () => {
    const rows = [
      makeTagRow({ id: "p1", name: "古筝" }),
      makeTagRow({ id: "p2", name: "琵琶" }),
    ]
    mockDb._setTagRows(rows)

    const req = new Request(makeUrl("/api/hobby-tags/search"), { method: "GET" })
    const res = await searchGet(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ list: TagDTO[] }>
    expect(body.data.list).toHaveLength(2)
    expect(chainSelect.orderBy).toHaveBeenCalledTimes(1)
  })

  it("returns popular tags when q is empty string", async () => {
    mockDb._setTagRows([])
    const req = new Request(makeUrl("/api/hobby-tags/search?q="), {
      method: "GET",
    })
    const res = await searchGet(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ list: TagDTO[] }>
    expect(body.data.list).toEqual([])
  })

  it("respects limit query parameter (default 10, max 50)", async () => {
    mockDb._setTagRows([])
    const req = new Request(makeUrl("/api/hobby-tags/search?q=太极&limit=20"), {
      method: "GET",
    })
    await searchGet(req)
    expect(chainSelect.limit).toHaveBeenCalledWith(20)
  })

  it("returns 400 when limit is invalid", async () => {
    const req = new Request(makeUrl("/api/hobby-tags/search?q=太极&limit=0"), {
      method: "GET",
    })
    const res = await searchGet(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid query parameters")
  })

  it("caps limit at 50", async () => {
    mockDb._setTagRows([])
    const req = new Request(makeUrl("/api/hobby-tags/search?q=太极&limit=100"), {
      method: "GET",
    })
    const res = await searchGet(req)
    expect(res.status).toBe(400)
  })
})

describe("GET /api/hobby-tags/categories", () => {
  it("returns 2-level category tree (category → subCategory → tags) from categories table", async () => {
    // 分类骨架:一级大类 2 个 + 二级中类
    const catData = [
      { id: "c-trad", name: "传统与民族文化", level: 1, parentId: null, sortOrder: 1 },
      { id: "c-vis", name: "视觉与造型艺术", level: 1, parentId: null, sortOrder: 2 },
      { id: "sub-martial", name: "武术养生", level: 2, parentId: "c-trad", sortOrder: 1 },
      { id: "sub-calligraphy", name: "书画篆刻", level: 2, parentId: "c-vis", sortOrder: 1 },
    ]
    mockDb._setCatRows(catData)
    // 标签:from(hobbyTags) 的 select 返回 tagRows
    mockDb._setTagRows([
      makeTagRow({
        id: "t1",
        name: "太极拳",
        categoryId: "sub-martial",
        subCategoryName: "武术养生",
        categoryName: "传统与民族文化",
      }),
      makeTagRow({
        id: "t2",
        name: "书法",
        categoryId: "sub-calligraphy",
        subCategoryName: "书画篆刻",
        categoryName: "视觉与造型艺术",
      }),
    ])

    const req = new Request(makeUrl("/api/hobby-tags/categories"), { method: "GET" })
    const res = await categoriesGet(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{
      categories: {
        category: string
        subCategories: { name: string; categoryId: string; tags: { name: string }[] }[]
      }[]
    }>
    expect(body.code).toBe(200)
    expect(body.data.categories).toHaveLength(2)

    const trad = body.data.categories.find((c) => c.category === "传统与民族文化")
    expect(trad).toBeDefined()
    expect(trad!.subCategories).toHaveLength(1)
    expect(trad!.subCategories[0]!.name).toBe("武术养生")
    expect(trad!.subCategories[0]!.tags.map((t) => t.name)).toEqual(["太极拳"])

    const vis = body.data.categories.find((c) => c.category === "视觉与造型艺术")
    expect(vis).toBeDefined()
    expect(vis!.subCategories[0]!.tags.map((t) => t.name)).toEqual(["书法"])
  })

  it("returns empty array when no categories exist", async () => {
    mockDb._setCatRows([])
    mockDb._setTagRows([])
    const req = new Request(makeUrl("/api/hobby-tags/categories"), { method: "GET" })
    const res = await categoriesGet(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{
      categories: {
        category: string
        subCategories: { name: string; tags: { name: string }[] }[]
      }[]
    }>
    expect(body.data.categories).toEqual([])
  })

  it("puts a tag directly under a level-1 leaf category as its own sub-category node", async () => {
    const catData = [
      { id: "c-trad", name: "传统与民族文化", level: 1, parentId: null, sortOrder: 1, slug: "trad" },
      { id: "c-leaf", name: "中医养生", level: 1, parentId: null, sortOrder: 2, slug: "tcm" },
      { id: "sub-martial", name: "武术养生", level: 2, parentId: "c-trad", sortOrder: 1, slug: "martial" },
    ]
    mockDb._setCatRows(catData)
    mockDb._setTagRows([
      makeTagRow({ id: "t1", name: "太极拳", categoryId: "sub-martial", subCategoryName: "武术养生", categoryName: "传统与民族文化", categoryLevel: 2 }),
      makeTagRow({ id: "t2", name: "艾灸", categoryId: "c-leaf", subCategoryName: null, categoryName: "中医养生", categoryLevel: 1 }),
    ])

    const req = new Request(makeUrl("/api/hobby-tags/categories"), { method: "GET" })
    const res = await categoriesGet(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{
      categories: {
        category: string
        categoryId: string
        subCategories: { name: string; categoryId: string; tags: { name: string }[] }[]
      }[]
    }>
    const leaf = body.data.categories.find((c) => c.category === "中医养生")
    expect(leaf).toBeDefined()
    expect(leaf!.subCategories).toHaveLength(1)
    expect(leaf!.subCategories[0]!.name).toBe("中医养生")
    expect(leaf!.subCategories[0]!.categoryId).toBe("c-leaf")
    expect(leaf!.subCategories[0]!.tags.map((t) => t.name)).toEqual(["艾灸"])
  })
})

describe("POST /api/hobby-tags/custom", () => {
  function makeJsonRequest(body: unknown): Request {
    return new Request("http://localhost/api/hobby-tags/custom", {
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

  it("creates a pending tag under a sub-category when logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    // 名称不冲突
    findFirstHobbyTagsMock.mockResolvedValue(null)
    // 所属二级中类存在
    findFirstCategoriesMock.mockResolvedValue({ id: "sub-martial", slug: "martial" })

    const createdRow = makeTagRow({
      id: "new-tag-1",
      name: "王派快板",
      categoryId: "sub-martial",
      pinyin: "wangpaikuaiban",
      pinyinInitials: "wpkb",
      status: "pending",
      createdBy: FAKE_USER.id,
      subCategoryName: "武术养生",
      categoryName: "传统与民族文化",
      categoryLevel: 2,
    })
    mockDb._setInsertResult([createdRow])

    const res = await customPost(
      makeJsonRequest({ name: "王派快板", categorySlug: "martial" })
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<TagDTO>
    expect(body.code).toBe(200)
    expect(body.data.id).toBe("new-tag-1")
    expect(body.data.name).toBe("王派快板")
    expect(body.data.category).toBe("传统与民族文化")
    expect(body.data.subCategory).toBe("武术养生")
    expect(body.data.categoryId).toBe("sub-martial")
    expect(body.data.status).toBe("pending")
    expect(body.data.createdBy).toBe(FAKE_USER.id)
    expect(body.data.pinyin).toBe("wangpaikuaiban")
    expect(body.data.pinyinInitials).toBe("wpkb")
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
  })

  it("returns 400 when categorySlug does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    findFirstHobbyTagsMock.mockResolvedValue(null)
    findFirstCategoriesMock.mockResolvedValue(null)

    const res = await customPost(
      makeJsonRequest({ name: "王派快板", categorySlug: "no-such" })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("所属分类不存在")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 409 when tag name already exists", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    findFirstHobbyTagsMock.mockResolvedValue(
      makeTagRow({ id: "existing-tag", name: "王派快板" })
    )
    findFirstCategoriesMock.mockResolvedValue({ id: "sub-martial", slug: "martial" })

    const res = await customPost(
      makeJsonRequest({ name: "王派快板", categorySlug: "martial" })
    )
    expect(res.status).toBe(409)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(409)
    expect(body.message).toBe("标签名已存在")
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
    const longName = "一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十."
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
