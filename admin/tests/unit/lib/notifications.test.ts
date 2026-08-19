import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 通知服务单测:用最小可用 chainable mock 模拟 db 的 select / update / insert 链路。
 * 逻辑层不依赖真实数据库(集成测试用 mock db 覆盖真实路由)。
 */
type Row = Record<string, unknown>

const { mockDb, chainSelect, chainUpdate, chainInsert } = vi.hoisted(() => {
  const mockDb = {
    /** select 结果队列:每次 db.select() 消费一个。listNotifications 两次 select,以此区分。 */
    _selectQueue: [] as Row[][],
    select: vi.fn(() => chainSelect),
    _updateResult: [] as Row[],
    update: vi.fn(() => chainUpdate),
    _insertValues: [] as Row[],
    insert: vi.fn(() => chainInsert),
  }

  const chainSelect = {
    from: vi.fn(() => chainSelect),
    where: vi.fn(() => chainSelect),
    orderBy: vi.fn(() => chainSelect),
    limit: vi.fn(() => chainSelect),
    offset: vi.fn(() => chainSelect),
    // 可 await:消费队头结果集
    then: (resolve?: (v: Row[]) => unknown) =>
      Promise.resolve(resolve?.(mockDb._selectQueue.shift() ?? [])),
  }

  const chainUpdate = {
    set: vi.fn(() => chainUpdate),
    where: vi.fn(() => chainUpdate),
    returning: vi.fn(async () => mockDb._updateResult),
  }

  const chainInsert = {
    values: vi.fn((v: Row | Row[]) => {
      mockDb._insertValues = Array.isArray(v) ? v : [v]
      return chainInsert
    }),
  }

  return { mockDb, chainSelect, chainUpdate, chainInsert }
})

vi.mock("@/lib/db", () => ({ db: mockDb }))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { NOTIFICATION: "NOTIFICATION" },
}))

import {
  getUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
  notifyAdmins,
  notifyUser,
} from "@/lib/notifications"

function resetMock() {
  mockDb._selectQueue = []
  mockDb._updateResult = []
  mockDb._insertValues = []
  mockDb.select.mockClear()
  mockDb.update.mockClear()
  mockDb.insert.mockClear()
  chainSelect.from.mockClear()
  chainSelect.where.mockClear()
  chainSelect.orderBy.mockClear()
  chainSelect.limit.mockClear()
  chainSelect.offset.mockClear()
  chainUpdate.set.mockClear()
  chainUpdate.where.mockClear()
  chainUpdate.returning.mockClear()
  chainInsert.values.mockClear()
}

describe("lib/notifications", () => {
  beforeEach(resetMock)

  describe("notifyUser", () => {
    it("inserts a single row with actorId/entityType/entityId and defaults linkTarget", async () => {
      await notifyUser({
        recipientId: "u1",
        actorId: "a1",
        entityType: "circle",
        entityId: "c1",
        type: "circle_followed",
        title: "有人关注了你的圈子",
        content: "张三 关注了 太极圈",
      })
      expect(mockDb.insert).toHaveBeenCalledTimes(1)
      expect(mockDb._insertValues).toHaveLength(1)
      const v = mockDb._insertValues[0]
      expect(v.recipientId).toBe("u1")
      expect(v.actorId).toBe("a1")
      expect(v.entityType).toBe("circle")
      expect(v.entityId).toBe("c1")
      expect(v.type).toBe("circle_followed")
      expect(v.linkTarget).toBe("miniprogram")
    })

    it("nulls actorId/entity when not provided", async () => {
      await notifyUser({
        recipientId: "u1",
        type: "circle_review_result",
        title: "t",
        content: "c",
      })
      const v = mockDb._insertValues[0]
      expect(v.actorId).toBeNull()
      expect(v.entityType).toBeNull()
      expect(v.entityId).toBeNull()
      expect(v.linkUrl).toBeNull()
    })

    it("swallows errors without throwing", async () => {
      chainInsert.values.mockImplementationOnce(() => {
        throw new Error("boom")
      })
      // 不应抛出
      await expect(
        notifyUser({
          recipientId: "u1",
          type: "circle_review_result",
          title: "t",
          content: "c",
        }),
      ).resolves.toBeUndefined()
    })
  })

  describe("notifyAdmins", () => {
    it("fans out to all ADMIN rows", async () => {
      mockDb._selectQueue = [[{ id: "admin1" }, { id: "admin2" }]]
      await notifyAdmins({
        type: "circle_review",
        title: "新圈子待审核",
        content: "太极圈",
        linkTarget: "admin",
        entityType: "circle",
        entityId: "c1",
      })
      expect(mockDb._insertValues).toHaveLength(2)
      expect(mockDb._insertValues.map((v) => v.recipientId).sort()).toEqual([
        "admin1",
        "admin2",
      ])
      expect(mockDb._insertValues.every((v) => v.linkTarget === "admin")).toBe(
        true,
      )
    })

    it("applies a where condition (incl. excludeUserId when provided)", async () => {
      mockDb._selectQueue = [[{ id: "admin1" }, { id: "admin2" }]]
      await notifyAdmins({
        excludeUserId: "creatorAdmin",
        type: "circle_review",
        title: "t",
        content: "c",
        linkTarget: "admin",
      })
      expect(chainSelect.where).toHaveBeenCalled()
      expect(mockDb._insertValues).toHaveLength(2)
    })

    it("does nothing when no admins", async () => {
      mockDb._selectQueue = [[]]
      await notifyAdmins({ type: "circle_review", title: "t", content: "c" })
      expect(mockDb.insert).not.toHaveBeenCalled()
    })
  })

  describe("listNotifications", () => {
    it("returns paginated DTO list filtered by linkTarget", async () => {
      mockDb._selectQueue = [
        [
          {
            id: "n1",
            recipientId: "u1",
            actorId: null,
            entityType: null,
            entityId: null,
            type: "circle_review_result",
            title: "审核通过",
            content: "c",
            linkUrl: null,
            linkTarget: "miniprogram",
            readAt: null,
            createdAt: new Date("2026-08-19T00:00:00Z"),
          },
        ],
        [{ count: 1 }],
      ]
      const res = await listNotifications({
        recipientId: "u1",
        linkTarget: "miniprogram",
        page: 1,
        pageSize: 20,
      })
      expect(res.list).toHaveLength(1)
      expect(res.list[0].id).toBe("n1")
      expect(res.list[0].linkTarget).toBe("miniprogram")
      expect(res.list[0].readAt).toBeNull()
      expect(res.total).toBe(1)
      // 列表 select + count select 各一次
      expect(mockDb.select).toHaveBeenCalledTimes(2)
    })
  })

  describe("getUnreadCount", () => {
    it("returns count of unread rows for linkTarget", async () => {
      mockDb._selectQueue = [[{ count: 5 }]]
      const count = await getUnreadCount("u1", "miniprogram")
      expect(count).toBe(5)
      expect(mockDb.select).toHaveBeenCalledTimes(1)
    })
  })

  describe("markRead", () => {
    it("returns true and updates when row belongs to recipient", async () => {
      mockDb._updateResult = [{ id: "n1" }]
      const ok = await markRead("n1", "u1")
      expect(ok).toBe(true)
      expect(mockDb.update).toHaveBeenCalledTimes(1)
    })

    it("returns false on cross-user row (no match)", async () => {
      mockDb._updateResult = []
      const ok = await markRead("n1", "other")
      expect(ok).toBe(false)
    })
  })

  describe("markAllRead", () => {
    it("returns number of rows updated and is scoped to linkTarget", async () => {
      mockDb._updateResult = [{ id: "n1" }, { id: "n2" }]
      const n = await markAllRead("u1", "miniprogram")
      expect(n).toBe(2)
    })
  })
})
