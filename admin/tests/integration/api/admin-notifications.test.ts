import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 后台通知接口集成测试:
 * - GET    /api/admin/notifications          (列表,仅 linkTarget='admin')
 * - GET    /api/admin/notifications/unread-count
 * - POST   /api/admin/notifications/read-all
 *
 * mock 层级:
 * - @/auth:auth() 返回管理员 session(requireAdmin 依赖)
 * - @/lib/db:select 队列 + update 链
 * - @/lib/logger:避免噪音
 *
 * 断言重点:
 * 1. 三个接口均要求管理员鉴权(无 session → 401)
 * 2. 列表 / 未读数仅统计 linkTarget='admin' 的记录
 * 3. read-all 仅清除当前管理员后台通知,返回 affected 行数
 */

const {
  mockDb,
  chainUpdate,
  updateWhereMock,
  setSelectResultsQueue,
  authMock,
} = vi.hoisted(() => {
  const selectResultsQueue: Record<string, unknown>[][] = []

  function makeSelectChain(result: Record<string, unknown>[]) {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      offset: vi.fn(() => chain),
      then: (
        resolve: (value: Record<string, unknown>[]) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject),
    }
    return chain
  }

  const updateReturnMock = vi.fn(() => [
    { id: "n1" },
    { id: "n2" },
  ])
  const updateWhereMock = vi.fn(() => chainUpdate)
  const chainUpdate = {
    set: vi.fn(function (this: unknown) {
      return chainUpdate
    }),
    where: updateWhereMock,
    returning: vi.fn(function (this: unknown) {
      return chainUpdate
    }),
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(updateReturnMock()).then(resolve, reject),
  }

  const mockDb = {
    select: vi.fn(() => makeSelectChain(selectResultsQueue.shift() ?? [])),
    update: vi.fn(function (this: unknown) {
      return chainUpdate
    }),
  }

  return {
    mockDb,
    chainUpdate,
    updateWhereMock,
    setSelectResultsQueue: (results: Record<string, unknown>[][]) => {
      selectResultsQueue.length = 0
      selectResultsQueue.push(...results)
    },
    authMock: vi.fn(),
  }
}) as {
  mockDb: { select: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> }
  chainUpdate: {
    set: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>
  }
  updateWhereMock: ReturnType<typeof vi.fn>
  setSelectResultsQueue: (results: Record<string, unknown>[][]) => void
  authMock: ReturnType<typeof vi.fn>
}

vi.mock("@/auth", () => ({ auth: authMock }))
vi.mock("@/lib/db", () => ({ db: mockDb }))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { CIRCLE: "CIRCLE", ADMIN: "ADMIN", NOTIFICATION: "NOTIFICATION" },
}))

import { GET as listNotifications } from "@/app/api/admin/notifications/route"
import { GET as unreadCount } from "@/app/api/admin/notifications/unread-count/route"
import { POST as readAll } from "@/app/api/admin/notifications/read-all/route"
import { PATCH as markReadNotification } from "@/app/api/admin/notifications/[id]/route"

const ADMIN_ID = "99999999-9999-9999-9999-999999999999"

const adminSession = {
  user: { id: ADMIN_ID, email: "admin@example.com", name: "管理员", role: "ADMIN" },
}

function makeReq(url: string): Request {
  return new Request(url)
}

beforeEach(() => {
  authMock.mockReset()
  updateWhereMock.mockClear()
  chainUpdate.set.mockClear()
  setSelectResultsQueue([])
})

describe("后台通知接口鉴权", () => {
  it("列表接口无 session 返回 401", async () => {
    authMock.mockResolvedValue(null)
    const res = await listNotifications(makeReq("http://localhost/api/admin/notifications"))
    expect(res.status).toBe(401)
  })

  it("未读计数接口无 session 返回 401", async () => {
    authMock.mockResolvedValue(null)
    const res = await unreadCount(makeReq("http://localhost/api/admin/notifications/unread-count"))
    expect(res.status).toBe(401)
  })

  it("全部已读接口无 session 返回 401", async () => {
    authMock.mockResolvedValue(null)
    const res = await readAll(makeReq("http://localhost/api/admin/notifications/read-all"))
    expect(res.status).toBe(401)
  })
})

describe("后台通知列表", () => {
  it("返回 linkTarget='admin' 的通知并分页", async () => {
    authMock.mockResolvedValue(adminSession)
    // select 队列:先 list 结果 -> 后 count 结果
    setSelectResultsQueue([
      [
        {
          id: "n1",
          recipientId: ADMIN_ID,
          type: "circle_review",
          title: "太极圈申请审核",
          content: "张老师提交了圈子审核申请",
          linkUrl: "/admin/circles",
          linkTarget: "admin",
          readAt: null,
          createdAt: new Date(),
        },
      ],
      [{ count: 1 }],
    ])
    const res = await listNotifications(makeReq("http://localhost/api/admin/notifications?pageSize=10"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.total).toBe(1)
    expect(body.data.list).toHaveLength(1)
    expect(body.data.list[0].linkTarget).toBe("admin")
  })
})

describe("后台未读计数", () => {
  it("返回当前管理员后台未读数", async () => {
    authMock.mockResolvedValue(adminSession)
    setSelectResultsQueue([[{ count: 3 }]])
    const res = await unreadCount(makeReq("http://localhost/api/admin/notifications/unread-count"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.count).toBe(3)
  })
})

describe("后台全部已读", () => {
  it("清除当前管理员后台未读并返回 affected 行数", async () => {
    authMock.mockResolvedValue(adminSession)
    const res = await readAll(makeReq("http://localhost/api/admin/notifications/read-all"))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.marked).toBe(2)
    // update().set(...).where(...) 被调用
    expect(chainUpdate.set).toHaveBeenCalled()
    expect(updateWhereMock).toHaveBeenCalled()
  })
})

describe("后台单条已读", () => {
  it("无 session 返回 401", async () => {
    authMock.mockResolvedValue(null)
    const res = await markReadNotification(
      makeReq("http://localhost/api/admin/notifications/n1"),
      { params: Promise.resolve({ id: "n1" }) },
    )
    expect(res.status).toBe(401)
  })

  it("标记本人后台通知为已读", async () => {
    authMock.mockResolvedValue(adminSession)
    const res = await markReadNotification(
      makeReq("http://localhost/api/admin/notifications/n1"),
      { params: Promise.resolve({ id: "n1" }) },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data.marked).toBe(true)
    expect(chainUpdate.set).toHaveBeenCalled()
    expect(updateWhereMock).toHaveBeenCalled()
  })
})
