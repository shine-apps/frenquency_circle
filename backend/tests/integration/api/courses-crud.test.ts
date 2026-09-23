import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * C 端课程 API 集成测试(POST /api/courses)。
 *
 * 覆盖:
 * - POST 401 未登录 / 201 USER 角色可直接创建(status=pending) /
 *        201 空 lessons(先建课后补课时) / 400 校验失败(简介过短 / videoUrl 非法 / 课时超上限)
 * - GET  可选登录:未登录仍可浏览已上线课程
 *
 * 与教师后台 `POST /api/teacher/courses` 共用 `lib/courses` 的
 * schema 与落库实现,差异仅在鉴权口径(Bearer token + 任意登录用户)。
 */

type CourseRow = {
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
}

type LessonRow = {
  id: string
  courseId: string
  title: string
  description: string
  videoUrl: string
  durationSeconds: number | null
  sortOrder: number
  createdAt: Date
  updatedAt: Date
}

const {
  mockDb,
  chainInsert,
  insertReturningMock,
  setSelectResultsQueue,
  readUserFromTokenMock,
} = vi.hoisted(() => {
  const selectResultsQueue: Record<string, unknown>[][] = []

  function makeSelectChain(result: Record<string, unknown>[]) {
    const chain = {
      from: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      where: vi.fn(() => chain),
      groupBy: vi.fn(() => chain),
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
  }

  const mockDb: Record<string, unknown> = {
    select: vi.fn(() => makeSelectChain(selectResultsQueue.shift() ?? [])),
    insert: vi.fn(() => chainInsert),
  }
  mockDb.transaction = vi.fn(
    async (cb: (tx: unknown) => Promise<unknown>) => cb(mockDb)
  )

  return {
    mockDb,
    chainInsert,
    insertReturningMock,
    setSelectResultsQueue: (results: Record<string, unknown>[][]) => {
      selectResultsQueue.length = 0
      selectResultsQueue.push(...results)
    },
    readUserFromTokenMock: vi.fn(),
  }
}) as unknown as {
  mockDb: {
    select: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    transaction: ReturnType<typeof vi.fn>
  }
  chainInsert: { values: ReturnType<typeof vi.fn>; returning: ReturnType<typeof vi.fn> }
  insertReturningMock: ReturnType<typeof vi.fn>
  setSelectResultsQueue: (results: Record<string, unknown>[][]) => void
  readUserFromTokenMock: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/db", () => ({ db: mockDb }))

vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
}))

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { COURSE: "COURSE" },
}))

import { POST, GET as listCourses } from "@/app/api/courses/route"
import type { CourseDTO, IResponse, Paginated, PublicCourseDTO } from "@/types/api"

const USER_ID = "22222222-2222-2222-2222-222222222222"
const COURSE_ID = "88888888-8888-4888-8888-888888888888"

/** 普通用户(非教师) —— 创建权限已放开,应可正常发布 */
const REGULAR_USER = {
  id: USER_ID,
  email: "user@example.com",
  name: "User",
  role: "USER" as const,
}

const VALID_BODY = {
  title: "零基础太极拳入门",
  description: "从零开始学习太极拳的基础课程,包含站桩、云手等十二个课时。",
  coverImages: ["https://cos.example.com/cover.jpg"],
  tags: ["太极拳"],
  lessons: [
    { title: "第一课:站桩", videoUrl: "https://cos.example.com/lesson-1.mp4", durationSeconds: 600 },
    { title: "第二课:云手", videoUrl: "https://cos.example.com/lesson-2.mp4" },
  ],
}

function makeCourseRow(overrides: Partial<CourseRow> = {}): CourseRow {
  return {
    id: COURSE_ID,
    creatorId: USER_ID,
    title: VALID_BODY.title,
    description: VALID_BODY.description,
    coverImages: VALID_BODY.coverImages,
    tags: VALID_BODY.tags,
    status: "pending",
    reviewerId: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date("2026-09-20T00:00:00Z"),
    updatedAt: new Date("2026-09-20T00:00:00Z"),
    ...overrides,
  }
}

function makeLessonRows(courseId = COURSE_ID): LessonRow[] {
  return [
    {
      id: "lesson-1",
      courseId,
      title: "第一课:站桩",
      description: "",
      videoUrl: "https://cos.example.com/lesson-1.mp4",
      durationSeconds: 600,
      sortOrder: 0,
      createdAt: new Date("2026-09-20T00:00:00Z"),
      updatedAt: new Date("2026-09-20T00:00:00Z"),
    },
    {
      id: "lesson-2",
      courseId,
      title: "第二课:云手",
      description: "",
      videoUrl: "https://cos.example.com/lesson-2.mp4",
      durationSeconds: null,
      sortOrder: 1,
      createdAt: new Date("2026-09-20T00:00:00Z"),
      updatedAt: new Date("2026-09-20T00:00:00Z"),
    },
  ]
}

function makeJsonRequest(body: unknown, path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function makeGetRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" })
}

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb.insert.mockClear()
  mockDb.transaction.mockClear()
  chainInsert.values.mockClear()
  insertReturningMock.mockReset()
  readUserFromTokenMock.mockReset()
  setSelectResultsQueue([])
})

describe("POST /api/courses", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await POST(makeJsonRequest(VALID_BODY, "/api/courses"))
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(401)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("creates course successfully for USER role (发布不要求教师认证)", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    insertReturningMock
      .mockResolvedValueOnce([makeCourseRow()])
      .mockResolvedValueOnce(makeLessonRows())

    const res = await POST(makeJsonRequest(VALID_BODY, "/api/courses"))
    expect(res.status).toBe(201)
    const body = (await res.json()) as IResponse<CourseDTO>
    expect(body.code).toBe(201)
    expect(body.data.id).toBe(COURSE_ID)
    // 任意角色创建后同样待管理员审核
    expect(body.data.status).toBe("pending")
    expect(body.data.creatorId).toBe(USER_ID)
    // 课时按提交顺序派生 sortOrder
    expect(body.data.lessons.map(lesson => lesson.sortOrder)).toEqual([0, 1])
    // 课程 + 课时 各一次 insert(同一事务)
    expect(mockDb.insert).toHaveBeenCalledTimes(2)
    const courseValues = chainInsert.values.mock.calls[0]?.[0] as Record<string, unknown>
    expect(courseValues).toMatchObject({ creatorId: USER_ID, status: "pending" })
  })

  it("creates course with empty lessons (先建课、后补课时)", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    insertReturningMock.mockResolvedValueOnce([makeCourseRow()])

    const res = await POST(
      makeJsonRequest({ ...VALID_BODY, lessons: [] }, "/api/courses")
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as IResponse<CourseDTO>
    expect(body.data.lessons).toEqual([])
    // 空课时不触发第二次 insert(drizzle 的 values([]) 会抛错)
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
  })

  it("returns 400 when description is too short", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    const res = await POST(
      makeJsonRequest({ ...VALID_BODY, description: "太短" }, "/api/courses")
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("Invalid request body")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when lesson videoUrl is not a valid URL", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    const res = await POST(
      makeJsonRequest(
        {
          ...VALID_BODY,
          lessons: [{ title: "第一课", videoUrl: "not-a-url" }],
        },
        "/api/courses"
      )
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when lessons exceed the limit", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    const lessons = Array.from({ length: 31 }, (_, i) => ({
      title: `第 ${i + 1} 课`,
      videoUrl: `https://cos.example.com/lesson-${i + 1}.mp4`,
    }))
    const res = await POST(
      makeJsonRequest({ ...VALID_BODY, lessons }, "/api/courses")
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})

describe("GET /api/courses", () => {
  it("仍支持未登录浏览已上线课程(可选登录语义不变)", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    setSelectResultsQueue([
      [
        {
          course: makeCourseRow({ status: "active" }),
          lessonCount: 2,
          totalDuration: 600,
        },
      ],
      [{ value: "1" }],
    ])

    const res = await listCourses(makeGetRequest("/api/courses"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<PublicCourseDTO>>
    expect(body.data.list).toHaveLength(1)
    expect(body.data.list[0]!.id).toBe(COURSE_ID)
  })
})
