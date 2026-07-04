import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * PATCH /api/auth/me 集成测试。
 *
 * mock 层级:
 * - @/lib/db:可链式调用,需要支持 findFirst(邮箱去重)与 update(更新自身)
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值(401 / 200 路径)
 * - @/lib/logger:避免输出噪音
 */

type Row = Record<string, unknown>

const { mockDb, chainUpdate, findFirstMock, readUserFromTokenMock } =
  vi.hoisted(() => {
    // findFirst 队列:每次调用取队首,缺省返回 null
    const findFirstMock = vi.fn()

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
      returning: vi.fn(),
    }

    const mockDb = {
      query: {
        users: {
          findFirst: findFirstMock,
        },
      },
      update: vi.fn(function (this: unknown) {
        return chainUpdate
      }),
    }

    return {
      mockDb,
      chainUpdate,
      findFirstMock,
      readUserFromTokenMock: vi.fn(),
    }
  })

vi.mock("@/lib/db", () => ({
  db: mockDb,
}))

vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  LOG_PREFIX: { AUTH: "AUTH", SMS: "SMS", ACCOUNT: "ACCOUNT" },
}))

import { PATCH } from "@/app/api/auth/me/route"
import type { IResponse } from "@/types/api"

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

const FAKE_USER_ID = "11111111-1111-1111-1111-111111111111"
const FAKE_AUTH = {
  id: FAKE_USER_ID,
  email: "old@example.com",
  name: "Old Name",
  role: "USER",
}

/** 构造 db.update(...).set().where().returning() 期望返回的 row */
function fakeRow(overrides: Record<string, unknown> = {}): Row {
  return {
    id: FAKE_USER_ID,
    email: "old@example.com",
    name: "Old Name",
    passwordHash: "h",
    role: "USER",
    avatarUrl: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    ...overrides,
  }
}

beforeEach(() => {
  findFirstMock.mockReset()
  chainUpdate.set.mockClear()
  chainUpdate.where.mockClear()
  chainUpdate.returning.mockReset()
  mockDb.update.mockClear()
  readUserFromTokenMock.mockReset()
})

describe("PATCH /api/auth/me", () => {
  it("returns 401 when no auth user", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await PATCH(makeRequest({ name: "x" }))
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("未登录或登录已过期")
  })

  it("returns 400 when body is empty object (refine)", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_AUTH)
    const res = await PATCH(makeRequest({}))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("Invalid request body")
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 on malformed json", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_AUTH)
    const res = await PATCH(makeRequest("not-json"))
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 200 on valid name update", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_AUTH)
    const updatedRow = fakeRow({ name: "New Name" })
    chainUpdate.returning.mockResolvedValue([updatedRow])
    const res = await PATCH(makeRequest({ name: "New Name" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{
      name: string
      avatarUrl: string | null
    }>
    expect(body.code).toBe(200)
    expect(body.data.name).toBe("New Name")
    expect(body.data.avatarUrl).toBeNull()
    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })

  it("returns 200 on valid email update (no conflict)", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_AUTH)
    findFirstMock.mockResolvedValue(null) // 邮箱未被他人占用
    const updatedRow = fakeRow({ email: "new@example.com" })
    chainUpdate.returning.mockResolvedValue([updatedRow])
    const res = await PATCH(makeRequest({ email: "new@example.com" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ email: string }>
    expect(body.data.email).toBe("new@example.com")
    // 邮箱去重确实查了 DB
    expect(findFirstMock).toHaveBeenCalledTimes(1)
  })

  it("returns 409 when email is already used by another user", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_AUTH)
    findFirstMock.mockResolvedValue({ id: "other-id", email: "new@example.com" })
    const res = await PATCH(makeRequest({ email: "new@example.com" }))
    expect(res.status).toBe(409)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("Email already in use")
    // 冲突时不应执行 update
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 200 on valid avatarUrl update", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_AUTH)
    const updatedRow = fakeRow({
      avatarUrl: "https://api.example.com/uploads/2026/07/abc.png",
    })
    chainUpdate.returning.mockResolvedValue([updatedRow])
    const res = await PATCH(
      makeRequest({
        avatarUrl: "https://api.example.com/uploads/2026/07/abc.png",
      })
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ avatarUrl: string | null }>
    expect(body.data.avatarUrl).toBe(
      "https://api.example.com/uploads/2026/07/abc.png"
    )
  })

  it("normalizes empty avatarUrl to null in DB", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_AUTH)
    const updatedRow = fakeRow({ avatarUrl: null })
    chainUpdate.returning.mockResolvedValue([updatedRow])
    const res = await PATCH(makeRequest({ avatarUrl: "" }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ avatarUrl: string | null }>
    expect(body.data.avatarUrl).toBeNull()
    // 验证 set() 收到的 payload 中 avatarUrl 是 null
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as unknown as Record<string, unknown>
    expect(setArg.avatarUrl).toBeNull()
  })

  it("returns 404 when update affects 0 rows", async () => {
    readUserFromTokenMock.mockResolvedValue(FAKE_AUTH)
    chainUpdate.returning.mockResolvedValue([]) // 用户已删除
    const res = await PATCH(makeRequest({ name: "X" }))
    expect(res.status).toBe(404)
  })
})
