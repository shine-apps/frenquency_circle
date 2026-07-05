import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * PATCH /api/users/me/profile 集成测试。
 *
 * 覆盖:
 * - 未登录返回 401
 * - 升级 role=TEACHER 成功(返回 UserProfileDTO 含 tags)
 * - role='ADMIN' 被拒(zod enum 不允许,返回 400)
 * - phone 空串归一为 null(set payload 检查)
 * - practiceYears / activityLevel 更新成功
 * - 缺少字段(refine)/ 非法 json / 非法 phone / 越界 practiceYears 均返回 400
 * - update 影响 0 行返回 404
 *
 * mock 层级:
 * - @/lib/db:支持 update(users).set(...).where(...).returning() 链式调用
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值
 * - @/lib/user-tags:控制 fetchUserTags 返回值(避免查 user_tags/tags 表)
 * - @/lib/logger:避免输出噪音
 *
 * 直接调用 route handler(参考 tests/integration/api/auth/me-patch.test.ts 模式)。
 */

type UserRow = {
  id: string
  email: string
  name: string
  passwordHash: string
  role: string
  avatarUrl: string | null
  phone: string | null
  wechatOpenid: string | null
  latitude: number | null
  longitude: number | null
  address: string | null
  privacySettings: unknown
  practiceYears: number | null
  activityLevel: string
  lastActiveAt: Date | null
  createdAt: Date
  updatedAt: Date
}

const {
  mockDb,
  chainUpdate,
  returningMock,
  readUserFromTokenMock,
  fetchUserTagsMock,
} = vi.hoisted(() => {
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
    fetchUserTagsMock: vi.fn(),
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
  fetchUserTagsMock: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/db", () => ({ db: mockDb }))

vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
}))

vi.mock("@/lib/user-tags", () => ({
  fetchUserTags: fetchUserTagsMock,
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

import { PATCH } from "@/app/api/users/me/profile/route"
import type { IResponse, TagDTO, UserProfileDTO } from "@/types/api"

const FAKE_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "user@example.com",
  name: "User",
  role: "USER" as const,
}

function makeUserRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: overrides.id ?? FAKE_USER.id,
    email: overrides.email ?? "user@example.com",
    name: overrides.name ?? "User",
    passwordHash: overrides.passwordHash ?? "hashed",
    role: overrides.role ?? "USER",
    avatarUrl: overrides.avatarUrl ?? null,
    phone: overrides.phone ?? null,
    wechatOpenid: overrides.wechatOpenid ?? null,
    latitude: overrides.latitude ?? null,
    longitude: overrides.longitude ?? null,
    address: overrides.address ?? null,
    privacySettings:
      overrides.privacySettings ?? {
        allowMatch: true,
        publicContact: true,
        locationPrecision: "exact",
      },
    practiceYears: overrides.practiceYears ?? null,
    activityLevel: overrides.activityLevel ?? "medium",
    lastActiveAt: overrides.lastActiveAt ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-07-04T00:00:00Z"),
  }
}

function makeJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/users/me/profile", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

beforeEach(() => {
  mockDb.update.mockClear()
  chainUpdate.set.mockClear()
  chainUpdate.where.mockClear()
  returningMock.mockReset()
  readUserFromTokenMock.mockReset()
  fetchUserTagsMock.mockReset()
  // 默认 fetchUserTags 返回空数组
  fetchUserTagsMock.mockResolvedValue([])
})

describe("PATCH /api/users/me/profile", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await PATCH(makeJsonRequest({ role: "TEACHER" }))
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(401)
    expect(body.message).toBe("未登录或登录已过期")
    // 未登录不应触达 DB
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("upgrades role to TEACHER successfully and returns UserProfileDTO with tags", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const updatedRow = makeUserRow({ role: "TEACHER" })
    returningMock.mockResolvedValue([updatedRow])

    const sampleTags: TagDTO[] = [
      {
        id: "00000000-0000-0000-0000-000000000001",
        name: "陈氏太极拳",
        category: "武术养生",
        subCategory: "太极拳",
        pinyin: "chenshitaijiquan",
        pinyinInitials: "cstjq",
        status: "approved",
        createdBy: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ]
    fetchUserTagsMock.mockResolvedValue(sampleTags)

    const res = await PATCH(makeJsonRequest({ role: "TEACHER" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<UserProfileDTO>
    expect(body.code).toBe(200)
    expect(body.data.role).toBe("TEACHER")
    expect(body.data.tags).toEqual(sampleTags)
    expect(body.data.tags).toHaveLength(1)
    expect(body.data.tags[0]!.name).toBe("陈氏太极拳")
    // 验证 update 链路被正确调用
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(chainUpdate.set).toHaveBeenCalledTimes(1)
    expect(chainUpdate.where).toHaveBeenCalledTimes(1)
    expect(returningMock).toHaveBeenCalledTimes(1)
    // fetchUserTags 应以 userId 调用
    expect(fetchUserTagsMock).toHaveBeenCalledWith(FAKE_USER.id)
  })

  it("rejects role='ADMIN' with 400 (zod enum 不允许 ADMIN)", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PATCH(makeJsonRequest({ role: "ADMIN" }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    // 防止越权提权:不应触达 DB
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("normalizes phone empty string to null in DB set payload", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const updatedRow = makeUserRow({ phone: null })
    returningMock.mockResolvedValue([updatedRow])

    const res = await PATCH(makeJsonRequest({ phone: "" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<UserProfileDTO>
    expect(body.code).toBe(200)
    expect(body.data.phone).toBeNull()
    // 验证 set() 收到的 payload 中 phone 是 null
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.phone).toBeNull()
  })

  it("accepts a valid phone number and persists it", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const updatedRow = makeUserRow({ phone: "13800138000" })
    returningMock.mockResolvedValue([updatedRow])

    const res = await PATCH(makeJsonRequest({ phone: "13800138000" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<UserProfileDTO>
    expect(body.code).toBe(200)
    expect(body.data.phone).toBe("13800138000")
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.phone).toBe("13800138000")
  })

  it("updates practiceYears and activityLevel successfully", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const updatedRow = makeUserRow({
      practiceYears: 5,
      activityLevel: "high",
    })
    returningMock.mockResolvedValue([updatedRow])

    const res = await PATCH(
      makeJsonRequest({ practiceYears: 5, activityLevel: "high" })
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<UserProfileDTO>
    expect(body.code).toBe(200)
    expect(body.data.practiceYears).toBe(5)
    expect(body.data.activityLevel).toBe("high")
  })

  it("returns 400 when body is empty object (refine: 至少提供一个字段)", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PATCH(makeJsonRequest({}))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 on malformed json", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PATCH(makeJsonRequest("not-json"))
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 on invalid phone format", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PATCH(makeJsonRequest({ phone: "12345" }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 when practiceYears is out of range (negative)", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PATCH(makeJsonRequest({ practiceYears: -1 }))
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 when practiceYears is out of range (>100)", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PATCH(makeJsonRequest({ practiceYears: 101 }))
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 on invalid activityLevel", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await PATCH(makeJsonRequest({ activityLevel: "extreme" }))
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 404 when update affects 0 rows (user deleted)", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    returningMock.mockResolvedValue([]) // 用户已被删除
    const res = await PATCH(makeJsonRequest({ role: "TEACHER" }))
    expect(res.status).toBe(404)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(404)
    expect(body.message).toBe("User not found")
    // update 失败时不应再调 fetchUserTags
    expect(fetchUserTagsMock).not.toHaveBeenCalled()
  })

  it("returns location null when latitude/longitude are both null", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const updatedRow = makeUserRow({ latitude: null, longitude: null })
    returningMock.mockResolvedValue([updatedRow])

    const res = await PATCH(makeJsonRequest({ practiceYears: 3 }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<UserProfileDTO>
    expect(body.data.location).toBeNull()
  })

  it("returns location point when latitude/longitude are set", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const updatedRow = makeUserRow({
      latitude: 30.5,
      longitude: 114.3,
      address: "武汉市",
    })
    returningMock.mockResolvedValue([updatedRow])

    const res = await PATCH(makeJsonRequest({ practiceYears: 3 }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<UserProfileDTO>
    expect(body.data.location).toEqual({ latitude: 30.5, longitude: 114.3 })
    expect(body.data.address).toBe("武汉市")
  })
})
