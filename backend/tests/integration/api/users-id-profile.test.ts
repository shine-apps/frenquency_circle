import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * GET /api/users/:id/profile 集成测试。
 *
 * 覆盖:
 * - 未登录 401 / 用户不存在 404
 * - 200:返回公开资料,含 `role`(主页据此判断是否展示「TA 发布的圈子 / 活动」)
 * - 敏感字段(email / privacySettings)不出现在响应中
 *
 * mock 层级:
 * - @/lib/db:仅用到 query.users.findFirst
 * - @/lib/user-tags / @/lib/contacts:直接给固定返回值(其内部查询已有各自测试覆盖)
 */

const {
  findFirstMock,
  fetchUserTagsMock,
  resolveUserContactMock,
  requireSessionMock,
} = vi.hoisted(() => ({
  findFirstMock: vi.fn(),
  fetchUserTagsMock: vi.fn(),
  resolveUserContactMock: vi.fn(),
  requireSessionMock: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  db: { query: { users: { findFirst: findFirstMock } } },
}))

vi.mock("@/lib/user-tags", () => ({ fetchUserTags: fetchUserTagsMock }))

vi.mock("@/lib/contacts", () => ({ resolveUserContact: resolveUserContactMock }))

vi.mock("@/lib/auth-utils", () => ({ requireSession: requireSessionMock }))

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { CONTACT: "CONTACT" },
}))

import { GET } from "@/app/api/users/[id]/profile/route"
import type { IResponse, PublicUserProfileDTO } from "@/types/api"

const VIEWER_ID = "11111111-1111-1111-1111-111111111111"
const TARGET_ID = "22222222-2222-2222-2222-222222222222"

const VISIBILITY = {
  visible: false,
  wechat: null,
  phone: null,
  contactType: null,
  reason: "need_request" as const,
}
const RELATION = { followed: false, contactStatus: "none" as const, requestId: null }

function makeContext(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(id: string): Request {
  return new Request(`http://localhost/api/users/${id}/profile`, { method: "GET" })
}

/** users 表行(仅含 profile 路由会用到的字段) */
function targetUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TARGET_ID,
    name: "王老师",
    avatarUrl: null,
    role: "TEACHER",
    activityLevel: "high",
    practiceYears: 8,
    address: "北京市朝阳区",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

beforeEach(() => {
  findFirstMock.mockReset()
  fetchUserTagsMock.mockReset()
  resolveUserContactMock.mockReset()
  requireSessionMock.mockReset()
  fetchUserTagsMock.mockResolvedValue(["太极拳"])
  resolveUserContactMock.mockResolvedValue({
    visibility: VISIBILITY,
    relation: RELATION,
  })
})

describe("GET /api/users/:id/profile", () => {
  it("returns 401 when not logged in", async () => {
    requireSessionMock.mockResolvedValue({
      response: new Response(null, { status: 401 }),
    })
    const res = await GET(makeRequest(TARGET_ID), makeContext(TARGET_ID))
    expect(res.status).toBe(401)
    expect(findFirstMock).not.toHaveBeenCalled()
  })

  it("returns 404 when user does not exist", async () => {
    requireSessionMock.mockResolvedValue({ user: { id: VIEWER_ID, role: "USER" } })
    findFirstMock.mockResolvedValue(undefined)
    const res = await GET(makeRequest(TARGET_ID), makeContext(TARGET_ID))
    expect(res.status).toBe(404)
  })

  it("returns public profile with role and strips sensitive fields", async () => {
    requireSessionMock.mockResolvedValue({ user: { id: VIEWER_ID, role: "USER" } })
    findFirstMock.mockResolvedValue(targetUserRow())
    const res = await GET(makeRequest(TARGET_ID), makeContext(TARGET_ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<PublicUserProfileDTO>
    expect(body.data.id).toBe(TARGET_ID)
    // 主页依赖 role 判断是否展示「TA 发布的圈子 / 活动」
    expect(body.data.role).toBe("TEACHER")
    expect(body.data.tags).toEqual(["太极拳"])
    expect(body.data.contact).toEqual(VISIBILITY)
    expect(body.data.relation).toEqual(RELATION)
    const raw = JSON.stringify(body.data)
    expect(raw).not.toContain("email")
    expect(raw).not.toContain("privacySettings")
    expect(raw).not.toContain("passwordHash")
  })

  it("returns USER role for ordinary users", async () => {
    requireSessionMock.mockResolvedValue({ user: { id: VIEWER_ID, role: "USER" } })
    findFirstMock.mockResolvedValue(targetUserRow({ role: "USER" }))
    const res = await GET(makeRequest(TARGET_ID), makeContext(TARGET_ID))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<PublicUserProfileDTO>
    expect(body.data.role).toBe("USER")
  })
})
