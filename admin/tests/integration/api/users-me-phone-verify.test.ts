import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * POST /api/users/me/phone/verify 集成测试。
 *
 * 覆盖:
 * - 未登录返回 401
 * - 非法 json / 缺 code / 手机号格式不正确 返回 400
 * - 新手机号与当前相同返回 400
 * - 新手机号已被其他用户绑定返回 409
 * - 验证码不存在 / 过期 / 不匹配 返回 400(对应中文文案)
 * - 绑定成功:更新 users.phone、同步 accounts(旧手机号 account 更新为新手机号)、
 *   返回 UserProfileDTO 含 tags
 * - 绑定成功(无旧手机号):linkAccount 新建 phone 绑定
 * - update 影响 0 行返回 404
 *
 * mock 层级:
 * - @/lib/db:query.users/query.accounts.findFirst + update(users).set().where().returning()
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值
 * - @/lib/auth/account-service:控制 linkAccount(避免写 accounts 表)
 * - @/lib/sms/phone-code-service:控制 verifyCode 返回值
 * - @/lib/user-tags:控制 fetchUserTags 返回值
 * - @/lib/logger:避免输出噪音
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

type AccountRow = {
  id: string
  userId: string
  provider: string
  providerAccountId: string
  type: string
  createdAt: Date
  updatedAt: Date
}

const {
  mockDb,
  chainUpdate,
  returningMock,
  readUserFromTokenMock,
  fetchUserTagsMock,
  verifyCodeMock,
  linkAccountMock,
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
    query: {
      users: { findFirst: vi.fn() },
      accounts: { findFirst: vi.fn() },
    },
  }

  return {
    mockDb,
    chainUpdate,
    returningMock,
    readUserFromTokenMock: vi.fn(),
    fetchUserTagsMock: vi.fn(),
    verifyCodeMock: vi.fn(),
    linkAccountMock: vi.fn(),
  }
}) as {
  mockDb: {
    update: ReturnType<typeof vi.fn>
    query: {
      users: { findFirst: ReturnType<typeof vi.fn> }
      accounts: { findFirst: ReturnType<typeof vi.fn> }
    }
  }
  chainUpdate: {
    set: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
  }
  returningMock: ReturnType<typeof vi.fn>
  readUserFromTokenMock: ReturnType<typeof vi.fn>
  fetchUserTagsMock: ReturnType<typeof vi.fn>
  verifyCodeMock: ReturnType<typeof vi.fn>
  linkAccountMock: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/db", () => ({ db: mockDb }))

vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
}))

vi.mock("@/lib/auth/account-service", () => ({
  linkAccount: linkAccountMock,
}))

vi.mock("@/lib/sms/phone-code-service", () => ({
  verifyCode: verifyCodeMock,
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

import { POST } from "@/app/api/users/me/phone/verify/route"
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

function makeAccountRow(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    id: overrides.id ?? "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    userId: overrides.userId ?? FAKE_USER.id,
    provider: overrides.provider ?? "phone",
    providerAccountId: overrides.providerAccountId ?? "13800138000",
    type: overrides.type ?? "credentials",
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-07-04T00:00:00Z"),
  }
}

function makeJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/users/me/phone/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

/**
 * 设置 users.findFirst 的两次调用:
 * 1. 查询当前用户(id 匹配)→ 返回传入行
 * 2. 手机号归属检查(phone 匹配其他用户)→ 默认无占用
 */
function mockCurrentUser(row: UserRow = makeUserRow()) {
  mockDb.query.users.findFirst
    .mockResolvedValueOnce(row)
    .mockResolvedValueOnce(undefined)
}

beforeEach(() => {
  mockDb.update.mockClear()
  chainUpdate.set.mockClear()
  chainUpdate.where.mockClear()
  returningMock.mockReset()
  readUserFromTokenMock.mockReset()
  fetchUserTagsMock.mockReset()
  verifyCodeMock.mockReset()
  linkAccountMock.mockReset()
  mockDb.query.users.findFirst.mockReset()
  mockDb.query.accounts.findFirst.mockReset()
  // 默认 fetchUserTags 返回空数组
  fetchUserTagsMock.mockResolvedValue([])
  // 默认验证码校验成功
  verifyCodeMock.mockResolvedValue({ ok: true })
})

describe("POST /api/users/me/phone/verify", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await POST(makeJsonRequest({ phone: "13900139000", code: "123456" }))
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(401)
    expect(body.message).toBe("未登录或登录已过期")
    // 未登录不应触达 DB
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 on malformed json", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await POST(makeJsonRequest("not-json"))
    expect(res.status).toBe(400)
    expect(mockDb.query.users.findFirst).not.toHaveBeenCalled()
  })

  it("returns 400 when code is missing", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await POST(makeJsonRequest({ phone: "13900139000" }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
  })

  it("returns 400 when code length is not 6", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    const res = await POST(makeJsonRequest({ phone: "13900139000", code: "12345" }))
    expect(res.status).toBe(400)
  })

  it("returns 400 when phone format is invalid", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    // 先让 query.users 返回当前用户(格式校验在唯一性之前)
    mockDb.query.users.findFirst.mockResolvedValue(makeUserRow())
    const res = await POST(makeJsonRequest({ phone: "12345", code: "123456" }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("手机号格式不正确")
    expect(verifyCodeMock).not.toHaveBeenCalled()
  })

  it("returns 400 when new phone equals current phone", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    mockDb.query.users.findFirst.mockResolvedValue(makeUserRow({ phone: "13900139000" }))
    const res = await POST(makeJsonRequest({ phone: "13900139000", code: "123456" }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("新手机号与当前手机号相同")
  })

  it("returns 409 when phone is already bound by another user", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    mockCurrentUser()
    mockDb.query.accounts.findFirst.mockResolvedValue(
      makeAccountRow({ userId: "22222222-2222-2222-2222-222222222222" })
    )
    const res = await POST(makeJsonRequest({ phone: "13900139000", code: "123456" }))
    expect(res.status).toBe(409)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(409)
    expect(body.message).toBe("该手机号已被其他用户绑定")
    expect(verifyCodeMock).not.toHaveBeenCalled()
  })

  it("returns 409 when phone is already in users.phone of another user", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    mockDb.query.users.findFirst
      .mockResolvedValueOnce(makeUserRow())
      .mockResolvedValueOnce(makeUserRow({ id: "other-id", phone: "13900139000" }))
    const res = await POST(makeJsonRequest({ phone: "13900139000", code: "123456" }))
    expect(res.status).toBe(409)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(409)
    expect(body.message).toBe("该手机号已被其他用户绑定")
    expect(verifyCodeMock).not.toHaveBeenCalled()
  })

  it("returns 400 when verification code is not found", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    mockCurrentUser()
    mockDb.query.accounts.findFirst.mockResolvedValue(undefined)
    verifyCodeMock.mockResolvedValue({ ok: false, reason: "not_found" })
    const res = await POST(makeJsonRequest({ phone: "13900139000", code: "123456" }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("验证码不存在或已失效")
  })

  it("returns 400 when verification code is expired", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    mockCurrentUser()
    mockDb.query.accounts.findFirst.mockResolvedValue(undefined)
    verifyCodeMock.mockResolvedValue({ ok: false, reason: "expired" })
    const res = await POST(makeJsonRequest({ phone: "13900139000", code: "123456" }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("验证码已过期")
  })

  it("returns 400 when verification code mismatches", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    mockCurrentUser()
    mockDb.query.accounts.findFirst.mockResolvedValue(undefined)
    verifyCodeMock.mockResolvedValue({ ok: false, reason: "mismatch" })
    const res = await POST(makeJsonRequest({ phone: "13900139000", code: "000000" }))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("验证码不正确")
  })

  it("binds a new phone successfully and returns UserProfileDTO with tags", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    // 当前用户无手机号(第二次调用 phone owner 检查返回 undefined)
    mockCurrentUser(makeUserRow({ phone: null }))
    // 新手机号未被占用
    mockDb.query.accounts.findFirst.mockResolvedValue(undefined)
    // update users.phone 返回更新后的行
    returningMock.mockResolvedValue([makeUserRow({ phone: "13900139000" })])
    // fetchUserTags 返回示例标签
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

    const res = await POST(
      makeJsonRequest({ phone: "13900139000", code: "123456" })
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<UserProfileDTO>
    expect(body.code).toBe(200)
    expect(body.data.phone).toBe("13900139000")
    expect(body.data.tags).toEqual(sampleTags)
    // 验证码应被消费校验
    expect(verifyCodeMock).toHaveBeenCalledWith("13900139000", "123456")
    // 当前用户无旧手机号 → 走 linkAccount 新建绑定
    expect(linkAccountMock).toHaveBeenCalledWith({
      userId: FAKE_USER.id,
      provider: "phone",
      providerAccountId: "13900139000",
      type: "credentials",
    })
  })

  it("updates old phone account when user had a previous phone", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    // 当前用户已有旧手机号(phone owner 检查返回 undefined)
    mockCurrentUser(makeUserRow({ phone: "13800138000" }))
    // 第一次查:新手机号未被占用
    mockDb.query.accounts.findFirst.mockResolvedValueOnce(undefined)
    // 第二次查(phoneAccount):当前用户无新手机号 account
    mockDb.query.accounts.findFirst.mockResolvedValueOnce(undefined)
    // 第三次查(stillMissing):更新旧手机号 account 后仍未找到 → 防御性 linkAccount
    mockDb.query.accounts.findFirst.mockResolvedValueOnce(undefined)
    returningMock.mockResolvedValue([makeUserRow({ phone: "13900139000" })])

    const res = await POST(
      makeJsonRequest({ phone: "13900139000", code: "123456" })
    )
    expect(res.status).toBe(200)
    // users.phone 更新 payload
    const firstSet = chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(firstSet.phone).toBe("13900139000")
    // accounts.providerAccountId 更新 payload(旧手机号 → 新手机号)
    const secondSet = chainUpdate.set.mock.calls[1]?.[0] as Record<string, unknown>
    expect(secondSet.providerAccountId).toBe("13900139000")
    // users.phone + accounts.providerAccountId 两次 update
    expect(mockDb.update).toHaveBeenCalledTimes(2)
    // 由于 three 次查询都返回 undefined,最终仍会走 linkAccount 兜底(幂等)
    expect(linkAccountMock).toHaveBeenCalled()
  })

  it("returns 404 when user not found", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    mockDb.query.users.findFirst.mockResolvedValue(undefined)
    const res = await POST(makeJsonRequest({ phone: "13900139000", code: "123456" }))
    expect(res.status).toBe(404)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(404)
    expect(body.message).toBe("User not found")
    expect(verifyCodeMock).not.toHaveBeenCalled()
  })

  it("returns 404 when update affects 0 rows (user deleted mid-request)", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_USER)
    mockCurrentUser(makeUserRow({ phone: null }))
    mockDb.query.accounts.findFirst.mockResolvedValue(undefined)
    returningMock.mockResolvedValue([]) // update 影响 0 行
    const res = await POST(makeJsonRequest({ phone: "13900139000", code: "123456" }))
    expect(res.status).toBe(404)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(404)
    expect(body.message).toBe("User not found")
  })
})
