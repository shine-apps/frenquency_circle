import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * GET /api/locations/match-people 与 match-circles 集成测试。
 *
 * 覆盖:
 * - 未登录返回 401
 * - 成功返回 Paginated<MatchPersonDTO> / Paginated<MatchCircleDTO>
 * - 缺少 latitude 返回 400
 * - 缺少 tagIds 返回 400
 * - rangeKm 非法值返回 400
 * - 分页参数非法(page=0)返回 400
 *
 * mock 层级:
 * - @/lib/match/people-matcher:控制 matchPeople 返回值
 * - @/lib/match/circle-matcher:控制 matchCircles 返回值
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值
 * - @/lib/logger:避免输出噪音
 *
 * 注:路由本身不直接访问 db,匹配逻辑由 matcher 模块承担(已有单元测试覆盖),
 * 因此本集成测试只验证路由层的鉴权、参数校验与响应组装。
 */

const {
  readUserFromTokenMock,
  matchPeopleMock,
  matchCirclesMock,
} = vi.hoisted(() => {
  return {
    readUserFromTokenMock: vi.fn(),
    matchPeopleMock: vi.fn(),
    matchCirclesMock: vi.fn(),
  }
}) as {
  readUserFromTokenMock: ReturnType<typeof vi.fn>
  matchPeopleMock: ReturnType<typeof vi.fn>
  matchCirclesMock: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
}))

vi.mock("@/lib/match/people-matcher", () => ({
  matchPeople: matchPeopleMock,
}))

vi.mock("@/lib/match/circle-matcher", () => ({
  matchCircles: matchCirclesMock,
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

import { GET as matchPeopleGET } from "@/app/api/locations/match-people/route"
import { GET as matchCirclesGET } from "@/app/api/locations/match-circles/route"
import type {
  IResponse,
  Paginated,
  MatchPersonDTO,
  MatchCircleDTO,
} from "@/types/api"

const FAKE_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "user@example.com",
  name: "User",
  role: "USER" as const,
}

const TAG_ID = "00000000-0000-0000-0000-000000000001"

function makeGetRequest(
  path: string,
  params: Record<string, string | undefined>
): Request {
  const url = new URL(`http://localhost${path}`)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v)
  }
  return new Request(url.toString(), { method: "GET" })
}

const SAMPLE_PEOPLE_RESULT: Paginated<MatchPersonDTO> = {
  list: [
    {
      userId: "22222222-2222-2222-2222-222222222222",
      name: "张三",
      avatarUrl: null,
      distanceKm: 0.5,
      tags: [],
      activityLevel: "medium",
      practiceYears: 3,
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
}

const SAMPLE_CIRCLES_RESULT: Paginated<MatchCircleDTO> = {
  list: [
    {
      circleId: "33333333-3333-3333-3333-333333333333",
      title: "陈氏太极拳晨练班",
      distanceKm: 1.2,
      tags: [],
      activityTime: "每周二、四 06:30",
      memberCount: 8,
      maxMembers: 20,
      address: "北京市朝阳区朝阳公园",
    },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
}

beforeEach(() => {
  readUserFromTokenMock.mockReset()
  matchPeopleMock.mockReset()
  matchCirclesMock.mockReset()
})

describe("GET /api/locations/match-people", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await matchPeopleGET(
      makeGetRequest("/api/locations/match-people", {
        latitude: "39.9042",
        longitude: "116.4074",
        tagIds: TAG_ID,
      })
    )
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(401)
    expect(body.message).toBe("未登录或登录已过期")
    expect(matchPeopleMock).not.toHaveBeenCalled()
  })

  it("returns 200 with Paginated<MatchPersonDTO> on success", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    matchPeopleMock.mockResolvedValue(SAMPLE_PEOPLE_RESULT)

    const res = await matchPeopleGET(
      makeGetRequest("/api/locations/match-people", {
        latitude: "39.9042",
        longitude: "116.4074",
        tagIds: TAG_ID,
        rangeKm: "5",
      })
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<MatchPersonDTO>>
    expect(body.code).toBe(200)
    expect(body.data.total).toBe(1)
    expect(body.data.list).toHaveLength(1)
    expect(body.data.list[0]!.userId).toBe(
      "22222222-2222-2222-2222-222222222222"
    )
    expect(body.data.list[0]!.distanceKm).toBe(0.5)
    // matcher 应以正确参数被调用
    expect(matchPeopleMock).toHaveBeenCalledTimes(1)
    const callArgs = matchPeopleMock.mock.calls[0]?.[0]
    expect(callArgs.lat).toBe(39.9042)
    expect(callArgs.lng).toBe(116.4074)
    expect(callArgs.rangeKm).toBe(5)
    expect(callArgs.currentUserId).toBe(FAKE_USER.id)
    expect(callArgs.page).toBe(1)
    expect(callArgs.pageSize).toBe(20)
  })

  it("defaults rangeKm to 5 when not provided", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    matchPeopleMock.mockResolvedValue(SAMPLE_PEOPLE_RESULT)

    const res = await matchPeopleGET(
      makeGetRequest("/api/locations/match-people", {
        latitude: "39.9042",
        longitude: "116.4074",
        tagIds: TAG_ID,
      })
    )
    expect(res.status).toBe(200)
    expect(matchPeopleMock).toHaveBeenCalledTimes(1)
    expect(matchPeopleMock.mock.calls[0]?.[0].rangeKm).toBe(5)
  })

  it("returns 400 when latitude is missing", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await matchPeopleGET(
      makeGetRequest("/api/locations/match-people", {
        longitude: "116.4074",
        tagIds: TAG_ID,
      })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid query parameters")
    expect(matchPeopleMock).not.toHaveBeenCalled()
  })

  it("returns 400 when tagIds is missing", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await matchPeopleGET(
      makeGetRequest("/api/locations/match-people", {
        latitude: "39.9042",
        longitude: "116.4074",
      })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid query parameters")
    expect(matchPeopleMock).not.toHaveBeenCalled()
  })

  it("returns 400 when rangeKm is not one of 1/5/10/30", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await matchPeopleGET(
      makeGetRequest("/api/locations/match-people", {
        latitude: "39.9042",
        longitude: "116.4074",
        tagIds: TAG_ID,
        rangeKm: "7",
      })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid query parameters")
    expect(matchPeopleMock).not.toHaveBeenCalled()
  })

  it("returns 400 when page is 0 (invalid pagination)", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await matchPeopleGET(
      makeGetRequest("/api/locations/match-people", {
        latitude: "39.9042",
        longitude: "116.4074",
        tagIds: TAG_ID,
        page: "0",
      })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid pagination parameters")
    expect(matchPeopleMock).not.toHaveBeenCalled()
  })

  it("accepts comma-separated tagIds", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    matchPeopleMock.mockResolvedValue(SAMPLE_PEOPLE_RESULT)

    const secondTag = "00000000-0000-0000-0000-000000000002"
    const res = await matchPeopleGET(
      makeGetRequest("/api/locations/match-people", {
        latitude: "39.9042",
        longitude: "116.4074",
        tagIds: `${TAG_ID},${secondTag}`,
      })
    )
    expect(res.status).toBe(200)
    expect(matchPeopleMock).toHaveBeenCalledTimes(1)
    expect(matchPeopleMock.mock.calls[0]?.[0].tagIds).toEqual([
      TAG_ID,
      secondTag,
    ])
  })
})

describe("GET /api/locations/match-circles", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await matchCirclesGET(
      makeGetRequest("/api/locations/match-circles", {
        latitude: "39.9042",
        longitude: "116.4074",
        tagIds: TAG_ID,
      })
    )
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(401)
    expect(body.message).toBe("未登录或登录已过期")
    expect(matchCirclesMock).not.toHaveBeenCalled()
  })

  it("returns 200 with Paginated<MatchCircleDTO> on success", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    matchCirclesMock.mockResolvedValue(SAMPLE_CIRCLES_RESULT)

    const res = await matchCirclesGET(
      makeGetRequest("/api/locations/match-circles", {
        latitude: "39.9042",
        longitude: "116.4074",
        tagIds: TAG_ID,
        rangeKm: "10",
      })
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<MatchCircleDTO>>
    expect(body.code).toBe(200)
    expect(body.data.total).toBe(1)
    expect(body.data.list).toHaveLength(1)
    expect(body.data.list[0]!.circleId).toBe(
      "33333333-3333-3333-3333-333333333333"
    )
    expect(body.data.list[0]!.title).toBe("陈氏太极拳晨练班")
    // matcher 应以正确参数被调用(注意 match-circles 不传 currentUserId)
    expect(matchCirclesMock).toHaveBeenCalledTimes(1)
    const callArgs = matchCirclesMock.mock.calls[0]?.[0]
    expect(callArgs.lat).toBe(39.9042)
    expect(callArgs.lng).toBe(116.4074)
    expect(callArgs.rangeKm).toBe(10)
    expect(callArgs.page).toBe(1)
    expect(callArgs.pageSize).toBe(20)
  })

  it("returns 400 when latitude is missing", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await matchCirclesGET(
      makeGetRequest("/api/locations/match-circles", {
        longitude: "116.4074",
        tagIds: TAG_ID,
      })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid query parameters")
    expect(matchCirclesMock).not.toHaveBeenCalled()
  })

  it("returns 400 when tagIds is missing", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await matchCirclesGET(
      makeGetRequest("/api/locations/match-circles", {
        latitude: "39.9042",
        longitude: "116.4074",
      })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid query parameters")
    expect(matchCirclesMock).not.toHaveBeenCalled()
  })

  it("returns 400 when page is 0 (invalid pagination)", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await matchCirclesGET(
      makeGetRequest("/api/locations/match-circles", {
        latitude: "39.9042",
        longitude: "116.4074",
        tagIds: TAG_ID,
        page: "0",
      })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid pagination parameters")
    expect(matchCirclesMock).not.toHaveBeenCalled()
  })
})
