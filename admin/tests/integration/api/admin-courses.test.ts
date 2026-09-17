import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 管理后台课程审核 API 集成测试(PATCH /api/admin/courses/:id)。
 *
 * 覆盖:401 / 403(TEACHER 也 403)/ 400(非 uuid、非法 status)/ 404
 * 以及 pending→active / →rejected / active→offline 的落库补丁断言。
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

const { mockDb, chainUpdate, updateReturningMock, setSelectResultsQueue, authMock } =
  vi.hoisted(() => {
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

    return {
      mockDb: {
        select: vi.fn(() => makeSelectChain(selectResultsQueue.shift() ?? [])),
        insert: vi.fn(),
        update: vi.fn(() => chainUpdate),
        delete: vi.fn(),
      },
      chainUpdate,
      updateReturningMock,
      setSelectResultsQueue: (results: Record<string, unknown>[][]) => {
        selectResultsQueue.length = 0
        selectResultsQueue.push(...results)
      },
      authMock: vi.fn(),
    }
  })

vi.mock("@/lib/db", () => ({ db: mockDb }))
vi.mock("@/auth", () => ({ auth: authMock }))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { ADMIN: "ADMIN", COURSE: "COURSE" },
}))

import { PATCH as patchAdminCourse } from "@/app/api/admin/courses/[id]/route"
import type { CourseDTO, IResponse } from "@/types/api"

const ADMIN_ID = "33333333-3333-3333-3333-333333333333"
const TEACHER_ID = "11111111-1111-1111-1111-111111111111"
const COURSE_ID = "88888888-8888-4888-8888-888888888888"

const ADMIN = { id: ADMIN_ID, role: "ADMIN", email: "a@e.com", name: "A" }
const TEACHER = { id: TEACHER_ID, role: "TEACHER", email: "t@e.com", name: "T" }

function sessionOf(user: unknown) {
  return user ? { user, expires: "2099-01-01" } : null
}

function makeCourseRow(overrides: Partial<CourseRow> = {}): CourseRow {
  return {
    id: COURSE_ID,
    creatorId: TEACHER_ID,
    title: "太极拳入门",
    description: "从零开始学习太极拳的基础课程,共十二个课时",
    coverImages: [],
    tags: [],
    status: "pending",
    reviewerId: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date("2026-09-15T00:00:00Z"),
    updatedAt: new Date("2026-09-15T00:00:00Z"),
    ...overrides,
  }
}

function makeLessonRows(): LessonRow[] {
  return [
    {
      id: "lesson-1",
      courseId: COURSE_ID,
      title: "第一课：站桩",
      description: "",
      videoUrl: "https://cos.example.com/lesson-1.mp4",
      durationSeconds: 600,
      sortOrder: 0,
      createdAt: new Date("2026-09-15T00:00:00Z"),
      updatedAt: new Date("2026-09-15T00:00:00Z"),
    },
  ]
}

function makeRequest(body: unknown, path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

type RouteContext = { params: Promise<{ id: string }> }
function makeContext(id: string): RouteContext {
  return { params: Promise.resolve({ id }) }
}

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb.update.mockClear()
  chainUpdate.set.mockClear()
  updateReturningMock.mockReset()
  authMock.mockReset()
  setSelectResultsQueue([])
})

describe("PATCH /api/admin/courses/:id", () => {
  it("returns 401 when not logged in", async () => {
    authMock.mockResolvedValue(null)
    const res = await patchAdminCourse(
      makeRequest({ status: "active" }, `/api/admin/courses/${COURSE_ID}`),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(401)
  })

  it("returns 403 for a TEACHER session", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    const res = await patchAdminCourse(
      makeRequest({ status: "active" }, `/api/admin/courses/${COURSE_ID}`),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(403)
  })

  it("returns 400 when the id is not a uuid", async () => {
    authMock.mockResolvedValue(sessionOf(ADMIN))
    const res = await patchAdminCourse(
      makeRequest({ status: "active" }, "/api/admin/courses/nope"),
      makeContext("nope")
    )
    expect(res.status).toBe(400)
  })

  it("returns 400 for an unsupported status", async () => {
    authMock.mockResolvedValue(sessionOf(ADMIN))
    const res = await patchAdminCourse(
      makeRequest({ status: "deleted" }, `/api/admin/courses/${COURSE_ID}`),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(400)
  })

  it("returns 404 when the course does not exist", async () => {
    authMock.mockResolvedValue(sessionOf(ADMIN))
    setSelectResultsQueue([[]])
    const res = await patchAdminCourse(
      makeRequest({ status: "active" }, `/api/admin/courses/${COURSE_ID}`),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(404)
  })

  it("approves a pending course with reviewer fields", async () => {
    authMock.mockResolvedValue(sessionOf(ADMIN))
    const courseRow = makeCourseRow()
    setSelectResultsQueue([[courseRow], makeLessonRows()])
    const now = new Date()
    updateReturningMock.mockResolvedValue([
      { ...courseRow, status: "active", reviewerId: ADMIN_ID, reviewedAt: now },
    ])

    const res = await patchAdminCourse(
      makeRequest({ status: "active" }, `/api/admin/courses/${COURSE_ID}`),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(200)

    const setCalls = chainUpdate.set.mock.calls as unknown as Record<string, unknown>[][]
    const patch = setCalls[0][0]
    expect(patch.status).toBe("active")
    expect(patch.reviewerId).toBe(ADMIN_ID)
    expect(patch.reviewedAt).toBeInstanceOf(Date)

    const data = (await res.json()) as IResponse<CourseDTO>
    expect(data.data.status).toBe("active")
    expect(data.data.lessonCount).toBe(1)
  })

  it("rejects a course with a review note", async () => {
    authMock.mockResolvedValue(sessionOf(ADMIN))
    const courseRow = makeCourseRow()
    setSelectResultsQueue([[courseRow], makeLessonRows()])
    updateReturningMock.mockResolvedValue([
      { ...courseRow, status: "rejected", reviewNote: "视频不清晰" },
    ])

    const res = await patchAdminCourse(
      makeRequest(
        { status: "rejected", reviewNote: "视频不清晰" },
        `/api/admin/courses/${COURSE_ID}`
      ),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(200)

    const setCalls = chainUpdate.set.mock.calls as unknown as Record<string, unknown>[][]
    const patch = setCalls[0][0]
    expect(patch.status).toBe("rejected")
    expect(patch.reviewNote).toBe("视频不清晰")

    const data = (await res.json()) as IResponse<CourseDTO>
    expect(data.data.status).toBe("rejected")
    expect(data.data.reviewNote).toBe("视频不清晰")
  })

  it("takes an active course offline", async () => {
    authMock.mockResolvedValue(sessionOf(ADMIN))
    const courseRow = makeCourseRow({ status: "active" })
    setSelectResultsQueue([[courseRow], makeLessonRows()])
    updateReturningMock.mockResolvedValue([{ ...courseRow, status: "offline" }])

    const res = await patchAdminCourse(
      makeRequest({ status: "offline" }, `/api/admin/courses/${COURSE_ID}`),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(200)

    const setCalls = chainUpdate.set.mock.calls as unknown as Record<string, unknown>[][]
    const patch = setCalls[0][0]
    expect(patch.status).toBe("offline")

    const data = (await res.json()) as IResponse<CourseDTO>
    expect(data.data.status).toBe("offline")
  })
})
