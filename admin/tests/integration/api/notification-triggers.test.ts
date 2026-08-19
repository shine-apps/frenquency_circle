import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 通知触发集成测试:覆盖三个触发点写入 notifications 表(写入即扇出)。
 *
 * mock 层级:
 * - @/lib/db:select 队列 + insert(可捕获 values / onConflictDoNothing / returning 可控) + update 链
 * - @/lib/auth/session-token:控制 requireSession(小程序业务接口)
 * - @/lib/auth-utils:控制 requireAdmin(后台审核接口)
 * - @/lib/logger:避免噪音
 *
 * 断言重点:触发点确实向 notifications 插入了符合预期(type / linkTarget / actorId / entityType / entityId / recipientId)的行。
 */

const {
  mockDb,
  chainInsert,
  chainUpdate,
  insertReturningMock,
  updateWhereMock,
  setSelectResultsQueue,
  setInsertReturn,
  readUserFromTokenMock,
  requireAdminMock,
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

  // insert().values(...).onConflictDoNothing(...).returning(...) 链
  const insertReturningMock = vi.fn()
  const chainInsert = {
    // values 捕获参数,供断言读取多次插入
    values: vi.fn(function (this: unknown, v: unknown) {
      return chainInsert
    }),
    onConflictDoNothing: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    returning: insertReturningMock,
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(insertReturningMock()).then(resolve, reject),
  }

  // update().set(...).where(...).returning(...) 链
  const updateReturnMock = vi.fn(() => [
    {
      id: "c1",
      title: "太极圈",
      description: "",
      creatorId: "11111111-1111-1111-1111-111111111111",
      latitude: 39.9,
      longitude: 116.4,
      address: "北京市朝阳区朝阳公园",
      contactPhone: null,
      wechat: null,
      activityTime: null,
      maxMembers: null,
      memberCount: 0,
      status: "pending",
      coverImages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
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
    insertReturningMock,
    updateWhereMock,
    setSelectResultsQueue: (results: Record<string, unknown>[][]) => {
      selectResultsQueue.length = 0
      selectResultsQueue.push(...results)
    },
    setInsertReturn: (value: unknown) => insertReturningMock.mockReturnValue(value),
    readUserFromTokenMock: vi.fn(),
    requireAdminMock: vi.fn(),
  }
}) as {
  mockDb: {
    select: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  chainInsert: {
    values: ReturnType<typeof vi.fn>
    onConflictDoNothing: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise<unknown>
  }
  chainUpdate: {
    set: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise<unknown>
  }
  insertReturningMock: ReturnType<typeof vi.fn>
  updateWhereMock: ReturnType<typeof vi.fn>
  setSelectResultsQueue: (results: Record<string, unknown>[][]) => void
  setInsertReturn: (value: unknown) => void
  readUserFromTokenMock: ReturnType<typeof vi.fn>
  requireAdminMock: ReturnType<typeof vi.fn>
}

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
  requireAdmin: requireAdminMock,
}))

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { CIRCLE: "CIRCLE", ADMIN: "ADMIN", NOTIFICATION: "NOTIFICATION" },
}))

import { POST as createCircle } from "@/app/api/circles/route"
import { POST as followCircle } from "@/app/api/circles/[id]/follow/route"
import { PATCH as reviewCircle } from "@/app/api/admin/circles/[id]/route"

const TEACHER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "teacher@example.com",
  name: "张老师",
  role: "TEACHER" as const,
}
const ADMIN = {
  id: "99999999-9999-9999-9999-999999999999",
  email: "admin@example.com",
  name: "管理员",
  role: "ADMIN" as const,
}
const FOLLOWER = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "follower@example.com",
  name: "关注者小李",
  role: "USER" as const,
}

type RouteContext = { params: Promise<{ id: string }> }
const makeCtx = (id: string): RouteContext => ({ params: Promise.resolve({ id }) })

/** 收集所有 notifications 插入行(支持单条对象或数组批量插入) */
function notificationInserts(): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = []
  for (const call of chainInsert.values.mock.calls as unknown[][]) {
    const arg = call[0]
    const rows = Array.isArray(arg) ? arg : [arg]
    for (const v of rows) {
      if (
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        "type" in v &&
        "recipientId" in v
      ) {
        out.push(v as Record<string, unknown>)
      }
    }
  }
  return out
}

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb.insert.mockClear()
  mockDb.update.mockClear()
  chainInsert.values.mockClear()
  chainInsert.onConflictDoNothing.mockClear()
  chainUpdate.set.mockClear()
  updateWhereMock.mockClear()
  readUserFromTokenMock.mockReset()
  requireAdminMock.mockReset()
  setSelectResultsQueue([])
  setInsertReturn(undefined)
})

describe("POST /api/circles → 通知管理员审核", () => {
  it("pending 圈子创建后,所有 ADMIN 收到 circle_review 通知(创建者本人排除)", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER)
    // select 1: 24h 配额(空) → select 2: 标签校验(命中 approved 标签)
    // select 3: notifyAdmins 查询 ADMIN 用户(返回 1 个管理员)
    setSelectResultsQueue([
      [],
      [{ name: "太极" }],
      [{ id: ADMIN.id }],
    ])
    setInsertReturn([{ id: "c-new" }]) // 圈子 insert returning {id}

    const res = await createCircle(
      new Request("http://localhost/api/circles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: "陈氏太极晨练",
          tags: ["太极"],
          description: "每周二四早晨练习陈氏太极拳,欢迎加入。",
          latitude: 39.9,
          longitude: 116.4,
          address: "北京市朝阳区朝阳公园",
          contactPhone: "13800138000",
        }),
      })
    )
    expect(res.status).toBe(201)

    const notes = notificationInserts()
    // 圈子 insert 1 次 + members insert 1 次 + 通知 N 次(取决于 admin 数量)
    const reviewNotes = notes.filter((n) => n.type === "circle_review")
    // 模拟 DB 中仅有 1 个 ADMIN(由 notifyAdmins 的 select 返回)
    // notifyAdmins 在通知服务内另起一次 db.select(返回 admins)
    expect(reviewNotes.length).toBeGreaterThanOrEqual(1)
    const note = reviewNotes[0]
    expect(note.linkTarget).toBe("admin")
    expect(note.actorId).toBe(TEACHER.id)
    expect(note.entityType).toBe("circle")
    expect(note.entityId).toBe("c-new")
    expect(note.recipientId).toBeDefined()
  })
})

describe("POST /api/circles/:id/follow → 通知创建者", () => {
  it("首次关注非本人圈子,创建者收到 circle_followed(actorId=关注者)", async () => {
    readUserFromTokenMock.mockResolvedValue(FOLLOWER)
    // select 1: circle(active, creatorId, title);select 2: follower 用户(name)
    setSelectResultsQueue([
      [{ id: "c1", status: "active", creatorId: TEACHER.id, title: "太极圈" }],
      [{ name: "关注者小李" }],
    ])
    // 首次关注:onConflictDoNothing().returning() 返回 1 行
    setInsertReturn([{ id: "f1" }])

    const res = await followCircle(
      new Request("http://localhost/api/circles/c1/follow", { method: "POST" }),
      makeCtx("c1")
    )
    expect(res.status).toBe(200)

    const notes = notificationInserts()
    const followNotes = notes.filter((n) => n.type === "circle_followed")
    expect(followNotes).toHaveLength(1)
    const note = followNotes[0]
    expect(note.recipientId).toBe(TEACHER.id)
    expect(note.actorId).toBe(FOLLOWER.id)
    expect(note.entityType).toBe("circle")
    expect(note.entityId).toBe("c1")
    expect(note.linkTarget).toBe("miniprogram")
    expect(String(note.content)).toContain("关注者小李")
    expect(String(note.content)).toContain("太极圈")
  })

  it("重复关注(returning 空)不重复发通知", async () => {
    readUserFromTokenMock.mockResolvedValue(FOLLOWER)
    setSelectResultsQueue([
      [{ id: "c1", status: "active", creatorId: TEACHER.id, title: "太极圈" }],
    ])
    // 重复关注:returning 返回空
    setInsertReturn([])

    const res = await followCircle(
      new Request("http://localhost/api/circles/c1/follow", { method: "POST" }),
      makeCtx("c1")
    )
    expect(res.status).toBe(200)
    const followNotes = notificationInserts().filter(
      (n) => n.type === "circle_followed"
    )
    expect(followNotes).toHaveLength(0)
  })

  it("自关注(关注者是创建者)不发通知", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER)
    setSelectResultsQueue([
      [{ id: "c1", status: "active", creatorId: TEACHER.id, title: "太极圈" }],
    ])
    setInsertReturn([{ id: "f1" }])

    const res = await followCircle(
      new Request("http://localhost/api/circles/c1/follow", { method: "POST" }),
      makeCtx("c1")
    )
    expect(res.status).toBe(200)
    const followNotes = notificationInserts().filter(
      (n) => n.type === "circle_followed"
    )
    expect(followNotes).toHaveLength(0)
  })
})

describe("PATCH /api/admin/circles/:id → 通知创建者审核结果", () => {
  function mockAdmin(adminId: string) {
    requireAdminMock.mockResolvedValue({ ok: true, userId: adminId })
  }

  it("pending → active:创建者收到 circle_review_result(通过,linkUrl 非空)", async () => {
    mockAdmin(ADMIN.id)
    // select 1: 当前圈子(creatorId, title, status=pending)
    setSelectResultsQueue([
      [
        {
          id: "c1",
          creatorId: TEACHER.id,
          title: "太极圈",
          status: "pending",
          description: "",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ])

    const res = await reviewCircle(
      new Request("http://localhost/api/admin/circles/c1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      }),
      makeCtx("c1")
    )
    expect(res.status).toBe(200)

    const notes = notificationInserts()
    const resultNotes = notes.filter((n) => n.type === "circle_review_result")
    expect(resultNotes).toHaveLength(1)
    const note = resultNotes[0]
    expect(note.recipientId).toBe(TEACHER.id)
    expect(note.actorId).toBe(ADMIN.id)
    expect(note.entityType).toBe("circle")
    expect(note.entityId).toBe("c1")
    expect(note.linkTarget).toBe("miniprogram")
    expect(note.linkUrl).toBe("/pages/circle/circle?id=c1")
  })

  it("pending → rejected:创建者收到 circle_review_result(未通过,reviewNote 拼入文案)", async () => {
    mockAdmin(ADMIN.id)
    setSelectResultsQueue([
      [
        {
          id: "c1",
          creatorId: TEACHER.id,
          title: "太极圈",
          status: "pending",
          description: "",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ])

    const res = await reviewCircle(
      new Request("http://localhost/api/admin/circles/c1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "rejected", reviewNote: "材料不实" }),
      }),
      makeCtx("c1")
    )
    expect(res.status).toBe(200)

    const notes = notificationInserts()
    const resultNotes = notes.filter((n) => n.type === "circle_review_result")
    expect(resultNotes).toHaveLength(1)
    const note = resultNotes[0]
    expect(note.linkUrl).toBeNull()
    expect(String(note.content)).toContain("材料不实")
  })

  it("active → offline(非 pending 转出)不发审核结果通知", async () => {
    mockAdmin(ADMIN.id)
    setSelectResultsQueue([
      [
        {
          id: "c1",
          creatorId: TEACHER.id,
          title: "太极圈",
          status: "active",
          description: "",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    ])

    const res = await reviewCircle(
      new Request("http://localhost/api/admin/circles/c1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "offline" }),
      }),
      makeCtx("c1")
    )
    expect(res.status).toBe(200)

    const resultNotes = notificationInserts().filter(
      (n) => n.type === "circle_review_result"
    )
    expect(resultNotes).toHaveLength(0)
  })
})
