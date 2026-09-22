import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * /api/contact-requests 系列集成测试。
 *
 * 覆盖:
 * - POST 发起:401 / 400 向自己 / 404 目标不存在 / 409 重复 pending /
 *   429 每日配额 / 200 成功 + 通知
 * - GET 列表:200 返回 ContactRequestDTO 分页
 * - accept:403 越权(非接收方) / 200 接受 + 通知发起方
 * - DELETE 撤回:200(发起方,pending) / 403 非发起方
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

  return { dbState, dbMock, requireSessionMock: vi.fn(), notifyUserMock: vi.fn() }
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
  LOG_PREFIX: { CONTACT: "CONTACT" },
}))

import { POST as createRequest, GET as listRequests } from "@/app/api/contact-requests/route"
import { POST as acceptRequest } from "@/app/api/contact-requests/[id]/accept/route"
import { DELETE as cancelRequest } from "@/app/api/contact-requests/[id]/route"
import type { IResponse } from "@/types/api"

// 注意:zod uuid() 校验 RFC 9562 variant 位(第四组首位须为 8/9/a/b),
// 测试常量须使用合法变体,否则请求体会被 400 拦截
const FROM_ID = "11111111-1111-4111-8111-111111111111"
const TO_ID = "22222222-2222-4222-8222-222222222222"
const REQUEST_ID = "33333333-3333-4333-8333-333333333333"

function loggedIn(userId = FROM_ID) {
  requireSessionMock.mockResolvedValue({
    user: {
      id: userId,
      email: `${userId.slice(0, 4)}@example.com`,
      name: "User",
      role: "USER",
    },
  })
}

function notLoggedIn() {
  requireSessionMock.mockResolvedValue({
    response: new Response(null, { status: 401 }),
  })
}

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost/api/contact-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function makeListRequest(query = ""): Request {
  return new Request(`http://localhost/api/contact-requests${query}`, {
    method: "GET",
  })
}

function makeIdRouteRequest(id: string, method: string): Request {
  return new Request(`http://localhost/api/contact-requests/${id}`, { method })
}

function makeIdContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

function userBrief(id: string) {
  return { id, name: `User-${id.slice(0, 4)}`, avatarUrl: null }
}

function makeRequestRow(
  overrides: Partial<{
    id: string
    fromUserId: string
    toUserId: string
    message: string | null
    status: "pending" | "accepted" | "rejected"
  }> = {}
) {
  return {
    id: overrides.id ?? REQUEST_ID,
    fromUserId: overrides.fromUserId ?? FROM_ID,
    toUserId: overrides.toUserId ?? TO_ID,
    message: overrides.message ?? "你好,一起练习吧",
    status: overrides.status ?? ("pending" as const),
    respondedAt: null,
    createdAt: new Date("2026-09-01T00:00:00Z"),
    updatedAt: new Date("2026-09-01T00:00:00Z"),
  }
}

beforeEach(() => {
  dbState.results = []
  requireSessionMock.mockReset()
  notifyUserMock.mockReset()
})

describe("POST /api/contact-requests", () => {
  it("returns 401 when not logged in", async () => {
    notLoggedIn()
    const res = await createRequest(makePostRequest({ toUserId: TO_ID }))
    expect(res.status).toBe(401)
  })

  it("returns 400 when sending to self", async () => {
    loggedIn()
    const res = await createRequest(makePostRequest({ toUserId: FROM_ID }))
    expect(res.status).toBe(400)
  })

  it("returns 404 when target user does not exist", async () => {
    loggedIn()
    dbState.results = [[]]
    const res = await createRequest(makePostRequest({ toUserId: TO_ID }))
    expect(res.status).toBe(404)
  })

  it("returns 409 when a pending request already exists between the pair", async () => {
    loggedIn()
    dbState.results = [
      [{ id: TO_ID }],
      [{ id: "existing", fromUserId: TO_ID, toUserId: FROM_ID }], // pending 已存在
    ]
    const res = await createRequest(makePostRequest({ toUserId: TO_ID }))
    expect(res.status).toBe(409)
  })

  it("returns 429 when daily quota is exhausted", async () => {
    loggedIn()
    dbState.results = [
      [{ id: TO_ID }],
      [], // 无 pending
      Array.from({ length: 10 }, (_, i) => ({ id: `q-${i}` })), // 当日已发起 10 次
    ]
    const res = await createRequest(makePostRequest({ toUserId: TO_ID }))
    expect(res.status).toBe(429)
  })

  it("creates request, notifies recipient and returns DTO", async () => {
    loggedIn()
    dbState.results = [
      [{ id: TO_ID }],
      [],
      [],
      [{ id: REQUEST_ID }], // insert returning
      [makeRequestRow({ message: "你好" })], // loadContactRequestDetail: findContactRequest
      [userBrief(FROM_ID), userBrief(TO_ID)], // loadUserBriefs
    ]
    const res = await createRequest(
      makePostRequest({ toUserId: TO_ID, message: "你好" })
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{
      id: string
      status: string
      message: string | null
    }>
    expect(body.data.id).toBe(REQUEST_ID)
    expect(body.data.status).toBe("pending")
    expect(body.data.message).toBe("你好")
    expect(notifyUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: TO_ID,
        actorId: FROM_ID,
        type: "contact_request",
        entityType: "user",
      })
    )
  })

  it("returns 400 when message exceeds 100 chars", async () => {
    loggedIn()
    const res = await createRequest(
      makePostRequest({ toUserId: TO_ID, message: "a".repeat(101) })
    )
    expect(res.status).toBe(400)
  })
})

describe("GET /api/contact-requests", () => {
  it("returns 401 when not logged in", async () => {
    notLoggedIn()
    const res = await listRequests(makeListRequest())
    expect(res.status).toBe(401)
  })

  it("returns paginated list with user briefs", async () => {
    loggedIn()
    dbState.results = [
      [makeRequestRow()], // 请求行(内存分页实现:一次取全量匹配行)
      [userBrief(FROM_ID), userBrief(TO_ID)], // loadUserBriefs
    ]
    const res = await listRequests(makeListRequest("?direction=incoming&status=all"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{
      total: number
      list: Array<{ id: string; fromUser: { id: string } }>
    }>
    expect(body.data.total).toBe(1)
    expect(body.data.list[0].fromUser.id).toBe(FROM_ID)
  })
})

describe("POST /api/contact-requests/:id/accept", () => {
  it("returns 403 when caller is not the recipient", async () => {
    loggedIn(FROM_ID) // 发起方本人,非接收方
    dbState.results = [[makeRequestRow()]]
    const res = await acceptRequest(
      makeIdRouteRequest(REQUEST_ID, "POST"),
      makeIdContext(REQUEST_ID)
    )
    expect(res.status).toBe(403)
  })

  it("accepts pending request and notifies the sender", async () => {
    loggedIn(TO_ID)
    dbState.results = [
      [makeRequestRow()], // findContactRequest
      [{ id: REQUEST_ID }], // update returning
      [makeRequestRow({ status: "accepted" })], // loadContactRequestDetail
      [userBrief(FROM_ID), userBrief(TO_ID)],
    ]
    const res = await acceptRequest(
      makeIdRouteRequest(REQUEST_ID, "POST"),
      makeIdContext(REQUEST_ID)
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ status: string }>
    expect(body.data.status).toBe("accepted")
    expect(notifyUserMock).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: FROM_ID,
        type: "contact_accepted",
      })
    )
  })
})

describe("DELETE /api/contact-requests/:id", () => {
  it("returns 403 when caller is not the sender", async () => {
    loggedIn(TO_ID) // 接收方,非发起方
    dbState.results = [[makeRequestRow()]]
    const res = await cancelRequest(
      makeIdRouteRequest(REQUEST_ID, "DELETE"),
      makeIdContext(REQUEST_ID)
    )
    expect(res.status).toBe(403)
  })

  it("cancels own pending request", async () => {
    loggedIn(FROM_ID)
    dbState.results = [
      [makeRequestRow()],
      [{ id: REQUEST_ID }], // delete returning
    ]
    const res = await cancelRequest(
      makeIdRouteRequest(REQUEST_ID, "DELETE"),
      makeIdContext(REQUEST_ID)
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ deleted: boolean }>
    expect(body.data.deleted).toBe(true)
  })
})
