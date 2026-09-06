import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * POST /api/users/:id/contact 集成测试。
 *
 * 覆盖:
 * - 未登录 401
 * - 目标用户不存在 404
 * - 双方未建立联系 → 403(need_request,公开设置也不解锁),且不留痕
 * - 双方已建立联系(accepted) → 200 返回微信号 + 写入 contactLogs
 * - 查看自己的主页 → 200 返回微信号,但不留痕
 * - 已建立联系且对方无微信号时兜底返回手机号(contactType 指示类型)
 */

const { dbState, dbMock, requireSessionMock } = vi.hoisted(() => {
  const dbState = { results: [] as unknown[], inserts: [] as unknown[] }

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
          if (prop === "values") {
            return (row: unknown) => {
              dbState.inserts.push(row)
              return proxy
            }
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

  return { dbState, dbMock, requireSessionMock: vi.fn() }
})

vi.mock("@/lib/db", () => ({ db: dbMock }))

vi.mock("@/lib/auth-utils", () => ({
  requireSession: requireSessionMock,
}))

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { CONTACT: "CONTACT" },
}))

import { POST } from "@/app/api/users/[id]/contact/route"
import type { IResponse } from "@/types/api"

const VIEWER_ID = "11111111-1111-1111-1111-111111111111"
const TARGET_ID = "22222222-2222-2222-2222-222222222222"

function makeRouteContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(): Request {
  return new Request(`http://localhost/api/users/${TARGET_ID}/contact`, {
    method: "POST",
  })
}

function loggedIn(viewerId = VIEWER_ID) {
  requireSessionMock.mockResolvedValue({
    user: { id: viewerId, email: "v@example.com", name: "Viewer", role: "USER" },
  })
}

/** 双方已建立联系的历史请求行(accepted 为唯一解锁途径) */
const ACCEPTED_ROW = {
  id: "req-1",
  fromUserId: TARGET_ID,
  toUserId: VIEWER_ID,
  status: "accepted",
}

/** 目标用户行(公开主页 + resolveUserContact 各查一次) */
function targetRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TARGET_ID,
    wechat: "target-wechat",
    privacySettings: {
      allowMatch: true,
      publicContact: true,
      locationPrecision: "exact",
    },
    ...overrides,
  }
}

beforeEach(() => {
  dbState.results = []
  dbState.inserts = []
  requireSessionMock.mockReset()
})

describe("POST /api/users/:id/contact", () => {
  it("returns 401 when not logged in", async () => {
    requireSessionMock.mockResolvedValue({
      response: new Response(null, { status: 401 }),
    })
    const res = await POST(makeRequest(), makeRouteContext(TARGET_ID))
    expect(res.status).toBe(401)
  })

  it("returns 404 when target user does not exist", async () => {
    loggedIn()
    dbState.results = [[]] // 目标存在性查询 → 空
    const res = await POST(makeRequest(), makeRouteContext(TARGET_ID))
    expect(res.status).toBe(404)
  })

  it("returns 403 and no log when contact not unlocked (public does not grant access)", async () => {
    loggedIn()
    dbState.results = [
      [{ id: TARGET_ID }], // 目标存在
      [targetRow()], // publicContact: true 也不解锁
      [], // 双方历史请求(无 accepted)
      [null], // follow 记录
    ]
    const res = await POST(makeRequest(), makeRouteContext(TARGET_ID))
    expect(res.status).toBe(403)
    expect(dbState.inserts).toHaveLength(0)
  })

  it("returns wechat and logs when contact accepted", async () => {
    loggedIn()
    dbState.results = [
      [{ id: TARGET_ID }], // 目标存在性
      [targetRow()], // resolveUserContact:目标行(显式 .then,构建时消耗)
      [null], // resolveUserContact:follow 记录(显式 .then,构建时消耗)
      [ACCEPTED_ROW], // resolveUserContact:双方历史请求(隐式 await,最后消耗)
    ]
    const res = await POST(makeRequest(), makeRouteContext(TARGET_ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ wechat: string | null }>
    expect(body.data.wechat).toBe("target-wechat")
    expect(dbState.inserts).toHaveLength(1)
    expect(dbState.inserts[0]).toMatchObject({
      userId: VIEWER_ID,
      targetUserId: TARGET_ID,
      contactType: "wechat",
    })
  })

  it("falls back to phone when contact accepted but target has no wechat", async () => {
    loggedIn()
    dbState.results = [
      [{ id: TARGET_ID }], // 目标存在性
      [targetRow({ wechat: null, phone: "13800138000" })],
      [null], // follow 记录
      [ACCEPTED_ROW], // 双方已建立联系(accepted → 解锁)
    ]
    const res = await POST(makeRequest(), makeRouteContext(TARGET_ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{
      wechat: string | null
      phone: string | null
      contactType: "wechat" | "phone" | null
    }>
    expect(body.data.wechat).toBeNull()
    expect(body.data.phone).toBe("13800138000")
    expect(body.data.contactType).toBe("phone")
    expect(dbState.inserts).toHaveLength(1)
    expect(dbState.inserts[0]).toMatchObject({
      userId: VIEWER_ID,
      targetUserId: TARGET_ID,
      contactType: "phone",
    })
  })

  it("returns own wechat without logging when viewing self", async () => {
    loggedIn(TARGET_ID)
    dbState.results = [
      [{ id: TARGET_ID }],
      [targetRow()],
      [],
      [null],
    ]
    const res = await POST(makeRequest(), makeRouteContext(TARGET_ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ wechat: string | null }>
    expect(body.data.wechat).toBe("target-wechat")
    expect(dbState.inserts).toHaveLength(0)
  })
})
