import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * POST /api/locations/publish 集成测试。
 *
 * 覆盖:
 * - 未登录返回 401
 * - 发布成功(写入 locations + 更新 users,返回 locationId/publishedAt)
 * - 频率限制(5 分钟内重复)返回 429
 * - latitude 越界返回 400
 * - tagIds 为空数组返回 400
 * - rangeKm 非法值返回 400
 * - 缺少必填字段返回 400
 * - 非法 json 返回 400
 *
 * mock 层级:
 * - @/lib/db:支持 insert().values().returning() 与 update().set().where() 链式调用
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值
 * - @/lib/rate-limit/publish:控制 checkAndConsumePublish 返回值
 * - @/lib/logger:避免输出噪音
 *
 * 直接调用 route handler(参考 tests/integration/api/users-me-privacy.test.ts 模式)。
 */

const {
  mockDb,
  chainInsert,
  chainUpdate,
  returningMock,
  updateWhereMock,
  readUserFromTokenMock,
  checkAndConsumePublishMock,
} = vi.hoisted(() => {
  // insert().values(...).returning(...) 链
  const returningMock = vi.fn()
  const chainInsert = {
    values: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    returning: returningMock,
  }

  // update().set(...).where(...) 链(where 可被 await)
  const updateWhereMock = vi.fn(async () => undefined)
  const chainUpdate = {
    set: vi.fn(function (this: unknown) {
      return chainUpdate
    }),
    where: updateWhereMock,
  }

  const mockDb = {
    insert: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    update: vi.fn(function (this: unknown) {
      return chainUpdate
    }),
  }

  return {
    mockDb,
    chainInsert,
    chainUpdate,
    returningMock,
    updateWhereMock,
    readUserFromTokenMock: vi.fn(),
    checkAndConsumePublishMock: vi.fn(),
  }
}) as {
  mockDb: {
    insert: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  chainInsert: {
    values: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
  }
  chainUpdate: {
    set: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
  }
  returningMock: ReturnType<typeof vi.fn>
  updateWhereMock: ReturnType<typeof vi.fn>
  readUserFromTokenMock: ReturnType<typeof vi.fn>
  checkAndConsumePublishMock: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/db", () => ({ db: mockDb }))

vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
}))

vi.mock("@/lib/rate-limit/publish", () => ({
  publishRateLimiter: {
    checkAndConsumePublish: checkAndConsumePublishMock,
  },
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

import { POST } from "@/app/api/locations/publish/route"
import type { IResponse } from "@/types/api"

const FAKE_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "user@example.com",
  name: "User",
  role: "USER" as const,
}

const VALID_BODY = {
  latitude: 39.9042,
  longitude: 116.4074,
  address: "北京市朝阳区",
  tagIds: ["00000000-0000-4000-8000-000000000001"],
  rangeKm: 5 as const,
}

function makeJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/locations/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  mockDb.insert.mockClear()
  mockDb.update.mockClear()
  chainInsert.values.mockClear()
  returningMock.mockReset()
  chainUpdate.set.mockClear()
  updateWhereMock.mockClear()
  readUserFromTokenMock.mockReset()
  checkAndConsumePublishMock.mockReset()
  // 默认允许发布
  checkAndConsumePublishMock.mockReturnValue({ ok: true })
})

describe("POST /api/locations/publish", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await POST(makeJsonRequest(VALID_BODY))
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(401)
    expect(body.message).toBe("未登录或登录已过期")
    // 未登录不应触达 DB 或频率限制器
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
    expect(checkAndConsumePublishMock).not.toHaveBeenCalled()
  })

  it("publishes location successfully and returns 201 with locationId/publishedAt", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const locationId = "loc-uuid-1234"
    const publishedAt = new Date("2026-07-04T10:00:00Z")
    returningMock.mockResolvedValue([
      { id: locationId, publishedAt },
    ])

    const res = await POST(makeJsonRequest(VALID_BODY))
    expect(res.status).toBe(201)
    const body = (await res.json()) as IResponse<{
      locationId: string
      publishedAt: string
    }>
    expect(body.code).toBe(201)
    expect(body.data.locationId).toBe(locationId)
    expect(body.data.publishedAt).toBe(publishedAt.toISOString())
    // 频率限制器应被调用一次
    expect(checkAndConsumePublishMock).toHaveBeenCalledTimes(1)
    expect(checkAndConsumePublishMock).toHaveBeenCalledWith(FAKE_USER.id)
    // insert locations 应被调用
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    expect(chainInsert.values).toHaveBeenCalledTimes(1)
    expect(returningMock).toHaveBeenCalledTimes(1)
    // update users 应被调用(更新最新位置)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(chainUpdate.set).toHaveBeenCalledTimes(1)
    expect(updateWhereMock).toHaveBeenCalledTimes(1)
    // 验证 set() payload 包含位置字段与 lastActiveAt
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.latitude).toBe(VALID_BODY.latitude)
    expect(setArg.longitude).toBe(VALID_BODY.longitude)
    expect(setArg.address).toBe(VALID_BODY.address)
    expect(setArg.lastActiveAt).toBeInstanceOf(Date)
  })

  it("returns 429 when rate limited (5min cooldown)", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    checkAndConsumePublishMock.mockReturnValue({
      ok: false,
      retryAfterSeconds: 280,
    })

    const res = await POST(makeJsonRequest(VALID_BODY))
    expect(res.status).toBe(429)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(429)
    expect(body.message).toContain("发布过于频繁")
    expect(body.message).toContain("280")
    // 频率限制失败时不应触达 DB
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 when latitude is out of range", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await POST(
      makeJsonRequest({ ...VALID_BODY, latitude: 200 })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(checkAndConsumePublishMock).not.toHaveBeenCalled()
  })

  it("returns 400 when tagIds array is empty", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await POST(
      makeJsonRequest({ ...VALID_BODY, tagIds: [] })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when rangeKm is not one of 1/5/10/30", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await POST(
      makeJsonRequest({ ...VALID_BODY, rangeKm: 7 })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when address is missing", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const { address: _omit, ...rest } = VALID_BODY
    void _omit
    const res = await POST(makeJsonRequest(rest))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when tagId is not a valid uuid", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await POST(
      makeJsonRequest({ ...VALID_BODY, tagIds: ["not-a-uuid"] })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 on malformed json body", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await POST(makeJsonRequest("not-json"))
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
    expect(checkAndConsumePublishMock).not.toHaveBeenCalled()
  })

  it("accepts rangeKm=30 as valid", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    returningMock.mockResolvedValue([
      { id: "loc-30", publishedAt: new Date("2026-07-04T10:00:00Z") },
    ])
    const res = await POST(
      makeJsonRequest({ ...VALID_BODY, rangeKm: 30 })
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as IResponse<{
      locationId: string
      publishedAt: string
    }>
    expect(body.code).toBe(201)
    expect(body.data.locationId).toBe("loc-30")
  })
})
