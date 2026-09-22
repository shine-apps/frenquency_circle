import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 教师后台活动 API 集成测试。
 *
 * 覆盖:
 * - POST   /api/teacher/activities
 *     401 / 403 USER / 400 校验失败 / 400 危险 HTML / 201 成功 / 201 ADMIN
 * - PATCH  /api/teacher/activities/:activityId
 *     401 / 404 / 403 非创建者且非 ADMIN / 400 空 body / 200 更新 / 200 ADMIN 代管
 * - DELETE /api/teacher/activities/:activityId
 *     403 非创建者且非 ADMIN / 404 / 200 软取消 / 200 ADMIN 代管
 *
 * mock 层级与 activities.test.ts 一致,仅把 @/lib/auth/session-token 换成 @/auth
 * (教师后台走 cookie session,由 requireTeacher 守卫)。
 */

type ActivityRow = {
  id: string
  creatorId: string
  title: string
  description: string
  startTime: Date
  registrationDeadline: Date
  contactPhone: string | null
  coverImages: string[]
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
  authMock,
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
    insert: vi.fn(() => chainInsert),
    update: vi.fn(() => chainUpdate),
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
    authMock: vi.fn(),
  }
}) as {
  mockDb: {
    select: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  chainInsert: { values: ReturnType<typeof vi.fn>; returning: ReturnType<typeof vi.fn> }
  chainUpdate: {
    set: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
  }
  insertReturningMock: ReturnType<typeof vi.fn>
  updateReturningMock: ReturnType<typeof vi.fn>
  setSelectResultsQueue: (results: Record<string, unknown>[][]) => void
  authMock: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/db", () => ({ db: mockDb }))
vi.mock("@/auth", () => ({ auth: authMock }))
vi.mock("@/lib/auth/session-token", () => ({ readUserFromToken: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { CIRCLE: "CIRCLE" },
}))

import { POST as postActivity } from "@/app/api/teacher/activities/route"
import {
  PATCH as patchActivity,
  DELETE as cancelActivity,
} from "@/app/api/teacher/activities/[activityId]/route"
import type { ActivityDTO, IResponse } from "@/types/api"

const TEACHER_ID = "11111111-1111-1111-1111-111111111111"
const OTHER_TEACHER_ID = "44444444-4444-4444-4444-444444444444"
/** 路径参数必须是合法 uuid(路由有 isUuid 前置校验,假 id 会直接 400) */
const ACTIVITY_ID = "88888888-8888-4888-8888-888888888888"
const MISSING_ACTIVITY_ID = "00000000-0000-4000-8000-000000000000"

const TEACHER = { id: TEACHER_ID, role: "TEACHER", email: "t@e.com", name: "T" }
const OTHER_TEACHER = {
  id: OTHER_TEACHER_ID,
  role: "TEACHER",
  email: "t2@e.com",
  name: "T2",
}
const ADMIN = { id: "33333333-3333-3333-3333-333333333333", role: "ADMIN", email: "a@e.com", name: "A" }
const USER = { id: "22222222-2222-2222-2222-222222222222", role: "USER", email: "u@e.com", name: "U" }

function sessionOf(user: unknown) {
  return user ? { user, expires: "2099-01-01" } : null
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
    id: overrides.id ?? ACTIVITY_ID,
    creatorId: overrides.creatorId ?? TEACHER_ID,
    title: overrides.title ?? "社区太极展演",
    description: overrides.description ?? "<p>欢迎参加</p>",
    startTime: overrides.startTime ?? new Date(START),
    registrationDeadline: overrides.registrationDeadline ?? new Date(DEADLINE),
    contactPhone: overrides.contactPhone ?? "13800138000",
    coverImages: overrides.coverImages ?? [],
    status: overrides.status ?? "active",
    createdAt: overrides.createdAt ?? new Date("2026-08-20T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-08-20T00:00:00Z"),
  }
}

function makeJsonRequest(
  body: unknown,
  path: string,
  method: "POST" | "PATCH" = "POST"
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function makeDeleteRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "DELETE" })
}

type ActivityContext = { params: Promise<{ activityId: string }> }
function makeContext(activityId: string): ActivityContext {
  return { params: Promise.resolve({ activityId }) }
}

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb.insert.mockClear()
  mockDb.update.mockClear()
  chainInsert.values.mockClear()
  insertReturningMock.mockReset()
  chainUpdate.set.mockClear()
  chainUpdate.where.mockClear()
  updateReturningMock.mockReset()
  authMock.mockReset()
  setSelectResultsQueue([])
})

describe("POST /api/teacher/activities", () => {
  it("returns 401 when not logged in", async () => {
    authMock.mockResolvedValue(null)
    const res = await postActivity(
      makeJsonRequest(VALID_BODY, "/api/teacher/activities")
    )
    expect(res.status).toBe(401)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 403 when the session role is USER", async () => {
    authMock.mockResolvedValue(sessionOf(USER))
    const res = await postActivity(
      makeJsonRequest(VALID_BODY, "/api/teacher/activities")
    )
    expect(res.status).toBe(403)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when the deadline is not earlier than the start time", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    const res = await postActivity(
      makeJsonRequest(
        {
          ...VALID_BODY,
          startTime: "2026-08-20T10:00:00.000Z",
          registrationDeadline: "2026-08-25T10:00:00.000Z",
        },
        "/api/teacher/activities"
      )
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when the description contains a script tag", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    const res = await postActivity(
      makeJsonRequest(
        { ...VALID_BODY, description: "<p>hi</p><script>alert(1)</script>" },
        "/api/teacher/activities"
      )
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("creates the activity and returns 201", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    insertReturningMock.mockResolvedValue([makeActivityRow()])

    const res = await postActivity(
      makeJsonRequest(VALID_BODY, "/api/teacher/activities")
    )

    expect(res.status).toBe(201)
    const body = (await res.json()) as IResponse<ActivityDTO>
    expect(body.data.creatorId).toBe(TEACHER_ID)
    expect(body.data.status).toBe("active")
    const valuesArg = chainInsert.values.mock.calls[0]?.[0] as Record<string, unknown>
    expect((valuesArg.startTime as Date).toISOString()).toBe(START)
  })

  it("allows ADMIN to publish", async () => {
    authMock.mockResolvedValue(sessionOf(ADMIN))
    insertReturningMock.mockResolvedValue([makeActivityRow({ creatorId: ADMIN.id })])
    const res = await postActivity(
      makeJsonRequest(VALID_BODY, "/api/teacher/activities")
    )
    expect(res.status).toBe(201)
  })
})

describe("PATCH /api/teacher/activities/:activityId", () => {
  it("returns 401 when not logged in", async () => {
    authMock.mockResolvedValue(null)
    const res = await patchActivity(
      makeJsonRequest({ title: "新标题" }, `/api/teacher/activities/${ACTIVITY_ID}`, "PATCH"),
      makeContext(ACTIVITY_ID)
    )
    expect(res.status).toBe(401)
  })

  it("returns 404 when the activity does not exist", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[]])
    const res = await patchActivity(
      makeJsonRequest(
        { title: "新标题" },
        `/api/teacher/activities/${MISSING_ACTIVITY_ID}`,
        "PATCH"
      ),
      makeContext(MISSING_ACTIVITY_ID)
    )
    expect(res.status).toBe(404)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 403 when another teacher tries to edit", async () => {
    authMock.mockResolvedValue(sessionOf(OTHER_TEACHER))
    setSelectResultsQueue([[makeActivityRow({ creatorId: TEACHER_ID })]])
    const res = await patchActivity(
      makeJsonRequest({ title: "新标题" }, `/api/teacher/activities/${ACTIVITY_ID}`, "PATCH"),
      makeContext(ACTIVITY_ID)
    )
    expect(res.status).toBe(403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 when no field is provided", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeActivityRow()]])
    const res = await patchActivity(
      makeJsonRequest({}, `/api/teacher/activities/${ACTIVITY_ID}`, "PATCH"),
      makeContext(ACTIVITY_ID)
    )
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("updates the activity for its creator", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeActivityRow()]])
    updateReturningMock.mockResolvedValue([makeActivityRow({ title: "新标题" })])

    const res = await patchActivity(
      makeJsonRequest({ title: "新标题" }, `/api/teacher/activities/${ACTIVITY_ID}`, "PATCH"),
      makeContext(ACTIVITY_ID)
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<ActivityDTO>
    expect(body.data.title).toBe("新标题")
  })

  it("clears contactPhone when the teacher empties the input", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeActivityRow()]])
    updateReturningMock.mockResolvedValue([makeActivityRow({ contactPhone: null })])

    const res = await patchActivity(
      makeJsonRequest(
        { contactPhone: "" },
        `/api/teacher/activities/${ACTIVITY_ID}`,
        "PATCH"
      ),
      makeContext(ACTIVITY_ID)
    )

    expect(res.status).toBe(200)
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>
    // 空串必须落成 NULL,而不是被 transform 成 undefined 后静默跳过
    expect(setArg.contactPhone).toBeNull()
  })

  it("allows ADMIN to edit someone else's activity (代管)", async () => {
    authMock.mockResolvedValue(sessionOf(ADMIN))
    setSelectResultsQueue([[makeActivityRow({ creatorId: TEACHER_ID })]])
    updateReturningMock.mockResolvedValue([makeActivityRow({ title: "管理员改的" })])

    const res = await patchActivity(
      makeJsonRequest({ title: "管理员改的" }, `/api/teacher/activities/${ACTIVITY_ID}`, "PATCH"),
      makeContext(ACTIVITY_ID)
    )
    expect(res.status).toBe(200)
  })
})

describe("DELETE /api/teacher/activities/:activityId", () => {
  it("returns 403 when another teacher tries to cancel", async () => {
    authMock.mockResolvedValue(sessionOf(OTHER_TEACHER))
    setSelectResultsQueue([[makeActivityRow({ creatorId: TEACHER_ID })]])
    const res = await cancelActivity(
      makeDeleteRequest(`/api/teacher/activities/${ACTIVITY_ID}`),
      makeContext(ACTIVITY_ID)
    )
    expect(res.status).toBe(403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 for a non-uuid activityId (避免 Postgres 22P02 → 500)", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    const res = await cancelActivity(
      makeDeleteRequest("/api/teacher/activities/not-a-uuid"),
      makeContext("not-a-uuid")
    )
    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 404 when the activity does not exist", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[]])
    const res = await cancelActivity(
      makeDeleteRequest(`/api/teacher/activities/${MISSING_ACTIVITY_ID}`),
      makeContext(MISSING_ACTIVITY_ID)
    )
    expect(res.status).toBe(404)
  })

  it("soft-cancels the activity for its creator", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeActivityRow()]])

    const res = await cancelActivity(
      makeDeleteRequest(`/api/teacher/activities/${ACTIVITY_ID}`),
      makeContext(ACTIVITY_ID)
    )

    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ id: string; status: string }>
    expect(body.data.status).toBe("cancelled")
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.status).toBe("cancelled")
  })

  it("allows ADMIN to cancel (代管)", async () => {
    authMock.mockResolvedValue(sessionOf(ADMIN))
    setSelectResultsQueue([[makeActivityRow({ creatorId: TEACHER_ID })]])
    const res = await cancelActivity(
      makeDeleteRequest(`/api/teacher/activities/${ACTIVITY_ID}`),
      makeContext(ACTIVITY_ID)
    )
    expect(res.status).toBe(200)
  })
})
