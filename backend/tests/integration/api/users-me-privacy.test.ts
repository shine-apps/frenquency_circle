import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * PUT /api/users/me/privacy 集成测试。
 *
 * 覆盖:
 * - 未登录返回 401
 * - 更新成功(写入 privacySettings JSONB,返回更新后的 PrivacySettings)
 * - locationPrecision 非法值返回 400
 * - 缺少必填字段返回 400
 * - 非法 json 返回 400
 *
 * mock 层级:
 * - @/lib/db:支持 update(users).set(...).where(...).returning() 链式调用
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值
 * - @/lib/logger:避免输出噪音
 *
 * 直接调用 route handler(参考 tests/integration/api/auth/me-patch.test.ts 模式)。
 */

type UserRow = {
  id: string
  privacySettings: unknown
  updatedAt: Date
}

const { mockDb, chainUpdate, readUserFromTokenMock, returningMock } =
  vi.hoisted(() => {
    // returning() 队列:每次调用取队首,缺省返回 []
    const returningMock = vi.fn()

    const chainUpdate: {
      set: ReturnType<typeof vi.fn>
      where: ReturnType<typeof vi.fn>
      returning: ReturnType<typeof vi.fn>
    } = {
      set: vi.fn(function (this: unknown) {
        return chainUpdate
      }),
      where: vi.fn(function (this: unknown) {
        return chainUpdate
      }),
      returning: returningMock,
    }

    const mockDb = {
      update: vi.fn(function (this: unknown) {
        return chainUpdate
      }),
    }

    return {
      mockDb,
      chainUpdate,
      returningMock,
      readUserFromTokenMock: vi.fn(),
    }
  }) as {
  mockDb: { update: ReturnType<typeof vi.fn> }
  chainUpdate: {
    set: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
  }
  returningMock: ReturnType<typeof vi.fn>
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
  },
}))

import { PUT } from "@/app/api/users/me/privacy/route"
import type { IResponse, PrivacySettings } from "@/types/api"

const FAKE_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "user@example.com",
  name: "User",
  role: "USER" as const,
}

const VALID_PRIVACY: PrivacySettings = {
  allowMatch: true,
  publicContact: false,
  locationPrecision: "community",
}

function makeJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/users/me/privacy", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function makeUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: overrides.id ?? FAKE_USER.id,
    privacySettings:
      overrides.privacySettings ?? {
        allowMatch: true,
        publicContact: false,
        locationPrecision: "community",
      },
    updatedAt: overrides.updatedAt ?? new Date("2026-07-04T00:00:00Z"),
  }
}

beforeEach(() => {
  mockDb.update.mockClear()
  chainUpdate.set.mockClear()
  chainUpdate.where.mockClear()
  returningMock.mockReset()
  readUserFromTokenMock.mockReset()
})

describe("PUT /api/users/me/privacy", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await PUT(makeJsonRequest(VALID_PRIVACY))
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(401)
    expect(body.message).toBe("未登录或登录已过期")
    // 未登录不应触达 DB
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("updates privacy settings successfully and returns 200", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const updatedRow = makeUserRow({
      privacySettings: VALID_PRIVACY,
    })
    returningMock.mockResolvedValue([updatedRow])

    const res = await PUT(makeJsonRequest(VALID_PRIVACY))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{
      privacySettings: PrivacySettings
    }>
    expect(body.code).toBe(200)
    expect(body.data.privacySettings).toEqual(VALID_PRIVACY)
    // 验证 update 链路被正确调用
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(chainUpdate.set).toHaveBeenCalledTimes(1)
    expect(chainUpdate.where).toHaveBeenCalledTimes(1)
    expect(returningMock).toHaveBeenCalledTimes(1)
    // set() 收到的 payload 应包含 privacySettings 与 updatedAt
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.privacySettings).toEqual(VALID_PRIVACY)
    expect(setArg.updatedAt).toBeInstanceOf(Date)
  })

  it("returns 400 when locationPrecision is invalid", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PUT(
      makeJsonRequest({
        allowMatch: true,
        publicContact: true,
        locationPrecision: "invalid",
      })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    // 校验失败不应触达 DB
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 when allowMatch is missing", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PUT(
      makeJsonRequest({
        publicContact: true,
        locationPrecision: "exact",
      })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 when publicContact is not a boolean", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PUT(
      makeJsonRequest({
        allowMatch: true,
        publicContact: "yes",
        locationPrecision: "exact",
      })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 on malformed json body", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PUT(makeJsonRequest("not-json"))
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 404 when update affects 0 rows (user deleted)", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    returningMock.mockResolvedValue([]) // 用户已被删除
    const res = await PUT(makeJsonRequest(VALID_PRIVACY))
    expect(res.status).toBe(404)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(404)
    expect(body.message).toBe("User not found")
  })

  it("accepts locationPrecision='region' as valid", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const privacy: PrivacySettings = {
      allowMatch: false,
      publicContact: false,
      locationPrecision: "region",
    }
    const updatedRow = makeUserRow({ privacySettings: privacy })
    returningMock.mockResolvedValue([updatedRow])

    const res = await PUT(makeJsonRequest(privacy))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{
      privacySettings: PrivacySettings
    }>
    expect(body.code).toBe(200)
    expect(body.data.privacySettings.locationPrecision).toBe("region")
    expect(body.data.privacySettings.allowMatch).toBe(false)
  })
})
