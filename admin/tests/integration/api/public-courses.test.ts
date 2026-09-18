import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 用户端公开课程 API 集成测试(uni-app 只读接口)。
 *
 * 覆盖:
 * - GET /api/courses
 *     401 未登录 / 400 非法分页 / 200 分页列表(仅 active + 聚合课时数) / 200 空列表
 * - GET /api/courses/:courseId
 *     401 / 400 非 uuid / 404 不存在 / 404 非 active(不区分"未上线"与"不存在")
 *     / 200 详情(字段白名单:不含 reviewNote / reviewedAt / creatorId / status)
 *
 * mock 层级:
 * - @/lib/db:select 队列(每次 db.select() 取队首结果),链支持 leftJoin / groupBy
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值
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

const { mockDb, selectChains, setSelectResultsQueue, readUserFromTokenMock } =
  vi.hoisted(() => {
    // select 队列:每次 db.select() 调用取出队首结果
    const selectResultsQueue: Record<string, unknown>[][] = []
    /** 每次 db.select() 创建的查询链(供断言 where 条件) */
    const selectChains: {
      leftJoin: ReturnType<typeof vi.fn>
      where: ReturnType<typeof vi.fn>
      groupBy: ReturnType<typeof vi.fn>
    }[] = []

    // thenable select chain:支持列表(leftJoin/groupBy)与计数两条路径
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
      selectChains.push(chain)
      return chain
    }

    const mockDb = {
      select: vi.fn(() => makeSelectChain(selectResultsQueue.shift() ?? [])),
    }

    return {
      mockDb,
      selectChains,
      setSelectResultsQueue: (results: Record<string, unknown>[][]) => {
        selectResultsQueue.length = 0
        selectResultsQueue.push(...results)
      },
      readUserFromTokenMock: vi.fn(),
    }
  }) as {
    mockDb: { select: ReturnType<typeof vi.fn> }
    selectChains: {
      leftJoin: ReturnType<typeof vi.fn>
      where: ReturnType<typeof vi.fn>
      groupBy: ReturnType<typeof vi.fn>
    }[]
    setSelectResultsQueue: (results: Record<string, unknown>[][]) => void
    readUserFromTokenMock: ReturnType<typeof vi.fn>
  }

vi.mock("@/lib/db", () => ({ db: mockDb }))
vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
}))

import { GET as listCourses } from "@/app/api/courses/route"
import { GET as getCourse } from "@/app/api/courses/[courseId]/route"
import { extractSqlParamValues } from "@/tests/helpers/sql-params"
import type { IResponse, Paginated, PublicCourseDTO } from "@/types/api"

const USER = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "user@example.com",
  name: "User",
  role: "USER" as const,
}

const COURSE_ID = "88888888-8888-4888-8888-888888888888"
const MISSING_COURSE_ID = "00000000-0000-4000-8000-000000000000"

function makeCourseRow(overrides: Partial<CourseRow> = {}): CourseRow {
  return {
    id: COURSE_ID,
    creatorId: "11111111-1111-1111-1111-111111111111",
    title: "太极拳入门",
    description: "从零开始学习太极拳的基础课程,共十二个课时",
    coverImages: ["https://cos.example.com/cover.jpg"],
    tags: ["太极拳"],
    status: "active",
    reviewerId: "99999999-9999-9999-9999-999999999999",
    reviewedAt: new Date("2026-09-16T08:00:00Z"),
    reviewNote: "已通过",
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
      description: "云手动作要点",
      videoUrl: "https://cos.example.com/lesson-2.mp4",
      durationSeconds: null,
      sortOrder: 1,
      createdAt: new Date("2026-09-15T00:00:00Z"),
      updatedAt: new Date("2026-09-15T00:00:00Z"),
    },
  ]
}

function makeGetRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" })
}

type CourseContext = { params: Promise<{ courseId: string }> }
function makeContext(courseId: string): CourseContext {
  return { params: Promise.resolve({ courseId }) }
}

beforeEach(() => {
  mockDb.select.mockClear()
  readUserFromTokenMock.mockReset()
  selectChains.length = 0
  setSelectResultsQueue([])
})

describe("GET /api/courses", () => {
  it("returns 200 for anonymous visitors (optional auth for shared links)", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    setSelectResultsQueue([
      [{ course: makeCourseRow(), lessonCount: 2, totalDuration: 600 }],
      [{ value: 1 }],
    ])

    const res = await listCourses(makeGetRequest("/api/courses"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<PublicCourseDTO>>
    expect(body.data.total).toBe(1)
    expect(body.data.list[0]!.id).toBe(COURSE_ID)
  })

  it.each(["page=0", "page=abc", "pageSize=0", "pageSize=101"])(
    "returns 400 for invalid pagination (%s)",
    async (query) => {
      readUserFromTokenMock.mockResolvedValue(USER)
      const res = await listCourses(makeGetRequest(`/api/courses?${query}`))
      expect(res.status).toBe(400)
      expect(mockDb.select).not.toHaveBeenCalled()
    }
  )

  it("returns a paginated active-only list with aggregated lessonCount and totalDuration", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    // 第一次 select:列表(leftJoin 聚合);第二次 select:总数
    setSelectResultsQueue([
      [{ course: makeCourseRow(), lessonCount: 2, totalDuration: 1500 }],
      [{ value: 1 }],
    ])

    const res = await listCourses(makeGetRequest("/api/courses?page=1&pageSize=20"))
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<Paginated<PublicCourseDTO>>
    expect(body.data.total).toBe(1)
    expect(body.data.page).toBe(1)
    expect(body.data.pageSize).toBe(20)
    expect(body.data.list).toHaveLength(1)

    const item = body.data.list[0]!
    expect(item.id).toBe(COURSE_ID)
    expect(item.lessonCount).toBe(2)
    // 列表聚合总时长(SQL SUM(duration_seconds));全部未探测时为 0
    expect(item.totalDurationSeconds).toBe(1500)
    // 列表不返回课时明细,也不下发审核 / 创建者 / 老师信息
    expect(item.lessons).toEqual([])
    expect(item).not.toHaveProperty("reviewNote")
    expect(item).not.toHaveProperty("reviewedAt")
    expect(item).not.toHaveProperty("creatorId")
    expect(item).not.toHaveProperty("status")
    expect(item).not.toHaveProperty("teacher")

    // 列表查询必须带 leftJoin + groupBy(聚合课时数,避免 N+1)
    expect(selectChains[0]!.leftJoin).toHaveBeenCalledTimes(1)
    expect(selectChains[0]!.groupBy).toHaveBeenCalledTimes(1)
    // 过滤条件必须落在 active 状态上
    const whereParams = extractSqlParamValues(
      selectChains[0]!.where.mock.calls[0]?.[0]
    )
    expect(whereParams).toContain("active")
    // 总数与列表同口径:计数查询同样带 active 过滤
    const totalWhereParams = extractSqlParamValues(
      selectChains[1]!.where.mock.calls[0]?.[0]
    )
    expect(totalWhereParams).toContain("active")
  })

  it("returns an empty list when no active course exists", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[], [{ value: 0 }]])

    const res = await listCourses(makeGetRequest("/api/courses"))
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<Paginated<PublicCourseDTO>>
    expect(body.data.list).toEqual([])
    expect(body.data.total).toBe(0)
  })

  it("returns 400 when creatorId is not a uuid", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const res = await listCourses(makeGetRequest("/api/courses?creatorId=not-a-uuid"))
    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("narrows to the creator's active courses when creatorId is provided", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const creatorId = "11111111-1111-1111-1111-111111111111"
    setSelectResultsQueue([
      [{ course: makeCourseRow({ creatorId }), lessonCount: 0 }],
      [{ value: 1 }],
    ])

    const res = await listCourses(makeGetRequest(`/api/courses?creatorId=${creatorId}`))
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<Paginated<PublicCourseDTO>>
    expect(body.data.total).toBe(1)

    // 过滤条件必须同时落在 creatorId 与 active 状态上(公开主页只展示 TA 已上线的课程)
    const whereParams = extractSqlParamValues(
      selectChains[0]!.where.mock.calls[0]?.[0]
    )
    expect(whereParams).toContain(creatorId)
    expect(whereParams).toContain("active")
    // 计数查询与列表同口径
    const totalWhereParams = extractSqlParamValues(
      selectChains[1]!.where.mock.calls[0]?.[0]
    )
    expect(totalWhereParams).toContain(creatorId)
  })
})

describe("GET /api/courses/:courseId", () => {
  it("returns 200 for anonymous visitors (optional auth for shared links)", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    setSelectResultsQueue([
      [makeCourseRow()],
      makeLessonRows(),
      [{ id: "11111111-1111-1111-1111-111111111111", name: "王老师", avatarUrl: null }],
    ])

    const res = await getCourse(
      makeGetRequest(`/api/courses/${COURSE_ID}`),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ id: string }>
    expect(body.data.id).toBe(COURSE_ID)
  })

  it("returns 400 when the course id is not a uuid", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const res = await getCourse(
      makeGetRequest("/api/courses/not-a-uuid"),
      makeContext("not-a-uuid")
    )
    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("returns 404 when the course does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[]])

    const res = await getCourse(
      makeGetRequest(`/api/courses/${MISSING_COURSE_ID}`),
      makeContext(MISSING_COURSE_ID)
    )
    expect(res.status).toBe(404)
  })

  it.each(["pending", "offline", "rejected", "deleted"])(
    "returns 404 for a non-active course (%s)",
    async (status) => {
      readUserFromTokenMock.mockResolvedValue(USER)
      setSelectResultsQueue([[makeCourseRow({ status })]])

      const res = await getCourse(
        makeGetRequest(`/api/courses/${COURSE_ID}`),
        makeContext(COURSE_ID)
      )
      // 不区分"未上线"与"不存在",避免审核状态外泄
      expect(res.status).toBe(404)
    }
  )

  it("returns the course detail with ordered lessons, teacher info and a C-side whitelist", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    // 3 次 select:课程行 → 课时行 → 创建者(users)
    setSelectResultsQueue([
      [makeCourseRow()],
      makeLessonRows(),
      [{ id: "11111111-1111-1111-1111-111111111111", name: "王老师", avatarUrl: "https://cos.example.com/a.png" }],
    ])

    const res = await getCourse(
      makeGetRequest(`/api/courses/${COURSE_ID}`),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<PublicCourseDTO & { teacher: { id: string, name: string, avatarUrl: string | null } }>
    const data = body.data
    expect(data.id).toBe(COURSE_ID)
    expect(data.title).toBe("太极拳入门")
    expect(data.coverImages).toEqual(["https://cos.example.com/cover.jpg"])
    expect(data.tags).toEqual(["太极拳"])
    expect(data.lessonCount).toBe(2)
    // 详情场景 totalDurationSeconds 由 lessons 累计(600 + null → 600)
    expect(data.totalDurationSeconds).toBe(600)
    expect(data.lessons.map(lesson => lesson.sortOrder)).toEqual([0, 1])
    expect(data.lessons[0]!.videoUrl).toBe("https://cos.example.com/lesson-1.mp4")
    expect(data.lessons[1]!.durationSeconds).toBeNull()

    // 老师信息:仅公开字段(id / name / avatarUrl),可跳公开主页
    expect(data.teacher).toEqual({
      id: "11111111-1111-1111-1111-111111111111",
      name: "王老师",
      avatarUrl: "https://cos.example.com/a.png",
    })

    // 公开字段白名单:审核信息不下发;创建者仅暴露 teacher 轻量字段
    expect(Object.keys(data).sort()).toEqual(
      [
        "coverImages",
        "createdAt",
        "description",
        "id",
        "lessonCount",
        "lessons",
        "tags",
        "teacher",
        "title",
        "totalDurationSeconds",
        "updatedAt",
      ].sort()
    )
    expect(JSON.stringify(data)).not.toContain("已通过")
    // creatorId 字段本身不下发(通过 teacher.id 提供)
    expect(data).not.toHaveProperty("creatorId")
  })

  it("returns teacher: null when the creator user row is missing (soft-deleted)", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[makeCourseRow()], makeLessonRows(), []])

    const res = await getCourse(
      makeGetRequest(`/api/courses/${COURSE_ID}`),
      makeContext(COURSE_ID)
    )
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<{ teacher: unknown }>
    expect(body.data.teacher).toBeNull()
  })
})
