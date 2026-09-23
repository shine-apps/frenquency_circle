import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 视频课程关注相关接口集成测试。
 *
 * 覆盖:
 * - POST   /api/courses/:courseId/follow:401 / 400 非法 id / 404 不存在或未上线 /
 *   首次关注 200 + 通知 course_followed / 重复关注幂等(不再通知) / 作者本人关注不通知
 * - DELETE /api/courses/:courseId/follow:401 / 400 非法 id / 404 不存在 / 幂等取关
 * - GET    /api/courses/followed:401 / 400 非法 userId / 分页 + 作者信息 +
 *   课时聚合 / 过滤非 active 课程
 *
 * mock 层级(参考 users-follow.test.ts):
 * - @/lib/db:Proxy 链式 mock,按用例预置结果队列
 * - @/lib/auth-utils:requireSession 返回值
 * - @/lib/notifications:notifyUser
 * - @/lib/logger:避免输出噪音
 */

const { dbState, dbMock, requireSessionMock, notifyUserMock } = vi.hoisted(() => {
  const dbState = { results: [] as unknown[] }

  function makeChain(): unknown {
    const proxy: unknown = new Proxy(
      {},
      {
        get(_t, prop) {
          if (prop === "then") {
            return (
              resolve: (v: unknown) => unknown,
              reject?: (e: unknown) => unknown
            ) => Promise.resolve(dbState.results.shift()).then(resolve, reject)
          }
          return () => proxy
        },
      }
    )
    return proxy
  }

  const dbMock = {
    select: () => makeChain(),
    insert: () => makeChain(),
    update: () => makeChain(),
    delete: () => makeChain(),
    query: {},
  }

  return {
    dbState,
    dbMock,
    requireSessionMock: vi.fn(),
    notifyUserMock: vi.fn(),
  }
})

vi.mock("@/lib/db", () => ({ db: dbMock }))

vi.mock("@/lib/auth-utils", () => ({
  requireSession: requireSessionMock,
}))

vi.mock("@/lib/notifications", () => ({
  notifyUser: notifyUserMock,
  notifyAdmins: vi.fn(),
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
    ADMIN: "ADMIN",
    GEO: "GEO",
    CATEGORY: "CATEGORY",
    TAG: "TAG",
    NOTIFICATION: "NOTIFICATION",
    INTEREST: "INTEREST",
    CONTACT: "CONTACT",
    COURSE: "COURSE",
  },
}))

import { DELETE, POST } from "@/app/api/courses/[courseId]/follow/route"
import { GET as getFollowedCourses } from "@/app/api/courses/followed/route"
import type {
  FollowedCourseDTO,
  IResponse,
  Paginated,
} from "@/types/api"

const VIEWER_ID = "11111111-1111-1111-1111-111111111111"
const CREATOR_ID = "22222222-2222-2222-2222-222222222222"
const COURSE_ID = "88888888-8888-4888-8888-888888888888"

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

function makeCourseRow(overrides: Partial<CourseRow> = {}): CourseRow {
  return {
    id: COURSE_ID,
    creatorId: CREATOR_ID,
    title: "零基础太极拳入门",
    description: "从零开始学习太极拳的基础课程,包含站桩、云手等十二个课时。",
    coverImages: ["https://cos.example.com/cover.jpg"],
    tags: ["太极拳"],
    status: "active",
    reviewerId: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date("2026-09-20T00:00:00Z"),
    updatedAt: new Date("2026-09-20T00:00:00Z"),
    ...overrides,
  }
}

function makeRouteContext(
  courseId: string
): { params: Promise<{ courseId: string }> } {
  return { params: Promise.resolve({ courseId }) }
}

function makeRequest(method: string): Request {
  return new Request(`http://localhost/api/courses/${COURSE_ID}/follow`, {
    method,
  })
}

function makeListRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" })
}

function loggedIn() {
  requireSessionMock.mockResolvedValue({
    user: { id: VIEWER_ID, email: "v@example.com", name: "Viewer", role: "USER" },
  })
}

function notLoggedIn() {
  requireSessionMock.mockResolvedValue({
    response: new Response(null, { status: 401 }),
  })
}

beforeEach(() => {
  dbState.results = []
  requireSessionMock.mockReset()
  notifyUserMock.mockReset()
})

describe("POST /api/courses/:courseId/follow", () => {
  it("returns 401 when not logged in", async () => {
    notLoggedIn()
    const res = await POST(makeRequest("POST"), makeRouteContext(COURSE_ID))
    expect(res.status).toBe(401)
  })

  it("returns 400 when courseId is not a uuid", async () => {
    loggedIn()
    const res = await POST(makeRequest("POST"), makeRouteContext("not-a-uuid"))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("courseId 格式不正确")
  })

  it("returns 404 when the course does not exist", async () => {
    loggedIn()
    dbState.results = [[]]
    const res = await POST(makeRequest("POST"), makeRouteContext(COURSE_ID))
    expect(res.status).toBe(404)
  })

  it("returns 404 when the course is not active", async () => {
    loggedIn()
    dbState.results = [[makeCourseRow({ status: "pending" })]]
    const res = await POST(makeRequest("POST"), makeRouteContext(COURSE_ID))
    expect(res.status).toBe(404)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("课程不存在或已下线")
  })

  it("follows on first time and notifies the course creator", async () => {
    loggedIn()
    dbState.results = [
      [makeCourseRow()], // select 课程
      [{ id: "follow-row-1" }], // insert returning(首次关注)
      [{ name: "Viewer" }], // select 关注者昵称
    ]
    const res = await POST(makeRequest("POST"), makeRouteContext(COURSE_ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ followed: boolean }>
    expect(body.data.followed).toBe(true)
    expect(notifyUserMock).toHaveBeenCalledTimes(1)
    expect(notifyUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: CREATOR_ID,
        actorId: VIEWER_ID,
        type: "course_followed",
        entityType: "course",
        entityId: COURSE_ID,
        linkUrl: `/pages/course-detail/course-detail?id=${COURSE_ID}`,
      })
    )
  })

  it("is idempotent on repeated follow (no duplicate notification)", async () => {
    loggedIn()
    dbState.results = [
      [makeCourseRow()],
      [], // insert returning(唯一索引吸收重复关注)
    ]
    const res = await POST(makeRequest("POST"), makeRouteContext(COURSE_ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ followed: boolean }>
    expect(body.data.followed).toBe(true)
    expect(notifyUserMock).not.toHaveBeenCalled()
  })

  it("does not notify when the creator follows their own course", async () => {
    requireSessionMock.mockResolvedValue({
      user: {
        id: CREATOR_ID,
        email: "c@example.com",
        name: "Creator",
        role: "TEACHER",
      },
    })
    dbState.results = [
      [makeCourseRow()],
      [{ id: "follow-row-1" }], // 首次关注成功
    ]
    const res = await POST(makeRequest("POST"), makeRouteContext(COURSE_ID))
    expect(res.status).toBe(200)
    expect(notifyUserMock).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/courses/:courseId/follow", () => {
  it("returns 401 when not logged in", async () => {
    notLoggedIn()
    const res = await DELETE(makeRequest("DELETE"), makeRouteContext(COURSE_ID))
    expect(res.status).toBe(401)
  })

  it("returns 400 when courseId is not a uuid", async () => {
    loggedIn()
    const res = await DELETE(
      makeRequest("DELETE"),
      makeRouteContext("not-a-uuid")
    )
    expect(res.status).toBe(400)
  })

  it("returns 404 when the course does not exist", async () => {
    loggedIn()
    dbState.results = [[]]
    const res = await DELETE(makeRequest("DELETE"), makeRouteContext(COURSE_ID))
    expect(res.status).toBe(404)
  })

  it("unfollows idempotently (已下线的课程也允许取关)", async () => {
    loggedIn()
    dbState.results = [
      [{ id: COURSE_ID }], // select 课程(不限制状态)
      [], // delete 结果
    ]
    const res = await DELETE(makeRequest("DELETE"), makeRouteContext(COURSE_ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ followed: boolean }>
    expect(body.data.followed).toBe(false)
  })
})

describe("GET /api/courses/followed", () => {
  it("returns 401 when not logged in", async () => {
    notLoggedIn()
    const res = await getFollowedCourses(
      makeListRequest("/api/courses/followed")
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 when userId is not a uuid", async () => {
    loggedIn()
    const res = await getFollowedCourses(
      makeListRequest("/api/courses/followed?userId=not-a-uuid")
    )
    expect(res.status).toBe(400)
  })

  it("returns an empty page when the user follows nothing", async () => {
    loggedIn()
    dbState.results = [
      [], // 关注记录 join 课程 → 空页
      [{ value: 0 }], // 总数
    ]
    const res = await getFollowedCourses(
      makeListRequest("/api/courses/followed")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<FollowedCourseDTO>>
    expect(body.data.list).toEqual([])
    expect(body.data.total).toBe(0)
  })

  it("lists followed courses with author, lessonCount and followedAt", async () => {
    loggedIn()
    dbState.results = [
      // select 关注记录 join 课程(仅 active,SQL 层分页,倒序)
      [{ course: makeCourseRow(), followedAt: new Date("2026-09-21T00:00:00Z") }],
      // select 总数(与列表同 where)
      [{ value: 1 }],
      // select 作者信息
      [{ id: CREATOR_ID, name: "太极老师", avatarUrl: "https://cos.example.com/a.jpg" }],
      // select 课时聚合
      [{ courseId: COURSE_ID, lessonCount: 12, totalDuration: 3600 }],
    ]

    const res = await getFollowedCourses(
      makeListRequest("/api/courses/followed?page=1&pageSize=20")
    )
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<Paginated<FollowedCourseDTO>>
    expect(body.data.total).toBe(1)
    expect(body.data.page).toBe(1)
    expect(body.data.pageSize).toBe(20)

    const item = body.data.list[0]!
    expect(item.id).toBe(COURSE_ID)
    expect(item.title).toBe("零基础太极拳入门")
    expect(item.coverImages).toEqual(["https://cos.example.com/cover.jpg"])
    expect(item.lessonCount).toBe(12)
    expect(item.totalDurationSeconds).toBe(3600)
    expect(item.followedAt).toBe("2026-09-21T00:00:00.000Z")
    expect(item.teacher).toEqual({
      id: CREATOR_ID,
      name: "太极老师",
      avatarUrl: "https://cos.example.com/a.jpg",
    })
    // 关注列表项自身即为"已关注"
    expect(item.isFollowed).toBe(true)
  })

  it("excludes non-active courses at SQL level (total 与 list 同口径)", async () => {
    loggedIn()
    dbState.results = [
      // join 的 where 已带 `courses.status = 'active'`,下线课程不会进入结果集
      [],
      // 总数与列表同 where:下线课程同样不计入
      [{ value: 0 }],
    ]

    const res = await getFollowedCourses(
      makeListRequest("/api/courses/followed")
    )
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<Paginated<FollowedCourseDTO>>
    expect(body.data.list).toEqual([])
    expect(body.data.total).toBe(0)
  })

  it("marks teacher as null when the creator has been removed", async () => {
    loggedIn()
    dbState.results = [
      [{ course: makeCourseRow(), followedAt: new Date("2026-09-21T00:00:00Z") }],
      [{ value: 1 }],
      [], // 作者查不到(已软删除)
      [{ courseId: COURSE_ID, lessonCount: 0, totalDuration: null }],
    ]

    const res = await getFollowedCourses(
      makeListRequest("/api/courses/followed")
    )
    const body = (await res.json()) as IResponse<Paginated<FollowedCourseDTO>>
    expect(body.data.list[0]!.teacher).toBeNull()
    // 无课时 → 0(前端展示为「时长待补充」)
    expect(body.data.list[0]!.totalDurationSeconds).toBe(0)
  })
})
