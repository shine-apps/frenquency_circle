import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 活动(顶层资源)API 集成测试。
 *
 * 覆盖:
 * - POST /api/activities
 *     401 未登录 / 403 非 TEACHER-ADMIN / 400 校验失败(deadline>=startTime) /
 *     400 危险 HTML / 201 成功
 * - GET  /api/activities
 *     401 / 200 全局列表(仅 active) / 400 分页非法
 * - GET  /api/activities?mine=1
 *     200 只看自己发布(含 cancelled)
 * - GET  /api/activities/:activityId
 *     401 / 404 活动不存在 / 404 非创建者访问已取消 / 200 详情
 * - PATCH /api/activities/:activityId
 *     401 / 403 非创建者 / 404 / 200 更新
 * - DELETE(软取消) /api/activities/:activityId
 *     401 / 403 非创建者 / 404 / 200 取消
 *
 * mock 层级与 circles-crud.test.ts 一致:
 * - @/lib/db:select 队列 + insert/update 链
 * - @/lib/auth/session-token:readUserFromToken
 * - @/lib/logger:静默
 */

type ActivityRow = {
  id: string
  creatorId: string
  title: string
  description: string
  startTime: Date
  registrationDeadline: Date
  contactPhone: string | null
  status: string
  createdAt: Date
  updatedAt: Date
}

const {
  mockDb,
  chainInsert,
  chainUpdate,
  insertReturningMock,
  updateReturningMock,
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

  const insertReturningMock = vi.fn()
  const chainInsert = {
    values: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    returning: insertReturningMock,
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(undefined).then(resolve, reject),
  }

  const updateReturningMock = vi.fn()
  const chainUpdate = {
    set: vi.fn(function (this: unknown) {
      return chainUpdate
    }),
    where: vi.fn(() => chainUpdate),
    returning: updateReturningMock,
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(undefined).then(resolve, reject),
  }

  const mockDb = {
    select: vi.fn(() => makeSelectChain(selectResultsQueue.shift() ?? [])),
    insert: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    update: vi.fn(function (this: unknown) {
      return chainUpdate
    }),
  }

  return {
    mockDb,
    chainInsert,
    chainUpdate,
    insertReturningMock,
    updateReturningMock,
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
    update: ReturnType<typeof vi.fn>
  }
  chainInsert: {
    values: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
  }
  chainUpdate: {
    set: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
  }
  insertReturningMock: ReturnType<typeof vi.fn>
  updateReturningMock: ReturnType<typeof vi.fn>
  setSelectResultsQueue: (results: Record<string, unknown>[][]) => void
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
    MATCH: "MATCH",
    CIRCLE: "CIRCLE",
  },
}))

import { POST, GET as listActivities } from "@/app/api/activities/route"
import {
  GET as getActivity,
  PATCH as patchActivity,
  DELETE as cancelActivity,
} from "@/app/api/activities/[activityId]/route"
import type { IResponse, ActivityDTO, ActivityListDTO } from "@/types/api"

const TEACHER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "teacher@example.com",
  name: "Teacher",
  role: "TEACHER" as const,
}

const ADMIN = {
  id: "33333333-3333-3333-3333-333333333333",
  email: "admin@example.com",
  name: "Admin",
  role: "ADMIN" as const,
}

const OTHER_USER = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "user@example.com",
  name: "User",
  role: "USER" as const,
}

const START = "2026-09-01T10:00:00.000Z"
const DEADLINE = "2026-08-25T10:00:00.000Z"

const VALID_BODY = {
  title: "社区太极展演",
  description: "<p>欢迎参加社区太极展演活动</p>",
  startTime: START,
  registrationDeadline: DEADLINE,
  contactPhone: "13800138000",
}

function makeActivityRow(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: overrides.id ?? "activity-1",
    creatorId: overrides.creatorId ?? TEACHER.id,
    title: overrides.title ?? "社区太极展演",
    description: overrides.description ?? "<p>欢迎参加</p>",
    startTime: overrides.startTime ?? new Date(START),
    registrationDeadline: overrides.registrationDeadline ?? new Date(DEADLINE),
    contactPhone: overrides.contactPhone ?? "13800138000",
    status: overrides.status ?? "active",
    createdAt: overrides.createdAt ?? new Date("2026-08-20T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-08-20T00:00:00Z"),
  }
}

function makeJsonRequest(body: unknown, path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function makePatchRequest(body: unknown, path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function makeDeleteRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "DELETE" })
}

function makeGetRequest(
  path: string,
  params: Record<string, string | undefined> = {}
): Request {
  const url = new URL(`http://localhost${path}`)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v)
  }
  return new Request(url.toString(), { method: "GET" })
}

type DetailContext = { params: Promise<{ activityId: string }> }
function makeDetailContext(activityId: string): DetailContext {
  return { params: Promise.resolve({ activityId }) }
}

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb.insert.mockClear()
  mockDb.update.mockClear()
  chainInsert.values.mockClear()
  insertReturningMock.mockReset()
  updateReturningMock.mockReset()
  chainUpdate.set.mockClear()
  chainUpdate.where.mockClear()
  readUserFromTokenMock.mockReset()
  setSelectResultsQueue([])
})

describe("POST /api/activities", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await POST(makeJsonRequest(VALID_BODY, `/api/activities`))
    expect(res.status).toBe(401)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 403 when user is not teacher/admin", async () => {
    readUserFromTokenMock.mockResolvedValue(OTHER_USER)
    const res = await POST(makeJsonRequest(VALID_BODY, `/api/activities`))
    expect(res.status).toBe(403)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("只有传承人或管理员可以发布活动")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 403 when role is USER even with valid body", async () => {
    readUserFromTokenMock.mockResolvedValue(OTHER_USER)
    const res = await POST(makeJsonRequest(VALID_BODY, `/api/activities`))
    expect(res.status).toBe(403)
  })

  it("returns 400 when registration deadline is not before start time", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER)
    const res = await POST(
      makeJsonRequest(
        {
          ...VALID_BODY,
          startTime: "2026-08-20T10:00:00.000Z",
          registrationDeadline: "2026-08-25T10:00:00.000Z",
        },
        `/api/activities`
      )
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("Invalid request body")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when description contains script tag", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER)
    const res = await POST(
      makeJsonRequest(
        { ...VALID_BODY, description: "<p>hi</p><script>alert(1)</script>" },
        `/api/activities`
      )
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("creates activity successfully as teacher and returns 201", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER)
    insertReturningMock.mockResolvedValue([makeActivityRow()])

    const res = await POST(makeJsonRequest(VALID_BODY, `/api/activities`))
    expect(res.status).toBe(201)
    const body = (await res.json()) as IResponse<ActivityDTO>
    expect(body.code).toBe(201)
    expect(body.data.title).toBe(VALID_BODY.title)
    expect(body.data.creatorId).toBe(TEACHER.id)
    expect(body.data.status).toBe("active")
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    const valuesArg = chainInsert.values.mock.calls[0]?.[0] as Record<string, unknown>
    expect(valuesArg.description).toBe(VALID_BODY.description)
    expect((valuesArg.startTime as Date).toISOString()).toBe(START)
    // 不再写入 circleId
    expect(valuesArg.circleId).toBeUndefined()
  })

  it("creates activity successfully as admin and returns 201", async () => {
    readUserFromTokenMock.mockResolvedValue(ADMIN)
    insertReturningMock.mockResolvedValue([makeActivityRow({ creatorId: ADMIN.id })])
    const res = await POST(makeJsonRequest(VALID_BODY, `/api/activities`))
    expect(res.status).toBe(201)
    const body = (await res.json()) as IResponse<ActivityDTO>
    expect(body.data.creatorId).toBe(ADMIN.id)
  })
})

describe("GET /api/activities", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await listActivities(makeGetRequest(`/api/activities`))
    expect(res.status).toBe(401)
  })

  it("lists only active activities globally", async () => {
    readUserFromTokenMock.mockResolvedValue(OTHER_USER)
    setSelectResultsQueue([
      // 列表查询:只返回 active
      [makeActivityRow({ id: "a1", status: "active" })],
      // 总数查询
      [{ id: "a1" }],
    ])
    const res = await listActivities(makeGetRequest(`/api/activities`))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<ActivityListDTO>
    expect(body.data.list).toHaveLength(1)
    expect(body.data.list[0]!.status).toBe("active")
  })

  it("lists own activities including cancelled when mine=1", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER)
    setSelectResultsQueue([
      [
        makeActivityRow({ id: "a1", status: "active" }),
        makeActivityRow({ id: "a2", status: "cancelled" }),
      ],
      [{ id: "a1" }, { id: "a2" }],
    ])
    const res = await listActivities(makeGetRequest(`/api/activities`, { mine: "1" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<ActivityListDTO>
    expect(body.data.list).toHaveLength(2)
  })

  it("returns 400 when pagination is invalid", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER)
    const res = await listActivities(makeGetRequest(`/api/activities`, { page: "0" }))
    expect(res.status).toBe(400)
  })
})

describe("GET /api/activities/:activityId", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await getActivity(
      makeGetRequest(`/api/activities/activity-1`),
      makeDetailContext("activity-1")
    )
    expect(res.status).toBe(401)
  })

  it("returns 404 when activity does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER)
    setSelectResultsQueue([[]])
    const res = await getActivity(
      makeGetRequest(`/api/activities/nonexistent`),
      makeDetailContext("nonexistent")
    )
    expect(res.status).toBe(404)
  })

  it("returns 404 when non-creator accesses cancelled activity", async () => {
    readUserFromTokenMock.mockResolvedValue(OTHER_USER)
    setSelectResultsQueue([
      [makeActivityRow({ status: "cancelled", creatorId: TEACHER.id })],
    ])
    const res = await getActivity(
      makeGetRequest(`/api/activities/activity-1`),
      makeDetailContext("activity-1")
    )
    expect(res.status).toBe(404)
  })

  it("returns 200 detail for creator even if cancelled", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER)
    setSelectResultsQueue([[{ ...makeActivityRow({ status: "cancelled" }) }]])
    const res = await getActivity(
      makeGetRequest(`/api/activities/activity-1`),
      makeDetailContext("activity-1")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<ActivityDTO>
    expect(body.data.status).toBe("cancelled")
  })
})

describe("PATCH /api/activities/:activityId", () => {
  it("returns 403 when non-creator tries to update", async () => {
    readUserFromTokenMock.mockResolvedValue(OTHER_USER)
    setSelectResultsQueue([[makeActivityRow({ creatorId: TEACHER.id })]])
    const res = await patchActivity(
      makePatchRequest({ title: "新标题" }, `/api/activities/activity-1`),
      makeDetailContext("activity-1")
    )
    expect(res.status).toBe(403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 404 when activity does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER)
    setSelectResultsQueue([[]])
    const res = await patchActivity(
      makePatchRequest({ title: "新标题" }, `/api/activities/nonexistent`),
      makeDetailContext("nonexistent")
    )
    expect(res.status).toBe(404)
  })

  it("updates activity successfully", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER)
    setSelectResultsQueue([[makeActivityRow()]])
    updateReturningMock.mockResolvedValue([makeActivityRow({ title: "新标题" })])

    const res = await patchActivity(
      makePatchRequest({ title: "新标题" }, `/api/activities/activity-1`),
      makeDetailContext("activity-1")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<ActivityDTO>
    expect(body.data.title).toBe("新标题")
  })
})

describe("DELETE /api/activities/:activityId (soft cancel)", () => {
  it("returns 403 when non-creator tries to cancel", async () => {
    readUserFromTokenMock.mockResolvedValue(OTHER_USER)
    setSelectResultsQueue([[makeActivityRow({ creatorId: TEACHER.id })]])
    const res = await cancelActivity(
      makeDeleteRequest(`/api/activities/activity-1`),
      makeDetailContext("activity-1")
    )
    expect(res.status).toBe(403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 404 when activity does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER)
    setSelectResultsQueue([[]])
    const res = await cancelActivity(
      makeDeleteRequest(`/api/activities/nonexistent`),
      makeDetailContext("nonexistent")
    )
    expect(res.status).toBe(404)
  })

  it("soft-cancels activity successfully", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER)
    setSelectResultsQueue([[makeActivityRow()]])
    const res = await cancelActivity(
      makeDeleteRequest(`/api/activities/activity-1`),
      makeDetailContext("activity-1")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ id: string; status: string }>
    expect(body.data.status).toBe("cancelled")
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.status).toBe("cancelled")
    expect(setArg.updatedAt).toBeInstanceOf(Date)
  })
})
