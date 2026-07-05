import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * PUT /api/users/me/tags 集成测试。
 *
 * 覆盖:
 * - 未登录返回 401
 * - 全量替换成功(删旧+插新+返回 TagDTO[])
 * - tagIds 超过 10 个返回 400
 * - tagIds 中包含不存在的 tag 返回 400
 * - tagIds 为空数组返回 400
 * - tagIds 中包含非 uuid 字符串返回 400
 *
 * mock 层级:
 * - @/lib/db:支持 select().from().where().limit() / transaction() / delete().where() / insert().values()
 *   每次 select 返回新的 chain(用队列控制不同 select 的结果)
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
  readUserFromTokenMock,
  setSelectResultsQueue,
  txDeleteWhereSpy,
  txInsertValuesSpy,
  transactionSpy,
} = vi.hoisted(() => {
  // select 队列:每次 db.select() 调用取出队首结果
  // 队列元素类型为 Record<string, unknown>[],因为不同 select 返回不同形状:
  // - existence check: {id: string}[]
  // - user_tags lookup: {tagId: string}[]
  // - tag details: TagRow[]
  const selectResultsQueue: Record<string, unknown>[][] = []

  // 构造一个 thenable chain,可被 await 解析为 result
  function makeChain(result: Record<string, unknown>[]) {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(async () => result),
      then: (
        resolve: (value: Record<string, unknown>[]) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject),
    }
    return chain
  }

  // 事务 tx mock:tx.delete(...).where() 与 tx.insert(...).values()
  const txDeleteWhereSpy = vi.fn(async () => undefined)
  const txDeleteChain = {
    where: txDeleteWhereSpy,
  }
  const txInsertValuesSpy = vi.fn(async () => undefined)
  const txInsertChain = {
    values: txInsertValuesSpy,
  }
  const transactionTx = {
    delete: vi.fn(() => txDeleteChain),
    insert: vi.fn(() => txInsertChain),
  }

  const mockDb = {
    select: vi.fn(() => makeChain(selectResultsQueue.shift() ?? [])),
    insert: vi.fn(() => txInsertChain),
    delete: vi.fn(() => txDeleteChain),
    transaction: vi.fn(async (cb: (tx: typeof transactionTx) => Promise<unknown>) => {
      return cb(transactionTx)
    }),
  }

  return {
    mockDb,
    readUserFromTokenMock: vi.fn(),
    setSelectResultsQueue: (results: Record<string, unknown>[][]) => {
      selectResultsQueue.length = 0
      selectResultsQueue.push(...results)
    },
    txDeleteWhereSpy,
    txInsertValuesSpy,
    transactionSpy: mockDb.transaction,
  }
}) as {
  mockDb: {
    select: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    transaction: ReturnType<typeof vi.fn>
  }
  readUserFromTokenMock: ReturnType<typeof vi.fn>
  setSelectResultsQueue: (results: Record<string, unknown>[][]) => void
  txDeleteWhereSpy: ReturnType<typeof vi.fn>
  txInsertValuesSpy: ReturnType<typeof vi.fn>
  transactionSpy: ReturnType<typeof vi.fn>
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

import { PUT } from "@/app/api/users/me/tags/route"
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

function makeJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/users/me/tags", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb.insert.mockClear()
  mockDb.delete.mockClear()
  mockDb.transaction.mockClear()
  txDeleteWhereSpy.mockClear()
  txInsertValuesSpy.mockClear()
  readUserFromTokenMock.mockReset()
  setSelectResultsQueue([])
})

describe("PUT /api/users/me/tags", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await PUT(
      makeJsonRequest({ tagIds: ["00000000-0000-4000-8000-000000000001"] })
    )
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(401)
    expect(body.message).toBe("未登录或登录已过期")
  })

  it("replaces user tags successfully and returns updated TagDTO list", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)

    const tagId1 = "00000000-0000-4000-8000-000000000001"
    const tagId2 = "00000000-0000-4000-8000-000000000002"

    // select 队列:
    // 1) 校验 tagIds 存在性:返回 2 行(都存在)
    // 2) 查询更新后的 user_tags(拿 tagId 列表):返回 2 行
    // 3) 查询 tags 表(拿 tag 详情):返回 2 行 tag 数据
    setSelectResultsQueue([
      [{ id: tagId1 }, { id: tagId2 }], // existence check
      [{ tagId: tagId1 }, { tagId: tagId2 }], // user_tags lookup
      [
        makeTagRow({ id: tagId1, name: "陈氏太极拳" }),
        makeTagRow({ id: tagId2, name: "八段锦", pinyin: "baduanjin", pinyinInitials: "bdj" }),
      ], // tag details
    ])

    const res = await PUT(makeJsonRequest({ tagIds: [tagId1, tagId2] }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ tags: TagDTO[] }>
    expect(body.code).toBe(200)
    expect(body.data.tags).toHaveLength(2)
    // 按 tagIds 入参顺序返回
    expect(body.data.tags[0]!.id).toBe(tagId1)
    expect(body.data.tags[0]!.name).toBe("陈氏太极拳")
    expect(body.data.tags[1]!.id).toBe(tagId2)
    expect(body.data.tags[1]!.name).toBe("八段锦")
    // 事务应被调用一次(包含 delete + insert)
    expect(transactionSpy).toHaveBeenCalledTimes(1)
    expect(txDeleteWhereSpy).toHaveBeenCalledTimes(1)
    expect(txInsertValuesSpy).toHaveBeenCalledTimes(1)
  })

  it("returns 400 when tagIds array is empty", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PUT(makeJsonRequest({ tagIds: [] }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    expect(transactionSpy).not.toHaveBeenCalled()
  })

  it("returns 400 when tagIds has more than 10 items", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const tagIds = Array.from({ length: 11 }, (_, i) =>
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
    )
    const res = await PUT(makeJsonRequest({ tagIds }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(transactionSpy).not.toHaveBeenCalled()
  })

  it("returns 400 when any tagId does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)

    const existingId = "00000000-0000-4000-8000-000000000001"
    const missingId = "00000000-0000-4000-8000-000000000099"

    // existence check 只返回 existingId,missingId 不存在
    setSelectResultsQueue([[{ id: existingId }]])

    const res = await PUT(
      makeJsonRequest({ tagIds: [existingId, missingId] })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("部分标签不存在")
    expect(body.details).toEqual({ missingTagIds: [missingId] })
    expect(transactionSpy).not.toHaveBeenCalled()
  })

  it("returns 400 when tagId is not a valid uuid", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PUT(
      makeJsonRequest({ tagIds: ["not-a-uuid"] })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    expect(transactionSpy).not.toHaveBeenCalled()
  })

  it("returns 400 on malformed json body", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PUT(makeJsonRequest("not-json"))
    expect(res.status).toBe(400)
  })

  it("returns 400 when tagIds is missing", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PUT(makeJsonRequest({}))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
  })
})
