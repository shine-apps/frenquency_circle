import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 教师后台课程 API 集成测试。
 *
 * 覆盖:
 * - POST   /api/teacher/courses
 *     401 / 403 USER / 400 空 lessons / 201 成功(status=pending, lessons 带序)
 * - PATCH  /api/teacher/courses/:courseId
 *     401 / 400 非 uuid / 404 / 403 非创建者且非 ADMIN
 *     403 pending→active / 200 active→offline / 200 ADMIN 代管 / 200 lessons 全量替换
 * - DELETE /api/teacher/courses/:courseId
 *     403 非创建者 / 200 软删除
 *
 * mock 层级与 teacher-activities.test.ts 一致,额外增加 transaction / delete 链
 * (课程落库走事务,课时全量替换需要 delete)。
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
  chainUpdate,
  chainDelete,
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

  const chainDelete = {
    where: vi.fn(function (this: unknown) {
      return chainDelete
    }),
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(undefined).then(resolve, reject),
  }

  const mockDb: Record<string, unknown> = {
    select: vi.fn(() => makeSelectChain(selectResultsQueue.shift() ?? [])),
    insert: vi.fn(() => chainInsert),
    update: vi.fn(() => chainUpdate),
    delete: vi.fn(() => chainDelete),
  }
  ;(mockDb as { transaction: unknown }).transaction = vi.fn(
    async (cb: (tx: unknown) => Promise<unknown>) => cb(mockDb)
  )

  return {
    mockDb,
    chainInsert,
    chainUpdate,
    chainDelete,
    insertReturningMock,
    updateReturningMock,
    setSelectResultsQueue: (results: Record<string, unknown>[][]) => {
      selectResultsQueue.length = 0
      selectResultsQueue.push(...results)
    },
    authMock: vi.fn(),
  }
}) as unknown as {
  mockDb: {
    select: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    transaction: ReturnType<typeof vi.fn>
  }
  chainInsert: { values: ReturnType<typeof vi.fn>; returning: ReturnType<typeof vi.fn> }
  chainUpdate: { set: ReturnType<typeof vi.fn>; where: ReturnType<typeof vi.fn>; returning: ReturnType<typeof vi.fn> }
  chainDelete: { where: ReturnType<typeof vi.fn> }
  insertReturningMock: ReturnType<typeof vi.fn>
  updateReturningMock: ReturnType<typeof vi.fn>
  setSelectResultsQueue: (results: Record<string, unknown>[][]) => void
  authMock: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/db", () => ({ db: mockDb }))
vi.mock("@/auth", () => ({ auth: authMock }))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { CIRCLE: "CIRCLE", COURSE: "COURSE" },
}))

import { POST as postCourse } from "@/app/api/teacher/courses/route"
import {
  PATCH as patchCourse,
  DELETE as deleteCourse,
} from "@/app/api/teacher/courses/[courseId]/route"
import type { CourseDTO, IResponse } from "@/types/api"

const TEACHER_ID = "11111111-1111-1111-1111-111111111111"
const OTHER_TEACHER_ID = "44444444-4444-4444-4444-444444444444"
const COURSE_ID = "88888888-8888-4888-8888-888888888888"
const MISSING_COURSE_ID = "00000000-0000-4000-8000-000000000000"

const TEACHER = { id: TEACHER_ID, role: "TEACHER", email: "t@e.com", name: "T" }
const OTHER_TEACHER = { id: OTHER_TEACHER_ID, role: "TEACHER", email: "t2@e.com", name: "T2" }
const ADMIN = { id: "33333333-3333-3333-3333-333333333333", role: "ADMIN", email: "a@e.com", name: "A" }
const USER = { id: "22222222-2222-2222-2222-222222222222", role: "USER", email: "u@e.com", name: "U" }

function sessionOf(user: unknown) {
  return user ? { user, expires: "2099-01-01" } : null
}

const VALID_BODY = {
  title: "太极拳入门",
  description: "从零开始学习太极拳的基础课程,共十二个课时",
  coverImages: ["https://cos.example.com/cover.jpg"],
  tags: ["太极拳"],
  lessons: [
    { title: "第一课：站桩", videoUrl: "https://cos.example.com/lesson-1.mp4", durationSeconds: 600 },
    { title: "第二课：云手", videoUrl: "https://cos.example.com/lesson-2.mp4" },
  ],
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

function makeLessonRows(courseId = COURSE_ID): LessonRow[] {
  return [
    {
      id: "lesson-1",
      courseId,
      title: "第一课：站桩",
      description: "",
      videoUrl: "https://cos.example.com/lesson-1.mp4",
      durationSeconds: 600,
      sortOrder: 0,
      createdAt: new Date("2026-09-15T00:00:00Z"),
      updatedAt: new Date("2026-09-15T00:00:00Z"),
    },
    {
      id: "lesson-2",
      courseId,
      title: "第二课：云手",
      description: "",
      videoUrl: "https://cos.example.com/lesson-2.mp4",
      durationSeconds: null,
      sortOrder: 1,
      createdAt: new Date("2026-09-15T00:00:00Z"),
      updatedAt: new Date("2026-09-15T00:00:00Z"),
    },
  ]
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

type CourseContext = { params: Promise<{ courseId: string }> }
function makeContext(courseId: string): CourseContext {
  return { params: Promise.resolve({ courseId }) }
}

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb.insert.mockClear()
  mockDb.update.mockClear()
  mockDb.delete.mockClear()
  mockDb.transaction.mockClear()
  chainInsert.values.mockClear()
  insertReturningMock.mockReset()
  chainUpdate.set.mockClear()
  chainUpdate.where.mockClear()
  updateReturningMock.mockReset()
  chainDelete.where.mockClear()
  authMock.mockReset()
  setSelectResultsQueue([])
})

describe("POST /api/teacher/courses", () => {
  it("returns 401 when not logged in", async () => {
    authMock.mockResolvedValue(null)
    const res = await postCourse(makeJsonRequest(VALID_BODY, "/api/teacher/courses"))
    expect(res.status).toBe(401)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 403 when the session role is USER", async () => {
    authMock.mockResolvedValue(sessionOf(USER))
    const res = await postCourse(makeJsonRequest(VALID_BODY, "/api/teacher/courses"))
    expect(res.status).toBe(403)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when lessons is empty", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    const res = await postCourse(
      makeJsonRequest({ ...VALID_BODY, lessons: [] }, "/api/teacher/courses")
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("creates a pending course with ordered lessons", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    const courseRow = makeCourseRow()
    const lessonRows = makeLessonRows()
    insertReturningMock
      .mockResolvedValueOnce([courseRow])
      .mockResolvedValueOnce(lessonRows)

    const res = await postCourse(makeJsonRequest(VALID_BODY, "/api/teacher/courses"))
    expect(res.status).toBe(201)

    const data = (await res.json()) as IResponse<CourseDTO>
    expect(data.data.status).toBe("pending")
    expect(data.data.lessonCount).toBe(2)
    expect(data.data.lessons.map((l) => l.sortOrder)).toEqual([0, 1])
    expect(data.data.lessons[1].durationSeconds).toBeNull()

    // 事务内两次 insert:课程 + 课时
    expect(mockDb.transaction).toHaveBeenCalledTimes(1)
    expect(mockDb.insert).toHaveBeenCalledTimes(2)
  })

  it("rejects a lesson without a valid video url", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    const res = await postCourse(
      makeJsonRequest(
        { ...VALID_BODY, lessons: [{ title: "第一课", videoUrl: "not-a-url" }] },
        "/api/teacher/courses"
      )
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})

describe("PATCH /api/teacher/courses/:courseId", () => {
  it("returns 401 when not logged in", async () => {
    authMock.mockResolvedValue(null)
    const res = await patchCourse(
      makeJsonRequest({ title: "新标题" }, `/api/teacher/courses/${COURSE_ID}`, "PATCH"),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 when courseId is not a uuid", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    const res = await patchCourse(
      makeJsonRequest({ title: "新标题" }, "/api/teacher/courses/nope", "PATCH"),
      makeContext("nope")
    )
    expect(res.status).toBe(400)
  })

  it("returns 404 when the course does not exist", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[]])
    const res = await patchCourse(
      makeJsonRequest({ title: "新标题" }, `/api/teacher/courses/${MISSING_COURSE_ID}`, "PATCH"),
      makeContext(MISSING_COURSE_ID)
    )
    expect(res.status).toBe(404)
  })

  it("returns 403 for a non-owner teacher", async () => {
    authMock.mockResolvedValue(sessionOf(OTHER_TEACHER))
    setSelectResultsQueue([[makeCourseRow()], makeLessonRows()])
    const res = await patchCourse(
      makeJsonRequest({ title: "新标题" }, `/api/teacher/courses/${COURSE_ID}`, "PATCH"),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(403)
  })

  it("returns 403 when a teacher tries to publish a pending course", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeCourseRow({ status: "pending" })], makeLessonRows()])
    const res = await patchCourse(
      makeJsonRequest({ status: "active" }, `/api/teacher/courses/${COURSE_ID}`, "PATCH"),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("allows active -> offline for the owner", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    const courseRow = makeCourseRow({ status: "active" })
    const lessonRows = makeLessonRows()
    // select#1 课程,select#2 课时(loadManageableCourse),select#3 课时(事务内)
    setSelectResultsQueue([[courseRow], lessonRows, lessonRows])
    updateReturningMock.mockResolvedValue([{ ...courseRow, status: "offline" }])

    const res = await patchCourse(
      makeJsonRequest({ status: "offline" }, `/api/teacher/courses/${COURSE_ID}`, "PATCH"),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as IResponse<CourseDTO>
    expect(data.data.status).toBe("offline")
    expect(data.data.lessonCount).toBe(2)
  })

  it("allows admin to manage other teachers' courses", async () => {
    authMock.mockResolvedValue(sessionOf(ADMIN))
    const courseRow = makeCourseRow({ creatorId: OTHER_TEACHER_ID, status: "active" })
    const lessonRows = makeLessonRows()
    setSelectResultsQueue([[courseRow], lessonRows, lessonRows])
    updateReturningMock.mockResolvedValue([{ ...courseRow, status: "offline" }])

    const res = await patchCourse(
      makeJsonRequest({ status: "offline" }, `/api/teacher/courses/${COURSE_ID}`, "PATCH"),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(200)
  })

  it("replaces lessons when provided", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    const courseRow = makeCourseRow()
    const lessonRows = makeLessonRows()
    setSelectResultsQueue([[courseRow], lessonRows, lessonRows])
    updateReturningMock.mockResolvedValue([courseRow])
    insertReturningMock.mockResolvedValue([
      { ...lessonRows[0], title: "改后的第一课" },
    ])

    const res = await patchCourse(
      makeJsonRequest(
        { lessons: [{ title: "改后的第一课", videoUrl: "https://cos.example.com/new.mp4" }] },
        `/api/teacher/courses/${COURSE_ID}`,
        "PATCH"
      ),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(200)

    const data = (await res.json()) as IResponse<CourseDTO>
    expect(data.data.lessonCount).toBe(1)
    expect(data.data.lessons[0].title).toBe("改后的第一课")
    // 事务内:delete 旧行 + insert 新行
    expect(mockDb.delete).toHaveBeenCalledTimes(1)
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
  })

  it("returns 400 when no field is provided", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeCourseRow()], makeLessonRows()])
    const res = await patchCourse(
      makeJsonRequest({}, `/api/teacher/courses/${COURSE_ID}`, "PATCH"),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(400)
  })
})

describe("DELETE /api/teacher/courses/:courseId", () => {
  it("returns 403 for a non-owner teacher", async () => {
    authMock.mockResolvedValue(sessionOf(OTHER_TEACHER))
    setSelectResultsQueue([[makeCourseRow()], makeLessonRows()])
    const res = await deleteCourse(
      new Request(`http://localhost/api/teacher/courses/${COURSE_ID}`, { method: "DELETE" }),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(403)
  })

  it("soft deletes the course for the owner", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeCourseRow({ status: "active" })], makeLessonRows()])

    const res = await deleteCourse(
      new Request(`http://localhost/api/teacher/courses/${COURSE_ID}`, { method: "DELETE" }),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(200)
    const data = (await res.json()) as IResponse<{ id: string; status: string }>
    expect(data.data.status).toBe("deleted")
    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })
})
