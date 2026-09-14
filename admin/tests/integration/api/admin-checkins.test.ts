import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 后台打卡管理接口集成测试。
 *
 * 覆盖:
 * - GET /api/admin/checkins:401(无 session) / 403(非管理员) / 400(分页非法) /
 *   200 分页(含软删记录,status 与 updatedAt 已投影) / 状态过滤 / 关键词过滤
 * - PATCH /api/admin/checkins/:id:401 / 403 / 400(非法 uuid) / 400(body 非法) /
 *   404(不存在) / 200 下架 / 200 恢复 / 200 幂等(状态未变化不写库)
 *
 * mock 层级:
 * - @/auth:auth() 返回管理员 session(requireAdmin 依赖)
 * - @/lib/db:select 队列(每次 db.select() 取队首)+ update 链
 * - @/lib/logger:避免输出噪音
 */

const {
  mockDb,
  updateSetMock,
  updateWhereMock,
  selectChains,
  setSelectResultsQueue,
  authMock,
} = vi.hoisted(() => {
  const selectResultsQueue: Record<string, unknown>[][] = []
  /** 每次 db.select() 创建的查询链(供断言 where 条件) */
  const selectChains: { where: ReturnType<typeof vi.fn> }[] = []

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
    selectChains.push(chain)
    return chain
  }

  const updateWhereMock = vi.fn(async () => undefined)
  const updateSetMock = vi.fn(function (this: unknown) {
    return chainUpdate
  })
  const chainUpdate = {
    set: updateSetMock,
    where: updateWhereMock,
  }

  const mockDb = {
    select: vi.fn(() => makeSelectChain(selectResultsQueue.shift() ?? [])),
    update: vi.fn(function (this: unknown) {
      return chainUpdate
    }),
  }

  return {
    mockDb,
    updateSetMock,
    updateWhereMock,
    selectChains,
    setSelectResultsQueue: (results: Record<string, unknown>[][]) => {
      selectResultsQueue.length = 0
      selectResultsQueue.push(...results)
    },
    authMock: vi.fn(),
  }
}) as {
  mockDb: { select: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  updateSetMock: ReturnType<typeof vi.fn>
  updateWhereMock: ReturnType<typeof vi.fn>
  selectChains: { where: ReturnType<typeof vi.fn> }[]
  setSelectResultsQueue: (results: Record<string, unknown>[][]) => void
  authMock: ReturnType<typeof vi.fn>
}

vi.mock("@/auth", () => ({ auth: authMock }))

vi.mock("@/lib/db", () => ({ db: mockDb }))

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { CHECKIN: "CHECKIN", ADMIN: "ADMIN" },
}))

import { GET as listCheckins } from "@/app/api/admin/checkins/route"
import { PATCH as patchCheckin } from "@/app/api/admin/checkins/[id]/route"
import { extractSqlParamValues } from "@/tests/helpers/sql-params"
import type { AdminCheckinItem, IResponse, Paginated } from "@/types/api"

const ADMIN_ID = "99999999-9999-9999-9999-999999999999"
const CHECKIN_ID = "11111111-1111-4111-8111-111111111111"
const CIRCLE_ID = "33333333-3333-4333-8333-333333333333"

const ADMIN_USER = {
  id: ADMIN_ID,
  email: "admin@example.com",
  name: "管理员",
  role: "ADMIN" as const,
}

const NON_ADMIN_USER = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "user@example.com",
  name: "李师傅",
  role: "USER" as const,
}

const AUTHOR_ROW = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "李师傅",
  avatarUrl: null,
}

type RouteContext = { params: Promise<{ id: string }> }

function makeContext(id: string): RouteContext {
  return { params: Promise.resolve({ id }) }
}

function makeGetRequest(path: string): Request {
  return new Request(`http://localhost${path}`)
}

function makePatchRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

/**
 * 收集条件对象中的字符串值（SQL 模板 / StringChunk / Param）。
 *
 * `extractSqlParamValues` 只识别 Param 节点（走列编码器的值，如 eq 的右值），
 * 而关键词以 SQL 模板的字符串 chunk 形式绑定，需单独遍历。
 * 仅测试用：验证 %关键词% 是否正确拼装（含通配符转义）。
 */
function collectSqlStringValues(node: unknown, out: string[] = []): string[] {
  if (typeof node === "string") {
    out.push(node)
    return out
  }
  if (node === null || typeof node !== "object") return out

  const obj = node as { queryChunks?: unknown[]; value?: unknown }
  if (Array.isArray(obj.queryChunks)) {
    for (const chunk of obj.queryChunks) collectSqlStringValues(chunk, out)
    return out
  }
  if (typeof obj.value === "string") out.push(obj.value)
  else if (Array.isArray(obj.value)) {
    for (const value of obj.value) {
      if (typeof value === "string") out.push(value)
    }
  }
  return out
}

/** 构造 checkins 表行(字段与 schema 对齐) */
function makeCheckinRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CHECKIN_ID,
    userId: AUTHOR_ROW.id,
    content: "今天练了半小时太极",
    circleId: null,
    tags: ["太极拳"],
    images: [],
    videoUrl: null,
    status: "active",
    createdAt: new Date("2026-09-14T02:00:00Z"),
    updatedAt: new Date("2026-09-14T02:00:00Z"),
    ...overrides,
  }
}

beforeEach(() => {
  authMock.mockReset()
  mockDb.select.mockClear()
  mockDb.update.mockClear()
  updateSetMock.mockClear()
  updateWhereMock.mockClear()
  selectChains.length = 0
  setSelectResultsQueue([])
})

describe("GET /api/admin/checkins", () => {
  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null)
    const res = await listCheckins(makeGetRequest("/api/admin/checkins"))
    expect(res.status).toBe(401)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("returns 403 for a non-admin session", async () => {
    authMock.mockResolvedValue({ user: NON_ADMIN_USER })
    const res = await listCheckins(makeGetRequest("/api/admin/checkins"))
    expect(res.status).toBe(403)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("returns 400 on invalid pagination", async () => {
    authMock.mockResolvedValue({ user: ADMIN_USER })
    const res = await listCheckins(makeGetRequest("/api/admin/checkins?page=0"))
    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("returns paged checkins including soft-deleted rows with status and updatedAt", async () => {
    authMock.mockResolvedValue({ user: ADMIN_USER })
    setSelectResultsQueue([
      // 列表(含一条已删除记录 + 圈子)
      [
        makeCheckinRow({
          images: ["https://cdn.example.com/1.png"],
          circleId: CIRCLE_ID,
        }),
        makeCheckinRow({ id: "44444444-4444-4444-8444-444444444444", status: "deleted" }),
      ],
      [{ count: 2 }],
      // hydrate 作者
      [AUTHOR_ROW],
      // hydrate 圈子标题
      [{ id: CIRCLE_ID, title: "陈氏太极拳晨练班" }],
    ])

    const res = await listCheckins(
      makeGetRequest("/api/admin/checkins?page=1&pageSize=20")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<AdminCheckinItem>>
    expect(body.code).toBe(200)
    expect(body.data.total).toBe(2)
    expect(body.data.page).toBe(1)
    expect(body.data.list).toHaveLength(2)
    expect(body.data.list[0].status).toBe("active")
    expect(body.data.list[0].updatedAt).toBe("2026-09-14T02:00:00.000Z")
    expect(body.data.list[0].circleTitle).toBe("陈氏太极拳晨练班")
    expect(body.data.list[0].author.name).toBe(AUTHOR_ROW.name)
    expect(body.data.list[1].status).toBe("deleted")
  })

  it("returns an empty list when there are no checkins", async () => {
    authMock.mockResolvedValue({ user: ADMIN_USER })
    setSelectResultsQueue([[], [{ count: 0 }]])

    const res = await listCheckins(makeGetRequest("/api/admin/checkins"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<AdminCheckinItem>>
    expect(body.data.total).toBe(0)
    expect(body.data.list).toEqual([])
  })

  it("applies the status filter to the SQL condition", async () => {
    authMock.mockResolvedValue({ user: ADMIN_USER })
    setSelectResultsQueue([[], [{ count: 0 }]])

    const res = await listCheckins(
      makeGetRequest("/api/admin/checkins?status=deleted")
    )
    expect(res.status).toBe(200)
    // 过滤条件必须落在 status 列上
    const whereParams = extractSqlParamValues(
      selectChains[0].where.mock.calls[0]?.[0]
    )
    expect(whereParams).toContain("deleted")
  })

  it("applies the keyword filter with the keyword wrapped as a LIKE pattern", async () => {
    authMock.mockResolvedValue({ user: ADMIN_USER })
    setSelectResultsQueue([[], [{ count: 0 }]])

    const res = await listCheckins(makeGetRequest("/api/admin/checkins?q=太极"))
    expect(res.status).toBe(200)
    // 关键词以 %关键词% 形式拼装,同时用于正文与作者昵称两个条件
    const condition = selectChains[0].where.mock.calls[0]?.[0]
    expect(collectSqlStringValues(condition)).toContain("%太极%")
  })

  it("escapes LIKE wildcards in the keyword", async () => {
    authMock.mockResolvedValue({ user: ADMIN_USER })
    setSelectResultsQueue([[], [{ count: 0 }]])

    // %25 为 % 的 URL 编码;用户输入的 % 必须转义为 \%,避免退化成「匹配任意内容」
    const res = await listCheckins(makeGetRequest("/api/admin/checkins?q=%25"))
    expect(res.status).toBe(200)
    const condition = selectChains[0].where.mock.calls[0]?.[0]
    expect(collectSqlStringValues(condition)).toContain("%\\%%")
  })
})

describe("PATCH /api/admin/checkins/:id", () => {
  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null)
    const res = await patchCheckin(
      makePatchRequest(`/api/admin/checkins/${CHECKIN_ID}`, {
        status: "deleted",
      }),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(401)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 403 for a non-admin session", async () => {
    authMock.mockResolvedValue({ user: NON_ADMIN_USER })
    const res = await patchCheckin(
      makePatchRequest(`/api/admin/checkins/${CHECKIN_ID}`, {
        status: "deleted",
      }),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 when the id is not a uuid", async () => {
    authMock.mockResolvedValue({ user: ADMIN_USER })
    const res = await patchCheckin(
      makePatchRequest("/api/admin/checkins/not-a-uuid", {
        status: "deleted",
      }),
      makeContext("not-a-uuid")
    )
    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 when the body status is invalid", async () => {
    authMock.mockResolvedValue({ user: ADMIN_USER })
    const res = await patchCheckin(
      makePatchRequest(`/api/admin/checkins/${CHECKIN_ID}`, {
        status: "violated",
      }),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 404 when the checkin does not exist", async () => {
    authMock.mockResolvedValue({ user: ADMIN_USER })
    setSelectResultsQueue([[]])
    const res = await patchCheckin(
      makePatchRequest(`/api/admin/checkins/${CHECKIN_ID}`, {
        status: "deleted",
      }),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(404)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("soft deletes the checkin when an admin takes it down", async () => {
    authMock.mockResolvedValue({ user: ADMIN_USER })
    setSelectResultsQueue([
      // 现状:active
      [makeCheckinRow()],
      // 写库后重查:deleted
      [makeCheckinRow({ status: "deleted" })],
      // hydrate 作者
      [AUTHOR_ROW],
    ])

    const res = await patchCheckin(
      makePatchRequest(`/api/admin/checkins/${CHECKIN_ID}`, {
        status: "deleted",
      }),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<AdminCheckinItem>
    expect(body.data.status).toBe("deleted")

    expect(updateSetMock).toHaveBeenCalledTimes(1)
    const setArg = updateSetMock.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.status).toBe("deleted")
    expect(setArg.updatedAt).toBeInstanceOf(Date)
    expect(updateWhereMock).toHaveBeenCalledTimes(1)
  })

  it("restores a soft-deleted checkin", async () => {
    authMock.mockResolvedValue({ user: ADMIN_USER })
    setSelectResultsQueue([
      [makeCheckinRow({ status: "deleted" })],
      [makeCheckinRow({ status: "active" })],
      [AUTHOR_ROW],
    ])

    const res = await patchCheckin(
      makePatchRequest(`/api/admin/checkins/${CHECKIN_ID}`, {
        status: "active",
      }),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<AdminCheckinItem>
    expect(body.data.status).toBe("active")

    const setArg = updateSetMock.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.status).toBe("active")
  })

  it("is idempotent when the status is unchanged", async () => {
    authMock.mockResolvedValue({ user: ADMIN_USER })
    setSelectResultsQueue([
      [makeCheckinRow({ status: "deleted" })],
      [makeCheckinRow({ status: "deleted" })],
      [AUTHOR_ROW],
    ])

    const res = await patchCheckin(
      makePatchRequest(`/api/admin/checkins/${CHECKIN_ID}`, {
        status: "deleted",
      }),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<AdminCheckinItem>
    expect(body.data.status).toBe("deleted")
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})
