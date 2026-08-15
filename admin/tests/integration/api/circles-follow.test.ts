import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 圈子关注集成测试(POST / DELETE /api/circles/:id/follow)。
 *
 * 覆盖:
 * - POST: 401 / 404(不存在) / 404(非 active) / 200 关注成功 / 200 幂等(已关注不重复插入)
 * - DELETE: 401 / 404(不存在) / 200 取消关注 / 200 幂等(未关注不报错)
 *
 * mock 层级:
 * - @/lib/db:select 队列 + insert/delete 链
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值
 * - @/lib/logger:避免输出噪音
 */

const {
  mockDb,
  chainInsert,
  deleteWhereMock,
  setSelectResultsQueue,
  readUserFromTokenMock,
} = vi.hoisted(() => {
  const selectResultsQueue: Record<string, unknown>[][] = []

  function makeSelectChain(result: Record<string, unknown>[]) {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      offset: vi.fn(() => chain),
      then: (
        resolve: (value: Record<string, unknown>[]) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject),
    }
    return chain
  }

  const chainInsert = {
    values: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    onConflictDoNothing: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(undefined).then(resolve, reject),
  }

  const deleteWhereMock = vi.fn(async () => undefined)
  const chainDelete = { where: deleteWhereMock }

  const mockDb = {
    select: vi.fn(() => makeSelectChain(selectResultsQueue.shift() ?? [])),
    insert: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    delete: vi.fn(function (this: unknown) {
      return chainDelete
    }),
  }

  return {
    mockDb,
    chainInsert,
    deleteWhereMock,
    setSelectResultsQueue: (results: Record<string, unknown>[][]) => {
      selectResultsQueue.length = 0
      selectResultsQueue.push(...results)
    },
    readUserFromTokenMock: vi.fn(),
  }
}) as {
  mockDb: {
    select: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  chainInsert: {
    values: ReturnType<typeof vi.fn>
    onConflictDoNothing: ReturnType<typeof vi.fn>
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise<unknown>
  }
  deleteWhereMock: ReturnType<typeof vi.fn>
  setSelectResultsQueue: (results: Record<string, unknown>[][]) => void
  readUserFromTokenMock: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/db", () => ({ db: mockDb }))

vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
}))

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { CIRCLE: "CIRCLE" },
}))

import { POST, DELETE } from "@/app/api/circles/[id]/follow/route"
import { GET as getFollowedCircles } from "@/app/api/circles/followed/route"
import type { IResponse, Paginated, FollowedCircleDTO } from "@/types/api"

const USER = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "user@example.com",
  name: "User",
  role: "USER" as const,
}

type RouteContext = { params: Promise<{ id: string }> }
function makeContext(id: string): RouteContext {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(path: string, method: "POST" | "DELETE"): Request {
  return new Request(`http://localhost${path}`, { method })
}

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb.insert.mockClear()
  mockDb.delete.mockClear()
  chainInsert.values.mockClear()
  chainInsert.onConflictDoNothing.mockClear()
  deleteWhereMock.mockClear()
  readUserFromTokenMock.mockReset()
  setSelectResultsQueue([])
})

describe("POST /api/circles/:id/follow", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await POST(makeRequest("/api/circles/c1/follow", "POST"), makeContext("c1"))
    expect(res.status).toBe(401)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 404 when circle does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    // select 1: circle 查询为空
    setSelectResultsQueue([[]])
    const res = await POST(makeRequest("/api/circles/c1/follow", "POST"), makeContext("c1"))
    expect(res.status).toBe(404)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toContain("圈子不存在")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 404 when circle is not active", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[{ id: "c1", status: "pending" }]])
    const res = await POST(makeRequest("/api/circles/c1/follow", "POST"), makeContext("c1"))
    expect(res.status).toBe(404)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("follows an active circle and inserts one record", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    // select 1: circle 存在且 active(无预查关注记录,幂等由唯一索引吸收)
    setSelectResultsQueue([[{ id: "c1", status: "active" }]])
    const res = await POST(makeRequest("/api/circles/c1/follow", "POST"), makeContext("c1"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ followed: boolean }>
    expect(body.data).toEqual({ followed: true })
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    const insertArg = chainInsert.values.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg).toEqual({ circleId: "c1", userId: USER.id })
    // 必须使用 onConflictDoNothing,避免并发重复关注的竞态
    expect(chainInsert.onConflictDoNothing).toHaveBeenCalledTimes(1)
  })

  it("is idempotent: does not pre-query follow records, conflict handled by unique index", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[{ id: "c1", status: "active" }]])
    const res = await POST(makeRequest("/api/circles/c1/follow", "POST"), makeContext("c1"))
    expect(res.status).toBe(200)
    // 只有 circle 校验这一次 select,证明幂等不依赖先查后插
    expect(mockDb.select).toHaveBeenCalledTimes(1)
    expect(chainInsert.onConflictDoNothing).toHaveBeenCalledTimes(1)
  })
})

describe("DELETE /api/circles/:id/follow", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await DELETE(makeRequest("/api/circles/c1/follow", "DELETE"), makeContext("c1"))
    expect(res.status).toBe(401)
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it("returns 404 when circle does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[]])
    const res = await DELETE(makeRequest("/api/circles/c1/follow", "DELETE"), makeContext("c1"))
    expect(res.status).toBe(404)
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it("unfollows a circle and deletes the record", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[{ id: "c1" }]])
    const res = await DELETE(makeRequest("/api/circles/c1/follow", "DELETE"), makeContext("c1"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ followed: boolean }>
    expect(body.data).toEqual({ followed: false })
    expect(deleteWhereMock).toHaveBeenCalledTimes(1)
  })

  it("is idempotent: deleting a non-existing follow does not error", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[{ id: "c1" }]])
    const res = await DELETE(makeRequest("/api/circles/c1/follow", "DELETE"), makeContext("c1"))
    expect(res.status).toBe(200)
    expect(deleteWhereMock).toHaveBeenCalledTimes(1)
  })
})

/** 构造 circles 表行(字段与 schema 对齐) */
function makeCircleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    title: "陈氏太极拳晨练班",
    description: "每周二、四早晨在朝阳公园练习陈氏太极拳。",
    creatorId: "11111111-1111-1111-1111-111111111111",
    latitude: 39.9042,
    longitude: 116.4074,
    address: "北京市朝阳区朝阳公园",
    contactPhone: "13800138000",
    wechat: "taichi2026",
    activityTime: "每周二、四 06:30",
    maxMembers: 20,
    memberCount: 8,
    status: "active",
    coverImages: [],
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  }
}

describe("GET /api/circles/followed", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await getFollowedCircles(
      new Request("http://localhost/api/circles/followed?page=1&pageSize=20")
    )
    expect(res.status).toBe(401)
  })

  it("returns paginated followed circles, excluding deleted circles", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    // select 1: 分页关注记录(2 条,按关注时间倒序)
    // select 2: 对应圈子行(c1 active + c2 deleted)
    // select 3: 全部关注记录用于 total(2 条)
    setSelectResultsQueue([
      [
        { id: "f1", circleId: "c1", userId: USER.id, createdAt: new Date("2026-08-01T00:00:00Z") },
        { id: "f2", circleId: "c2", userId: USER.id, createdAt: new Date("2026-08-02T00:00:00Z") },
      ],
      [
        makeCircleRow({ id: "c1" }),
        makeCircleRow({ id: "c2", status: "deleted" }),
      ],
      [{ id: "f1" }, { id: "f2" }],
    ])
    const res = await getFollowedCircles(
      new Request("http://localhost/api/circles/followed?page=1&pageSize=20")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<FollowedCircleDTO>>
    expect(body.data.total).toBe(2)
    // 已删除的 c2 被排除
    expect(body.data.list).toHaveLength(1)
    expect(body.data.list[0].id).toBe("c1")
    expect(body.data.list[0].followedAt).toBe("2026-08-01T00:00:00.000Z")
  })

  it("returns empty list when no follows", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    // select 1: 分页关注记录 → 空
    // select 2: total 查询 → 空
    setSelectResultsQueue([[], []])
    const res = await getFollowedCircles(
      new Request("http://localhost/api/circles/followed?page=1&pageSize=20")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<FollowedCircleDTO>>
    expect(body.data.list).toEqual([])
    expect(body.data.total).toBe(0)
  })
})
