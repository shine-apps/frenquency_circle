import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 由于 account-service 直接调用 db 的链式 API，
 * 这里用最小可用的 chainable mock 模拟 select/update/insert 行为。
 * 使用 vi.hoisted 保证 mock 对象在 vi.mock 工厂被提升后仍可访问。
 */

type Row = Record<string, unknown>

const { mockDb, chainSelect, chainUpdate, chainInsert } = vi.hoisted(() => {
  const mockDb = {
    // select 链路: select().from().innerJoin().where().limit()
    _selectResult: [] as Row[],
    select: vi.fn(function (this: unknown) {
      return chainSelect
    }),
    // update 链路: update().set().where()
    update: vi.fn(function (this: unknown) {
      return chainUpdate
    }),
    // insert 链路: insert().values().onConflictDoUpdate()/onConflictDoNothing().returning()
    _insertResult: [] as Row[],
    insert: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    // query.users.findFirst({ where })
    // 支持多次调用返回不同结果：用 _userByEmailQueue 队列
    _userByEmail: null as Row | null,
    _userByEmailQueue: [] as (Row | null)[],
    query: {
      users: {
        findFirst: vi.fn(async () => {
          if (mockDb._userByEmailQueue.length > 0) {
            return mockDb._userByEmailQueue.shift() ?? null
          }
          return mockDb._userByEmail
        }),
      },
    },
  }

  const chainSelect = {
    from: vi.fn(() => chainSelect),
    innerJoin: vi.fn(() => chainSelect),
    where: vi.fn(() => chainSelect),
    limit: vi.fn(async () => mockDb._selectResult),
  }

  const chainUpdate = {
    set: vi.fn(() => chainUpdate),
    where: vi.fn(async () => ({ rowsChanged: 1 })),
  }

  const chainInsert = {
    values: vi.fn(() => chainInsert),
    onConflictDoUpdate: vi.fn(() => chainInsert),
    onConflictDoNothing: vi.fn(() => chainInsert),
    returning: vi.fn(async () => mockDb._insertResult),
  }

  return { mockDb, chainSelect, chainUpdate, chainInsert }
})

vi.mock("@/lib/db", () => ({
  db: mockDb,
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  LOG_PREFIX: { AUTH: "AUTH", SMS: "SMS", ACCOUNT: "ACCOUNT" },
}))

import {
  findUserByAccount,
  linkAccount,
  findOrCreateUserAndLinkAccount,
} from "@/lib/auth/account-service"

function resetMock() {
  mockDb._selectResult = []
  mockDb._insertResult = []
  mockDb._userByEmail = null
  mockDb._userByEmailQueue = []
  mockDb.select.mockClear()
  mockDb.update.mockClear()
  mockDb.insert.mockClear()
  mockDb.query.users.findFirst.mockClear()
  chainSelect.from.mockClear()
  chainSelect.innerJoin.mockClear()
  chainSelect.where.mockClear()
  chainSelect.limit.mockClear()
  chainUpdate.set.mockClear()
  chainUpdate.where.mockClear()
  chainInsert.values.mockClear()
  chainInsert.onConflictDoUpdate.mockClear()
  chainInsert.onConflictDoNothing.mockClear()
  chainInsert.returning.mockClear()
}

describe("lib/auth/account-service", () => {
  beforeEach(resetMock)

  describe("findUserByAccount", () => {
    it("returns user row when account exists", async () => {
      mockDb._selectResult = [
        { user: { id: "u1", email: "a@b.com", name: "A", role: "USER" } },
      ]
      const user = await findUserByAccount("credentials", "a@b.com")
      expect(user).toEqual({
        id: "u1",
        email: "a@b.com",
        name: "A",
        role: "USER",
      })
      expect(mockDb.select).toHaveBeenCalledTimes(1)
      expect(chainSelect.innerJoin).toHaveBeenCalledTimes(1)
      expect(chainSelect.where).toHaveBeenCalledTimes(1)
      expect(chainSelect.limit).toHaveBeenCalledWith(1)
    })

    it("returns undefined when no matching account", async () => {
      mockDb._selectResult = []
      const user = await findUserByAccount("phone", "13800138000")
      expect(user).toBeUndefined()
    })
  })

  describe("linkAccount", () => {
    it("uses atomic upsert (insert + onConflictDoUpdate) — no pre SELECT, no update", async () => {
      await linkAccount({
        userId: "u1",
        provider: "credentials",
        providerAccountId: "a@b.com",
      })
      // 单条 upsert，不应再走 select / update 路径
      expect(mockDb.insert).toHaveBeenCalledTimes(1)
      expect(chainInsert.values).toHaveBeenCalledTimes(1)
      expect(chainInsert.onConflictDoUpdate).toHaveBeenCalledTimes(1)
      expect(mockDb.update).not.toHaveBeenCalled()
      expect(mockDb.select).not.toHaveBeenCalled()
    })

    it("is idempotent: a second call re-issues the same upsert", async () => {
      await linkAccount({
        userId: "u1",
        provider: "phone",
        providerAccountId: "13800138000",
      })
      await linkAccount({
        userId: "u1",
        provider: "phone",
        providerAccountId: "13800138000",
      })
      expect(mockDb.insert).toHaveBeenCalledTimes(2)
      expect(chainInsert.onConflictDoUpdate).toHaveBeenCalledTimes(2)
    })
  })

  describe("findOrCreateUserAndLinkAccount", () => {
    it("links to existing user without inserting users row", async () => {
      mockDb._userByEmail = {
        id: "u1",
        email: "13800138000@phonedomain.com",
        name: "13800138000",
        role: "USER",
      }
      // linkAccount 内部 insert account（upsert）
      mockDb._insertResult = []

      const user = await findOrCreateUserAndLinkAccount({
        email: "13800138000@phonedomain.com",
        name: "13800138000",
        provider: "phone",
        providerAccountId: "13800138000",
      })

      expect(user?.id).toBe("u1")
      expect(mockDb.query.users.findFirst).toHaveBeenCalledTimes(1)
      expect(mockDb.insert).toHaveBeenCalledTimes(1) // 只 insert account
    })

    it("creates user when none exists, then links account", async () => {
      mockDb._userByEmail = null
      mockDb._insertResult = [
        {
          id: "u-new",
          email: "13800138000@phonedomain.com",
          name: "13800138000",
          role: "USER",
        },
      ]

      const user = await findOrCreateUserAndLinkAccount({
        email: "13800138000@phonedomain.com",
        name: "13800138000",
        provider: "phone",
        providerAccountId: "13800138000",
      })

      expect(user?.id).toBe("u-new")
      // onConflictDoNothing 必须被调用以避免并发插入竞态
      expect(chainInsert.onConflictDoNothing).toHaveBeenCalledTimes(1)
      expect(mockDb.insert).toHaveBeenCalledTimes(2) // users + accounts
    })

    it("re-fetches user when concurrent insert collides (returning empty)", async () => {
      // 首次 findFirst 返回 null；并发冲突后 returning 返回空；第二次 findFirst 返回已存在用户
      mockDb._userByEmailQueue = [
        null,
        {
          id: "u-won",
          email: "13800138000@phonedomain.com",
          name: "13800138000",
          role: "USER",
        },
      ]
      // users insert returning 空（被 onConflictDoNothing 吞掉）
      mockDb._insertResult = []

      const user = await findOrCreateUserAndLinkAccount({
        email: "13800138000@phonedomain.com",
        name: "13800138000",
        provider: "phone",
        providerAccountId: "13800138000",
      })

      expect(user?.id).toBe("u-won")
      // findFirst 被调用两次：首次查询 + 冲突后回退查询
      expect(mockDb.query.users.findFirst).toHaveBeenCalledTimes(2)
      expect(chainInsert.onConflictDoNothing).toHaveBeenCalledTimes(1)
    })
  })
})
