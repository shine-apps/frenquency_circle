import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 课程列表 / 详情接口「关注态下发」集成测试。
 *
 * 覆盖:
 * - GET /api/courses:登录用户命中关注 → isFollowed=true;未命中 → false;
 *   未登录(可选登录语义不变)→ 恒为 false,且不发起关注关系查询
 * - GET /api/courses/:courseId:登录用户详情下发 isFollowed 与 teacher
 *
 * mock 层级:db 结果队列 + readUserFromToken 返回值。
 */

const { dbState, dbMock, readUserFromTokenMock, selectSpy } = vi.hoisted(() => {
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

  const selectSpy = vi.fn(() => makeChain())

  return {
    dbState,
    dbMock: {
      select: selectSpy,
      insert: () => makeChain(),
      update: () => makeChain(),
      delete: () => makeChain(),
      query: {},
    },
    readUserFromTokenMock: vi.fn(),
    selectSpy,
  }
})

vi.mock("@/lib/db", () => ({ db: dbMock }))

vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
}))

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { COURSE: "COURSE" },
}))

import { GET as getCourses } from "@/app/api/courses/route"
import { GET as getCourseDetail } from "@/app/api/courses/[courseId]/route"
import type {
  IResponse,
  Paginated,
  PublicCourseDTO,
  PublicCourseDetailDTO,
} from "@/types/api"

const VIEWER_ID = "11111111-1111-1111-1111-111111111111"
const CREATOR_ID = "22222222-2222-2222-2222-222222222222"
const COURSE_ID = "88888888-8888-4888-8888-888888888888"

const COURSE_ROW = {
  id: COURSE_ID,
  creatorId: CREATOR_ID,
  title: "零基础太极拳入门",
  description: "从零开始学习太极拳的基础课程,包含站桩、云手等十二个课时。",
  coverImages: [],
  tags: ["太极拳"],
  status: "active",
  reviewerId: null,
  reviewedAt: null,
  reviewNote: null,
  createdAt: new Date("2026-09-20T00:00:00Z"),
  updatedAt: new Date("2026-09-20T00:00:00Z"),
}

function makeRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "GET" })
}

beforeEach(() => {
  dbState.results = []
  readUserFromTokenMock.mockReset()
  selectSpy.mockClear()
})

describe("GET /api/courses 关注态", () => {
  it("marks isFollowed=true for courses the viewer follows", async () => {
    readUserFromTokenMock.mockResolvedValue({ id: VIEWER_ID, name: "V", role: "USER" })
    dbState.results = [
      // 主查询:课程 + 课时数 / 总时长聚合
      [{ course: COURSE_ROW, lessonCount: 12, totalDuration: 3600 }],
      // 总数
      [{ value: 1 }],
      // 关注关系(命中当前页课程)
      [{ courseId: COURSE_ID }],
    ]

    const res = await getCourses(makeRequest("/api/courses"))
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<Paginated<PublicCourseDTO>>
    expect(body.data.list[0]!.isFollowed).toBe(true)
    expect(body.data.list[0]!.lessonCount).toBe(12)
  })

  it("marks isFollowed=false when the viewer has not followed the course", async () => {
    readUserFromTokenMock.mockResolvedValue({ id: VIEWER_ID, name: "V", role: "USER" })
    dbState.results = [
      [{ course: COURSE_ROW, lessonCount: 12, totalDuration: 3600 }],
      [{ value: 1 }],
      [], // 关注关系未命中
    ]

    const res = await getCourses(makeRequest("/api/courses"))
    const body = (await res.json()) as IResponse<Paginated<PublicCourseDTO>>
    expect(body.data.list[0]!.isFollowed).toBe(false)
  })

  it("keeps anonymous browsing working without a follow query", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    dbState.results = [
      [{ course: COURSE_ROW, lessonCount: 12, totalDuration: 3600 }],
      [{ value: 1 }],
    ]

    const res = await getCourses(makeRequest("/api/courses"))
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<Paginated<PublicCourseDTO>>
    expect(body.data.list[0]!.isFollowed).toBe(false)
    // 主查询 + 总数两条:未登录不发起关注关系查询
    expect(selectSpy).toHaveBeenCalledTimes(2)
  })
})

describe("GET /api/courses/:courseId 关注态", () => {
  it("returns isFollowed and teacher for a logged-in viewer", async () => {
    readUserFromTokenMock.mockResolvedValue({ id: VIEWER_ID, name: "V", role: "USER" })
    dbState.results = [
      [COURSE_ROW], // 课程
      [], // 课时(列表为空即可)
      [{ id: CREATOR_ID, name: "太极老师", avatarUrl: null }], // 作者
      [{ courseId: COURSE_ID }], // 关注关系(已关注)
    ]

    const res = await getCourseDetail(makeRequest(`/api/courses/${COURSE_ID}`), {
      params: Promise.resolve({ courseId: COURSE_ID }),
    })
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<PublicCourseDetailDTO>
    expect(body.data.id).toBe(COURSE_ID)
    expect(body.data.isFollowed).toBe(true)
    expect(body.data.teacher).toEqual({
      id: CREATOR_ID,
      name: "太极老师",
      avatarUrl: null,
    })
  })

  it("returns 404 for a non-active course", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    dbState.results = [[{ ...COURSE_ROW, status: "offline" }], []]

    const res = await getCourseDetail(makeRequest(`/api/courses/${COURSE_ID}`), {
      params: Promise.resolve({ courseId: COURSE_ID }),
    })
    expect(res.status).toBe(404)
  })
})
