import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 守卫函数单测。
 *
 * `requireTeacher` 与 `requireAdmin` 同构:走 NextAuth cookie session,
 * 供 `/teacher/*` 学后台 API 使用。这里 mock `@/auth` 与 `@/lib/auth/session-token`,
 * 只验证 401 / 403 / 放行三分支。
 */

const { authMock, readUserFromTokenMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  readUserFromTokenMock: vi.fn(),
}))

vi.mock("@/auth", () => ({ auth: authMock }))
vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
}))

import { requireAdmin, requireTeacher, requireSession } from "@/lib/auth-utils"
import type { IResponse } from "@/types/api"

const TEACHER = {
  id: "11111111-1111-1111-1111-111111111111",
  role: "TEACHER",
  email: "t@example.com",
  name: "Teacher",
}

const ADMIN = {
  id: "33333333-3333-3333-3333-333333333333",
  role: "ADMIN",
  email: "a@example.com",
  name: "Admin",
}

const USER = {
  id: "22222222-2222-2222-2222-222222222222",
  role: "USER",
  email: "u@example.com",
  name: "User",
}

function sessionOf(user: unknown) {
  return user ? { user, expires: "2099-01-01" } : null
}

beforeEach(() => {
  authMock.mockReset()
  readUserFromTokenMock.mockReset()
})

describe("requireTeacher", () => {
  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue(null)
    const guard = await requireTeacher()
    expect(guard.ok).toBe(false)
    if (guard.ok) return
    expect(guard.response.status).toBe(401)
    const body = (await guard.response.json()) as IResponse<null>
    expect(body.message).toBe("Unauthorized")
  })

  it("returns 403 for a USER session", async () => {
    authMock.mockResolvedValue(sessionOf(USER))
    const guard = await requireTeacher()
    expect(guard.ok).toBe(false)
    if (guard.ok) return
    expect(guard.response.status).toBe(403)
    const body = (await guard.response.json()) as IResponse<null>
    expect(body.message).toContain("teacher")
  })

  it("allows a TEACHER session", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    const guard = await requireTeacher()
    expect(guard.ok).toBe(true)
    if (!guard.ok) return
    expect(guard.userId).toBe(TEACHER.id)
    expect(guard.role).toBe("TEACHER")
  })

  it("allows an ADMIN session (可代管)", async () => {
    authMock.mockResolvedValue(sessionOf(ADMIN))
    const guard = await requireTeacher()
    expect(guard.ok).toBe(true)
    if (!guard.ok) return
    expect(guard.role).toBe("ADMIN")
  })

  it("returns 401 when session user has no id", async () => {
    authMock.mockResolvedValue({ user: { role: "TEACHER" }, expires: "2099-01-01" })
    const guard = await requireTeacher()
    expect(guard.ok).toBe(false)
    if (guard.ok) return
    expect(guard.response.status).toBe(401)
  })
})

describe("requireAdmin (回归)", () => {
  it("rejects a TEACHER session", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    const guard = await requireAdmin()
    expect(guard.ok).toBe(false)
    if (guard.ok) return
    expect(guard.response.status).toBe(403)
  })

  it("allows an ADMIN session", async () => {
    authMock.mockResolvedValue(sessionOf(ADMIN))
    const guard = await requireAdmin()
    expect(guard.ok).toBe(true)
  })
})

describe("requireSession (回归)", () => {
  it("returns a CORS-enabled 401 when the token is missing", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const guard = await requireSession(
      new Request("http://localhost/api/anything")
    )
    expect("response" in guard).toBe(true)
    if (!("response" in guard)) return
    expect(guard.response.status).toBe(401)
  })

  it("returns the parsed user when the token is valid", async () => {
    readUserFromTokenMock.mockResolvedValue({
      id: TEACHER.id,
      role: "TEACHER",
      email: TEACHER.email,
      name: TEACHER.name,
    })
    const guard = await requireSession(
      new Request("http://localhost/api/anything")
    )
    expect("user" in guard).toBe(true)
    if (!("user" in guard)) return
    expect(guard.user.id).toBe(TEACHER.id)
  })
})
