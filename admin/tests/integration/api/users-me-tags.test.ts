import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * PUT /api/users/me/hobby-tags 集成测试。
 *
 * 覆盖:
 * - 未登录返回 401
 * - 全量替换成功(直接 UPDATE users.tags,返回 string[] 名称数组)
 * - 重复名称去重后仍成功
 * - tags 超过 10 个返回 400
 * - tags 为空数组返回 400
 * - tags 中包含不存在的名称返回 400
 *
 * mock 层级:
 * - @/lib/db:支持 select().from().where().limit() / update().set().where() 链式调用
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值
 * - @/lib/logger:避免输出噪音
 *
 * 直接调用 route handler(参考 tests/integration/api/auth/me-patch.test.ts 模式)。
 */

type TagRow = {
  id: string
  name: string
  category: string
  pinyin: string | null
  pinyinInitials: string | null
  status: string
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

const {
  mockDb,
  selectResults,
  chainUpdate,
  readUserFromTokenMock,
} = vi.hoisted(() => {
  const selectResults: { value: Record<string, unknown>[] } = { value: [] }

  function makeSelectChain(result: Record<string, unknown>[]) {
    return {
      from: vi.fn(function (this: unknown) { return this }),
      where: vi.fn(function (this: unknown) { return this }),
      orderBy: vi.fn(function (this: unknown) { return this }),
      limit: vi.fn(async () => result),
      then: (
        resolve: (value: Record<string, unknown>[]) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject),
    }
  }

  const chainUpdate = {
    set: vi.fn(function () { return chainUpdate }),
    where: vi.fn(async () => undefined),
  }

  const mockDb = {
    select: vi.fn(() => makeSelectChain(selectResults.value)),
    update: vi.fn(() => chainUpdate),
  }

  return {
    mockDb,
    selectResults,
    chainUpdate,
    readUserFromTokenMock: vi.fn(),
  }
}) as {
  mockDb: {
    select: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  selectResults: { value: Record<string, unknown>[] }
  chainUpdate: {
    set: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
  }
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

import { PUT } from "@/app/api/users/me/hobby-tags/route"
import type { IResponse } from "@/types/api"

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
    category: overrides.category ?? "武术养生",
    pinyin: overrides.pinyin ?? "taijiquan",
    pinyinInitials: overrides.pinyinInitials ?? "tjq",
    status: overrides.status ?? "approved",
    createdBy: overrides.createdBy ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-01-01T00:00:00Z"),
  }
}

function makeJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/users/me/hobby-tags", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb.update.mockClear()
  chainUpdate.set.mockClear()
  chainUpdate.where.mockClear()
  readUserFromTokenMock.mockReset()
  selectResults.value = []
})

describe("PUT /api/users/me/hobby-tags", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await PUT(makeJsonRequest({ tags: ["太极拳"] }))
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(401)
    expect(body.message).toBe("未登录或登录已过期")
  })

  it("replaces user tags successfully and returns updated name array", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)

    // 存在性校验:返回 2 个 approved 标签
    selectResults.value = [
      makeTagRow({ name: "太极拳" }),
      makeTagRow({ id: "tag-2", name: "书法", pinyin: "shufa", pinyinInitials: "sf" }),
    ] as unknown as Record<string, unknown>[]

    const res = await PUT(makeJsonRequest({ tags: ["太极拳", "书法"] }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ tags: string[] }>
    expect(body.code).toBe(200)
    expect(body.data.tags).toEqual(["太极拳", "书法"])
    // 直接 UPDATE users.tags(无事务、无桥接表)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.tags).toEqual(["太极拳", "书法"])
    expect(chainUpdate.where).toHaveBeenCalledTimes(1)
  })

  it("dedupes duplicate names before persisting", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    selectResults.value = [makeTagRow({ name: "太极拳" })] as unknown as Record<string, unknown>[]

    const res = await PUT(makeJsonRequest({ tags: ["太极拳", "太极拳"] }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ tags: string[] }>
    expect(body.data.tags).toEqual(["太极拳"])
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.tags).toEqual(["太极拳"])
  })

  it("returns 400 when tags array is empty", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PUT(makeJsonRequest({ tags: [] }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 when tags has more than 10 items", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const tags = Array.from({ length: 11 }, (_, i) => `标签${i + 1}`)
    const res = await PUT(makeJsonRequest({ tags }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 when any tag name does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    // 只返回"太极拳",另一个名称校验失败
    selectResults.value = [makeTagRow({ name: "太极拳" })] as unknown as Record<string, unknown>[]

    const res = await PUT(makeJsonRequest({ tags: ["太极拳", "不存在的标签"] }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.details).toEqual({ missingTags: ["不存在的标签"] })
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 when a tag name is not approved", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    // approved 过滤后只返回"太极拳",pending 标签不返回
    selectResults.value = [makeTagRow({ name: "太极拳" })] as unknown as Record<string, unknown>[]

    const res = await PUT(makeJsonRequest({ tags: ["太极拳", "待审核标签"] }))
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 on malformed json body", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PUT(makeJsonRequest("not-json"))
    expect(res.status).toBe(400)
  })

  it("returns 400 when tags is missing", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PUT(makeJsonRequest({}))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
  })
})
