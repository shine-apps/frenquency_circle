import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * POST/DELETE /api/users/:id/follow 集成测试。
 *
 * 覆盖:
 * - 未登录 401
 * - 关注自己 400
 * - 目标用户不存在 404
 * - 首次关注 200 + 通知 user_followed
 * - 重复关注幂等(不再通知)
 * - 取消关注 200
 *
 * mock 层级(参考 users-me-privacy.test.ts 模式):
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
  },
}))

import { DELETE, POST } from "@/app/api/users/[id]/follow/route"
import { GET as getFollowedUsers } from "@/app/api/users/followed/route"
import type { FollowedUserDTO, IResponse, Paginated } from "@/types/api"

const VIEWER_ID = "11111111-1111-1111-1111-111111111111"
const TARGET_ID = "22222222-2222-2222-2222-222222222222"

function makeRouteContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(method: string): Request {
  return new Request(`http://localhost/api/users/${TARGET_ID}/follow`, {
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

describe("POST /api/users/:id/follow", () => {
  it("returns 401 when not logged in", async () => {
    notLoggedIn()
    const res = await POST(makeRequest("POST"), makeRouteContext(TARGET_ID))
    expect(res.status).toBe(401)
  })

  it("returns 400 when following self", async () => {
    loggedIn()
    const res = await POST(makeRequest("POST"), makeRouteContext(VIEWER_ID))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("不能关注自己")
  })

  it("returns 404 when target user does not exist", async () => {
    loggedIn()
    dbState.results = [[]] // select 目标用户 → 空
    const res = await POST(makeRequest("POST"), makeRouteContext(TARGET_ID))
    expect(res.status).toBe(404)
  })

  it("follows successfully on first time and notifies target", async () => {
    loggedIn()
    dbState.results = [
      [{ id: TARGET_ID, name: "Target" }], // select 目标用户
      [{ id: "follow-row-1" }], // insert returning(首次)
      [{ name: "Viewer" }], // select 关注者昵称
    ]
    const res = await POST(makeRequest("POST"), makeRouteContext(TARGET_ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ followed: boolean }>
    expect(body.data.followed).toBe(true)
    expect(notifyUserMock).toHaveBeenCalledTimes(1)
    expect(notifyUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: TARGET_ID,
        actorId: VIEWER_ID,
        type: "user_followed",
        entityType: "user",
      })
    )
  })

  it("is idempotent on repeated follow (no duplicate notification)", async () => {
    loggedIn()
    dbState.results = [
      [{ id: TARGET_ID, name: "Target" }],
      [], // insert returning(唯一索引吸收重复)
    ]
    const res = await POST(makeRequest("POST"), makeRouteContext(TARGET_ID))
    expect(res.status).toBe(200)
    expect(notifyUserMock).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/users/:id/follow", () => {
  it("returns 404 when target user does not exist", async () => {
    loggedIn()
    dbState.results = [[]]
    const res = await DELETE(makeRequest("DELETE"), makeRouteContext(TARGET_ID))
    expect(res.status).toBe(404)
  })

  it("unfollows idempotently", async () => {
    loggedIn()
    dbState.results = [
      [{ id: TARGET_ID }],
      [], // delete 结果(幂等,无论是否删到)
    ]
    const res = await DELETE(makeRequest("DELETE"), makeRouteContext(TARGET_ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ followed: boolean }>
    expect(body.data.followed).toBe(false)
  })
})

describe("GET /api/users/followed", () => {
  it("returns 401 when not logged in", async () => {
    notLoggedIn()
    const res = await getFollowedUsers(makeListRequest("/api/users/followed"))
    expect(res.status).toBe(401)
  })

  it("returns 400 when userId is not a uuid", async () => {
    loggedIn()
    const res = await getFollowedUsers(
      makeListRequest("/api/users/followed?userId=not-a-uuid")
    )
    expect(res.status).toBe(400)
  })

  it("lists the given user's followed people when userId is provided", async () => {
    loggedIn()
    const FRIEND_ID = "33333333-3333-3333-3333-333333333333"
    dbState.results = [
      // select 关注记录(SQL 层分页)
      [
        {
          userId: TARGET_ID,
          targetUserId: FRIEND_ID,
          createdAt: new Date("2026-09-01T00:00:00Z"),
        },
      ],
      // select 总数
      [{ value: 1 }],
      // select 被关注用户
      [
        {
          id: FRIEND_ID,
          name: "趣友甲",
          avatarUrl: null,
          tags: ["书法"],
          activityLevel: "medium",
          practiceYears: 3,
          address: "北京市朝阳区",
        },
      ],
    ]

    const res = await getFollowedUsers(
      makeListRequest(`/api/users/followed?userId=${TARGET_ID}`)
    )
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<Paginated<FollowedUserDTO>>
    expect(body.data.total).toBe(1)
    expect(body.data.list[0]!.id).toBe(FRIEND_ID)
    expect(body.data.list[0]!.name).toBe("趣友甲")
    expect(body.data.list[0]!.followedAt).toBe("2026-09-01T00:00:00.000Z")
  })

  it("defaults to the logged-in user's own follows without userId", async () => {
    loggedIn()
    // 无关注记录:关注记录 + 计数两次查询(跳过批量补用户信息)
    dbState.results = [[], [{ value: 0 }]]

    const res = await getFollowedUsers(makeListRequest("/api/users/followed"))
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<Paginated<FollowedUserDTO>>
    expect(body.data.list).toEqual([])
    expect(body.data.total).toBe(0)
  })

  it("falls back to the logged-in user when userId is an empty string", async () => {
    loggedIn()
    // 空串视为未传:按当前登录用户查询,正常返回而非 500
    dbState.results = [[], [{ value: 0 }]]

    const res = await getFollowedUsers(makeListRequest("/api/users/followed?userId="))
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<Paginated<FollowedUserDTO>>
    expect(body.data.list).toEqual([])
    expect(body.data.total).toBe(0)
  })
})
