import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 课时播放进度 API 集成测试(uni-app 续播定位 / 最近学习)。
 *
 * 覆盖:
 * - PUT /api/users/me/course-progress/:lessonId
 *     401 未登录 / 400 lessonId 非 uuid / 400 body 非法 / 404 lesson 不存在
 *     / 404 课程非 active / 200 成功(返回 DTO 字段)
 * - GET /api/users/me/course-progress?courseId=
 *     401 / 400 缺 courseId / 400 非 uuid / 200 空 / 200 列表
 * - GET /api/users/me/courses/recent
 *     401 / 400 limit 非法 / 200 空 / 200 正常(窗口外过滤 + active 过滤 + DTO 字段)
 *
 * mock 层级:
 * - @/lib/db:select/insert 链(thenable),结果通过队列预置;
 * - @/lib/auth-utils:requireSession 直接由 mock 控制。
 */

type SelectChain = {
  from: ReturnType<typeof vi.fn>
  innerJoin: ReturnType<typeof vi.fn>
  where: ReturnType<typeof vi.fn>
  orderBy: ReturnType<typeof vi.fn>
  limit: ReturnType<typeof vi.fn>
  then: <T>(
    resolve: (value: unknown[]) => T,
    reject?: (reason: unknown) => T
  ) => Promise<T>
}

type InsertChain = {
  values: ReturnType<typeof vi.fn>
  onConflictDoUpdate: ReturnType<typeof vi.fn>
  returning: ReturnType<typeof vi.fn>
  then: <T>(
    resolve: (value: unknown[]) => T,
    reject?: (reason: unknown) => T
  ) => Promise<T>
}

const {
  mockDb,
  selectResults,
  insertResults,
  requireSessionMock,
} = vi.hoisted(() => {
  const selectQueue: unknown[][] = []
  const insertQueue: unknown[][] = []

  function makeSelectChain(result: unknown[]): SelectChain {
    const chain: SelectChain = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      then: (resolve, reject) =>
        Promise.resolve(result).then(resolve, reject) as Promise<never>,
    }
    return chain
  }

  function makeInsertChain(result: unknown[]): InsertChain {
    const chain: InsertChain = {
      values: vi.fn(() => chain),
      onConflictDoUpdate: vi.fn(() => chain),
      returning: vi.fn(() => chain),
      then: (resolve, reject) =>
        Promise.resolve(result).then(resolve, reject) as Promise<never>,
    }
    return chain
  }

  const mockDb = {
    select: vi.fn(() => makeSelectChain(selectQueue.shift() ?? [])),
    insert: vi.fn(() => makeInsertChain(insertQueue.shift() ?? [])),
  }

  const requireSessionMock = vi.fn()

  return {
    mockDb,
    selectResults: {
      push: (rows: unknown[]) => selectQueue.push(rows),
      clear: () => (selectQueue.length = 0),
    },
    insertResults: {
      push: (rows: unknown[]) => insertQueue.push(rows),
      clear: () => (insertQueue.length = 0),
    },
    requireSessionMock,
  }
})

vi.mock("@/lib/db", () => ({ db: mockDb }))
vi.mock("@/lib/auth-utils", () => ({ requireSession: requireSessionMock }))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { AUTH: "AUTH", COURSE: "COURSE" },
}))

import { PUT as putProgress } from "@/app/api/users/me/course-progress/[lessonId]/route"
import { GET as getCourseProgress } from "@/app/api/users/me/course-progress/route"
import { GET as getRecentCourses } from "@/app/api/users/me/courses/recent/route"
import type {
  CourseLessonProgressDTO,
  IResponse,
  RecentCourseDTO,
} from "@/types/api"

const USER = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "user@example.com",
  name: "User",
  role: "USER" as const,
}

const USER_ID = USER.id
const LESSON_ID = "33333333-3333-4333-8333-333333333333"
const COURSE_ID = "44444444-4444-4444-8444-444444444444"
const COURSE_ID_2 = "55555555-5555-4555-8555-555555555555"

type RouteContext = { params: Promise<{ lessonId: string }> }
function makeLessonContext(lessonId: string): RouteContext {
  return { params: Promise.resolve({ lessonId }) }
}

function makeRequest(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, init)
}

function makeLessonMeta(overrides: Partial<{
  duration: number | null
  courseStatus: string
}> = {}) {
  return [{
    duration: 600,
    courseStatus: "active",
    ...overrides,
  }]
}

function makeProgressRow(overrides: Partial<{
  lessonId: string
  positionSeconds: number
  updatedAt: Date
}> = {}) {
  return {
    lessonId: LESSON_ID,
    positionSeconds: 30,
    updatedAt: new Date("2026-09-17T08:00:00Z"),
    ...overrides,
  }
}

function makeCourseRow(overrides: Partial<{
  id: string
  creatorId: string
  title: string
  description: string
  coverImages: string[]
  tags: string[]
  status: string
  reviewerId: string | null
  reviewedAt: Date | null
  reviewNote: string | null
  createdAt: Date
  updatedAt: Date
}> = {}) {
  return {
    id: COURSE_ID,
    creatorId: "11111111-1111-1111-1111-111111111111",
    title: "太极拳入门",
    description: "从零开始学习太极拳的基础课程,共十二个课时",
    coverImages: [],
    tags: [],
    status: "active",
    reviewerId: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date("2026-09-15T00:00:00Z"),
    updatedAt: new Date("2026-09-17T08:00:00Z"),
    ...overrides,
  }
}

function makeProgressJoinRow(overrides: Partial<{
  lessonId: string
  positionSeconds: number
  updatedAt: Date
  courseId: string
  lessonTitle: string
  lessonSortOrder: number
}> = {}) {
  return {
    lessonId: LESSON_ID,
    positionSeconds: 30,
    updatedAt: new Date("2026-09-17T08:00:00Z"),
    courseId: COURSE_ID,
    lessonTitle: "第一课",
    lessonSortOrder: 0,
    ...overrides,
  }
}

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb.insert.mockClear()
  selectResults.clear()
  insertResults.clear()
  requireSessionMock.mockReset()
})

// --------------------------------------------------------------------------
// PUT /api/users/me/course-progress/:lessonId
// --------------------------------------------------------------------------
describe("PUT /api/users/me/course-progress/:lessonId", () => {
  it("returns 401 when not logged in", async () => {
    requireSessionMock.mockResolvedValue({ response: new Response("unauthorized", { status: 401 }) })
    const res = await putProgress(
      makeRequest(`/api/users/me/course-progress/${LESSON_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionSeconds: 30 }),
      }),
      makeLessonContext(LESSON_ID)
    )
    expect(res.status).toBe(401)
    expect(mockDb.select).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when the lessonId is not a uuid", async () => {
    requireSessionMock.mockResolvedValue({ user: USER })
    const res = await putProgress(
      makeRequest("/api/users/me/course-progress/not-a-uuid", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionSeconds: 30 }),
      }),
      makeLessonContext("not-a-uuid")
    )
    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it.each([
    ["missing field", {}],
    ["negative position", { positionSeconds: -1 }],
    ["non-numeric", { positionSeconds: "30" }],
    ["over 24h", { positionSeconds: 24 * 3600 + 1 }],
  ])("returns 400 for invalid body (%s)", async (_label, body) => {
    requireSessionMock.mockResolvedValue({ user: USER })
    const res = await putProgress(
      makeRequest(`/api/users/me/course-progress/${LESSON_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
      makeLessonContext(LESSON_ID)
    )
    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 404 when the lesson does not exist", async () => {
    requireSessionMock.mockResolvedValue({ user: USER })
    selectResults.push([]) // 第一段 select:lesson 元数据 → 空

    const res = await putProgress(
      makeRequest(`/api/users/me/course-progress/${LESSON_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionSeconds: 30 }),
      }),
      makeLessonContext(LESSON_ID)
    )
    expect(res.status).toBe(404)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it.each(["pending", "offline", "rejected", "deleted"])(
    "returns 404 when the lesson belongs to a non-active course (%s)",
    async (status) => {
      requireSessionMock.mockResolvedValue({ user: USER })
      selectResults.push(makeLessonMeta({ courseStatus: status }))

      const res = await putProgress(
        makeRequest(`/api/users/me/course-progress/${LESSON_ID}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ positionSeconds: 30 }),
        }),
        makeLessonContext(LESSON_ID)
      )
      expect(res.status).toBe(404)
      expect(mockDb.insert).not.toHaveBeenCalled()
    }
  )

  it("returns 200 and persists the progress", async () => {
    requireSessionMock.mockResolvedValue({ user: USER })
    selectResults.push(makeLessonMeta({ duration: 600 }))
    insertResults.push([makeProgressRow({ positionSeconds: 30 })])

    const res = await putProgress(
      makeRequest(`/api/users/me/course-progress/${LESSON_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionSeconds: 30 }),
      }),
      makeLessonContext(LESSON_ID)
    )
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<CourseLessonProgressDTO>
    expect(body.data.lessonId).toBe(LESSON_ID)
    expect(body.data.positionSeconds).toBe(30)
    expect(body.data.updatedAt).toBe("2026-09-17T08:00:00.000Z")
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
  })
})

// --------------------------------------------------------------------------
// GET /api/users/me/course-progress?courseId=
// --------------------------------------------------------------------------
describe("GET /api/users/me/course-progress", () => {
  it("returns 401 when not logged in", async () => {
    requireSessionMock.mockResolvedValue({ response: new Response("unauthorized", { status: 401 }) })
    const res = await getCourseProgress(
      makeRequest(`/api/users/me/course-progress?courseId=${COURSE_ID}`)
    )
    expect(res.status).toBe(401)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("returns 400 when courseId is missing", async () => {
    requireSessionMock.mockResolvedValue({ user: USER })
    const res = await getCourseProgress(
      makeRequest("/api/users/me/course-progress")
    )
    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("returns 400 when courseId is not a uuid", async () => {
    requireSessionMock.mockResolvedValue({ user: USER })
    const res = await getCourseProgress(
      makeRequest("/api/users/me/course-progress?courseId=not-a-uuid")
    )
    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("returns an empty list when no progress exists", async () => {
    requireSessionMock.mockResolvedValue({ user: USER })
    selectResults.push([])

    const res = await getCourseProgress(
      makeRequest(`/api/users/me/course-progress?courseId=${COURSE_ID}`)
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ list: CourseLessonProgressDTO[] }>
    expect(body.data.list).toEqual([])
  })

  it("returns the progress list scoped to the course", async () => {
    requireSessionMock.mockResolvedValue({ user: USER })
    selectResults.push([
      makeProgressRow({ lessonId: LESSON_ID, positionSeconds: 30, updatedAt: new Date("2026-09-17T08:00:00Z") }),
      makeProgressRow({ lessonId: "33333333-3333-4333-8333-333333333334", positionSeconds: 90, updatedAt: new Date("2026-09-17T08:30:00Z") }),
    ])

    const res = await getCourseProgress(
      makeRequest(`/api/users/me/course-progress?courseId=${COURSE_ID}`)
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ list: CourseLessonProgressDTO[] }>
    expect(body.data.list).toHaveLength(2)
    expect(body.data.list[0]!.lessonId).toBe(LESSON_ID)
    expect(body.data.list[0]!.positionSeconds).toBe(30)
    expect(body.data.list[1]!.positionSeconds).toBe(90)
  })
})

// --------------------------------------------------------------------------
// GET /api/users/me/courses/recent
// --------------------------------------------------------------------------
describe("GET /api/users/me/courses/recent", () => {
  it("returns 401 when not logged in", async () => {
    requireSessionMock.mockResolvedValue({ response: new Response("unauthorized", { status: 401 }) })
    const res = await getRecentCourses(makeRequest("/api/users/me/courses/recent"))
    expect(res.status).toBe(401)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it.each(["limit=0", "limit=51", "limit=abc", "limit=-1"])(
    "returns 400 for invalid limit (%s)",
    async (query) => {
      requireSessionMock.mockResolvedValue({ user: USER })
      const res = await getRecentCourses(
        makeRequest(`/api/users/me/courses/recent?${query}`)
      )
      expect(res.status).toBe(400)
      expect(mockDb.select).not.toHaveBeenCalled()
    }
  )

  it("returns an empty list when no recent progress exists", async () => {
    requireSessionMock.mockResolvedValue({ user: USER })
    selectResults.push([])

    const res = await getRecentCourses(
      makeRequest("/api/users/me/courses/recent")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ list: RecentCourseDTO[] }>
    expect(body.data.list).toEqual([])
  })

  it("aggregates progress to one entry per course and filters out non-active courses", async () => {
    requireSessionMock.mockResolvedValue({ user: USER })
    // 用户最近窗口内两条进度:
    //   - COURSE_ID 最新(应保留)
    //   - COURSE_ID_2 较早(保留)
    //   - COURSE_ID 还有一条更早(同课程,被 group 掉)
    selectResults.push([
      makeProgressJoinRow({
        lessonId: LESSON_ID,
        courseId: COURSE_ID,
        lessonTitle: "第一课",
        lessonSortOrder: 0,
        positionSeconds: 60,
        updatedAt: new Date("2026-09-17T10:00:00Z"),
      }),
      makeProgressJoinRow({
        lessonId: "33333333-3333-4333-8333-333333333334",
        courseId: COURSE_ID,
        lessonTitle: "第二课",
        lessonSortOrder: 1,
        positionSeconds: 30,
        updatedAt: new Date("2026-09-16T10:00:00Z"),
      }),
      makeProgressJoinRow({
        lessonId: "33333333-3333-4333-8333-333333333335",
        courseId: COURSE_ID_2,
        lessonTitle: "另一课",
        lessonSortOrder: 0,
        positionSeconds: 120,
        updatedAt: new Date("2026-09-15T10:00:00Z"),
      }),
    ])
    // 课程查询:仅 COURSE_ID 是 active,COURSE_ID_2 是 pending(应被过滤)
    selectResults.push([
      makeCourseRow({ id: COURSE_ID, title: "太极拳入门" }),
    ])

    const res = await getRecentCourses(
      makeRequest("/api/users/me/courses/recent?limit=10")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ list: RecentCourseDTO[] }>
    expect(body.data.list).toHaveLength(1)
    const first = body.data.list[0]!
    expect(first.course.id).toBe(COURSE_ID)
    expect(first.course.title).toBe("太极拳入门")
    expect(first.lastLessonId).toBe(LESSON_ID)
    expect(first.lastLessonTitle).toBe("第一课")
    expect(first.lastLessonSortOrder).toBe(0)
    expect(first.lastPositionSeconds).toBe(60)
    expect(first.lastPlayedAt).toBe("2026-09-17T10:00:00.000Z")
    // C 端白名单:不带 status / creatorId / reviewNote / reviewedAt
    expect(first.course).not.toHaveProperty("status")
    expect(first.course).not.toHaveProperty("creatorId")
    expect(first.course).not.toHaveProperty("reviewNote")
    expect(first.course).not.toHaveProperty("reviewedAt")
  })

  it("respects the limit parameter (truncates the aggregated list)", async () => {
    requireSessionMock.mockResolvedValue({ user: USER })
    selectResults.push([])
    const res = await getRecentCourses(
      makeRequest("/api/users/me/courses/recent?limit=1")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ list: RecentCourseDTO[] }>
    expect(body.data.list).toEqual([])
  })
})

// 自检:确认 userId 一致传递(避免代码改 user → userId 时静默通过)
describe("userId propagation", () => {
  it("PUT uses the session user id for the upsert target", async () => {
    requireSessionMock.mockResolvedValue({ user: USER })
    selectResults.push(makeLessonMeta({ duration: 600 }))
    insertResults.push([makeProgressRow()])

    await putProgress(
      makeRequest(`/api/users/me/course-progress/${LESSON_ID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ positionSeconds: 30 }),
      }),
      makeLessonContext(LESSON_ID)
    )
    expect(requireSessionMock).toHaveBeenCalledTimes(1)
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
  })

  it("GET single-course and recent both invoke requireSession", async () => {
    requireSessionMock.mockResolvedValue({ user: USER })
    selectResults.push([])
    selectResults.push([])

    await getCourseProgress(
      makeRequest(`/api/users/me/course-progress?courseId=${COURSE_ID}`)
    )
    await getRecentCourses(makeRequest("/api/users/me/courses/recent"))
    expect(requireSessionMock).toHaveBeenCalledTimes(2)
  })
})

// 占位提示:USER_ID 在 mock 不可读时使用,避免 TS6133
void USER_ID