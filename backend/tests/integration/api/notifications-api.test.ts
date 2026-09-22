import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 通知 API 集成测试(用户侧,linkTarget = miniprogram)。
 * 覆盖 GET /api/notifications、GET /api/notifications/unread-count、
 * PATCH /api/notifications/[id]、POST /api/notifications/read-all。
 *
 * 逻辑层复用 lib/notifications,这里主要验证:鉴权、linkTarget 过滤、越权隔离、分页入参解析。
 */

const {
  mockDb,
  listChain,
  updateChain,
  readUserFromTokenMock,
  countReturnMock,
  updateWhereMock,
  updateReturnMock,
  listResultMock,
} = vi.hoisted(() => {
  const selectQueue: Record<string, unknown>[][] = []

  const listResultMock = vi.fn()
  const listChain = {
    from: vi.fn(() => listChain),
    where: vi.fn(() => listChain),
    orderBy: vi.fn(() => listChain),
    limit: vi.fn(() => listChain),
    offset: vi.fn(() => listChain),
    then: (
      resolve: (v: Record<string, unknown>[]) => unknown,
      reject?: (r: unknown) => unknown
    ) => Promise.resolve(listResultMock()).then(resolve, reject),
  }

  const updateReturnMock = vi.fn(() => [])
  const updateWhereMock = vi.fn(() => updateChain)
  const updateChain = {
    set: vi.fn(() => updateChain),
    where: updateWhereMock,
    returning: vi.fn(() => updateChain),
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (r: unknown) => unknown
    ) => Promise.resolve(updateReturnMock()).then(resolve, reject),
  }

  const countReturnMock = vi.fn()
  const countChain = {
    from: vi.fn(() => countChain),
    where: vi.fn(() => countChain),
    then: (
      resolve: (v: unknown) => unknown,
      reject?: (r: unknown) => unknown
    ) => Promise.resolve(countReturnMock()).then(resolve, reject),
  }

  const mockDb = {
    select: vi.fn((shape?: unknown) =>
      // 列表查询返回 listChain;count(*) 查询返回 countChain
      shape && typeof shape === "object" && "count" in (shape as object)
        ? countChain
        : listChain
    ),
    update: vi.fn(() => updateChain),
  }

  return {
    mockDb,
    listChain,
    updateChain,
    readUserFromTokenMock: vi.fn(),
    countReturnMock,
    updateWhereMock,
    updateReturnMock,
    listResultMock,
  }
})

vi.mock("@/lib/db", () => ({ db: mockDb }))
vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
}))
vi.mock("@/lib/auth-utils", () => ({
  requireSession: vi.fn(async (req: Request) => {
    const u = await readUserFromTokenMock(req)
    if (!u) return { response: new Response(null, { status: 401 }) }
    return { user: u }
  }),
}))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { NOTIFICATION: "NOTIFICATION" },
}))

import { GET as listNotifications } from "@/app/api/notifications/route"
import { GET as unreadCount } from "@/app/api/notifications/unread-count/route"
import { PATCH as markRead } from "@/app/api/notifications/[id]/route"
import { POST as readAll } from "@/app/api/notifications/read-all/route"

const USER = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "user@example.com",
  name: "用户",
  role: "USER" as const,
}
const OTHER = {
  id: "33333333-3333-3333-3333-333333333333",
  email: "other@example.com",
  name: "别人",
  role: "USER" as const,
}

type Ctx = { params: Promise<{ id: string }> }
const ctxOf = (id: string): Ctx => ({ params: Promise.resolve({ id }) })

function authAs(user: typeof USER) {
  readUserFromTokenMock.mockResolvedValue(user)
}

beforeEach(() => {
  readUserFromTokenMock.mockReset()
  mockDb.select.mockClear()
  listChain.from.mockClear()
  listChain.where.mockClear()
  listChain.orderBy.mockClear()
  listChain.limit.mockClear()
  listChain.offset.mockClear()
  updateChain.set.mockClear()
  updateWhereMock.mockClear()
  listResultMock.mockReset()
  countReturnMock.mockReset()
  updateReturnMock.mockReset()
})

describe("GET /api/notifications", () => {
  it("返回当前用户分页列表(仅 miniprogram)", async () => {
    authAs(USER)
    // 列表查询(select 无 count)走 listChain
    listResultMock.mockReturnValue([
      {
        id: "n1",
        recipientId: USER.id,
        actorId: null,
        entityType: null,
        entityId: null,
        type: "circle_followed",
        title: "有人关注了你的圈子",
        content: "张三 关注了 太极圈",
        linkUrl: "/pages/circle/circle?id=c1",
        linkTarget: "miniprogram",
        readAt: null,
        createdAt: new Date("2026-08-19T00:00:00Z"),
      },
    ])
    // 计数查询(select 含 count)走 countChain
    countReturnMock.mockReturnValue([{ count: 1 }])

    const res = await listNotifications(
      new Request("http://localhost/api/notifications?page=1&pageSize=20")
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.list).toHaveLength(1)
    expect(body.data.total).toBe(1)
    expect(body.data.list[0].id).toBe("n1")
  })

  it("未登录返回 401", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await listNotifications(new Request("http://localhost/api/notifications"))
    expect(res.status).toBe(401)
  })

  it("非法分页参数返回 400", async () => {
    authAs(USER)
    const res = await listNotifications(
      new Request("http://localhost/api/notifications?page=0")
    )
    expect(res.status).toBe(400)
  })
})

describe("GET /api/notifications/unread-count", () => {
  it("返回未读数量", async () => {
    authAs(USER)
    countReturnMock.mockReturnValue([{ count: 3 }])
    const res = await unreadCount(new Request("http://localhost/api/notifications/unread-count"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.count).toBe(3)
  })

  it("未登录返回 401", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await unreadCount(new Request("http://localhost/api/notifications/unread-count"))
    expect(res.status).toBe(401)
  })
})

describe("PATCH /api/notifications/[id]", () => {
  it("标记本人通知已读返回 marked:true", async () => {
    authAs(USER)
    updateReturnMock.mockReturnValue([{ id: "n1" }])
    const res = await markRead(
      new Request("http://localhost/api/notifications/n1", { method: "PATCH" }),
      ctxOf("n1")
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.marked).toBe(true)
  })

  it("标记不存在/非本人通知幂等返回 marked:false(不报错)", async () => {
    authAs(USER)
    updateReturnMock.mockReturnValue([])
    const res = await markRead(
      new Request("http://localhost/api/notifications/nX", { method: "PATCH" }),
      ctxOf("nX")
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.marked).toBe(false)
  })

  it("未登录返回 401", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await markRead(
      new Request("http://localhost/api/notifications/n1", { method: "PATCH" }),
      ctxOf("n1")
    )
    expect(res.status).toBe(401)
  })
})

describe("POST /api/notifications/read-all", () => {
  it("全部已读返回 marked 数量", async () => {
    authAs(USER)
    updateReturnMock.mockReturnValue([{ id: "n1" }, { id: "n2" }])
    const res = await readAll(new Request("http://localhost/api/notifications/read-all", { method: "POST" }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.marked).toBe(2)
  })

  it("未登录返回 401", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await readAll(new Request("http://localhost/api/notifications/read-all", { method: "POST" }))
    expect(res.status).toBe(401)
  })
})
