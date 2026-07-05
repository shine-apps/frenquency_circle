import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * POST /api/circles/:id/contact 集成测试。
 *
 * 覆盖:
 * - 未登录返回 401
 * - contactType 非法返回 400
 * - 圈子不存在返回 404
 * - 圈子非 active(offline/deleted)返回 404
 * - 成功返回 contactPhone / wechat(均可为 null)
 * - 非法 json 返回 400
 * - 成功时插入 contact_logs 记录
 *
 * mock 层级:
 * - @/lib/db:select().from().where() + insert().values()
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值
 * - @/lib/logger:避免输出噪音
 */

const {
  mockDb,
  chainSelect,
  selectWhereMock,
  insertValuesMock,
  readUserFromTokenMock,
} = vi.hoisted(() => {
  // select().from().where() 链(where 可被 await)
  const selectWhereMock = vi.fn(async () => [] as Record<string, unknown>[])
  const chainSelect = {
    from: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    where: selectWhereMock,
  }

  // insert().values() 链(values 可被 await)
  const insertValuesMock = vi.fn(async () => undefined)
  const chainInsert = {
    values: insertValuesMock,
  }

  const mockDb = {
    select: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    insert: vi.fn(function (this: unknown) {
      return chainInsert
    }),
  }

  return {
    mockDb,
    chainSelect,
    chainInsert,
    selectWhereMock,
    insertValuesMock,
    readUserFromTokenMock: vi.fn(),
  }
}) as {
  mockDb: {
    select: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
  }
  chainSelect: {
    from: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
  }
  selectWhereMock: ReturnType<typeof vi.fn>
  insertValuesMock: ReturnType<typeof vi.fn>
  readUserFromTokenMock: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/db", () => ({ db: mockDb }))

vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
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

import { POST } from "@/app/api/circles/[id]/contact/route"
import type { IResponse } from "@/types/api"

const FAKE_USER = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "user@example.com",
  name: "User",
  role: "USER" as const,
}

type RouteContext = { params: Promise<{ id: string }> }
function makeContext(id: string): RouteContext {
  return { params: Promise.resolve({ id }) }
}

function makeJsonRequest(body: unknown, circleId: string): Request {
  return new Request(`http://localhost/api/circles/${circleId}/contact`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function makeCircleContactRow(overrides: {
  id?: string
  contactPhone?: string | null
  wechat?: string | null
  status?: string
}) {
  return {
    id: overrides.id ?? "circle-1",
    contactPhone:
      overrides.contactPhone === undefined ? "13800138000" : overrides.contactPhone,
    wechat: overrides.wechat === undefined ? "taichi2026" : overrides.wechat,
    status: overrides.status ?? "active",
  }
}

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb.insert.mockClear()
  chainSelect.from.mockClear()
  selectWhereMock.mockReset()
  insertValuesMock.mockReset()
  readUserFromTokenMock.mockReset()
})

describe("POST /api/circles/:id/contact", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await POST(
      makeJsonRequest({ contactType: "phone" }, "circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(401)
    expect(body.message).toBe("未登录或登录已过期")
    expect(mockDb.select).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when contactType is invalid", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await POST(
      makeJsonRequest({ contactType: "email" }, "circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    expect(mockDb.select).not.toHaveBeenCalled()
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when contactType is missing", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await POST(
      makeJsonRequest({}, "circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("returns 400 on malformed json", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await POST(
      makeJsonRequest("not-json", "circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("returns 404 when circle does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    selectWhereMock.mockResolvedValue([]) // circle 不存在

    const res = await POST(
      makeJsonRequest({ contactType: "phone" }, "nonexistent"),
      makeContext("nonexistent")
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(404)
    expect(body.message).toBe("圈子不存在或已下线")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 404 when circle status is offline", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    selectWhereMock.mockResolvedValue([
      makeCircleContactRow({ status: "offline" }),
    ])

    const res = await POST(
      makeJsonRequest({ contactType: "phone" }, "circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(404)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 404 when circle status is deleted", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    selectWhereMock.mockResolvedValue([
      makeCircleContactRow({ status: "deleted" }),
    ])

    const res = await POST(
      makeJsonRequest({ contactType: "wechat" }, "circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(404)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns contactPhone and wechat on success (contactType=phone)", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    selectWhereMock.mockResolvedValue([
      makeCircleContactRow({
        contactPhone: "13900139000",
        wechat: "master2026",
      }),
    ])

    const res = await POST(
      makeJsonRequest({ contactType: "phone" }, "circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{
      contactPhone: string | null
      wechat: string | null
    }>
    expect(body.code).toBe(200)
    expect(body.data.contactPhone).toBe("13900139000")
    expect(body.data.wechat).toBe("master2026")
    // 验证 contact_logs 已插入
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(insertValuesMock).toHaveBeenCalledTimes(1)
    const insertArg = insertValuesMock.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(insertArg.circleId).toBe("circle-1")
    expect(insertArg.userId).toBe(FAKE_USER.id)
    expect(insertArg.contactType).toBe("phone")
  })

  it("returns contactPhone and wechat on success (contactType=wechat)", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    selectWhereMock.mockResolvedValue([
      makeCircleContactRow({
        contactPhone: "13900139000",
        wechat: "master2026",
      }),
    ])

    const res = await POST(
      makeJsonRequest({ contactType: "wechat" }, "circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{
      contactPhone: string | null
      wechat: string | null
    }>
    expect(body.code).toBe(200)
    expect(body.data.wechat).toBe("master2026")
    expect(insertValuesMock).toHaveBeenCalledTimes(1)
    expect(insertValuesMock.mock.calls[0]?.[0].contactType).toBe("wechat")
  })

  it("returns null for contactPhone when circle has no phone", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    selectWhereMock.mockResolvedValue([
      makeCircleContactRow({
        contactPhone: null,
        wechat: "only-wechat",
      }),
    ])

    const res = await POST(
      makeJsonRequest({ contactType: "phone" }, "circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{
      contactPhone: string | null
      wechat: string | null
    }>
    expect(body.data.contactPhone).toBeNull()
    expect(body.data.wechat).toBe("only-wechat")
  })

  it("returns null for wechat when circle has no wechat", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    selectWhereMock.mockResolvedValue([
      makeCircleContactRow({
        contactPhone: "13800138000",
        wechat: null,
      }),
    ])

    const res = await POST(
      makeJsonRequest({ contactType: "phone" }, "circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{
      contactPhone: string | null
      wechat: string | null
    }>
    expect(body.data.contactPhone).toBe("13800138000")
    expect(body.data.wechat).toBeNull()
  })
})
