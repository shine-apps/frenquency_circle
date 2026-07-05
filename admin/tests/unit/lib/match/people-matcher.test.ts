import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * people-matcher 单元测试。
 *
 * mock 层级:
 * - @/lib/db:支持 select().from().where() 和 select().from().innerJoin().where() 链式调用
 *   每次 select 从队列取结果
 *
 * 测试内容:
 * - 空结果(无候选用户)
 * - 按加权总分降序排序
 * - locationPrecision 脱敏(exact / community / region)
 * - 分页
 */

type CandidateUser = {
  id: string
  name: string
  avatarUrl: string | null
  latitude: number | null
  longitude: number | null
  activityLevel: string
  practiceYears: number | null
  privacySettings: unknown
}

type TagJoinRow = {
  userId: string
  id: string
  name: string
  category: string
  subCategory: string | null
  pinyin: string | null
  pinyinInitials: string | null
  status: string
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

const { mockDb, setSelectResultsQueue, setSelectResults } = vi.hoisted(() => {
  const selectResultsQueue: unknown[][] = []

  function makeChain(result: unknown[]) {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      offset: vi.fn(() => chain),
      then: (
        resolve: (value: unknown[]) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject),
    }
    return chain
  }

  const mockDb = {
    select: vi.fn(() => makeChain(selectResultsQueue.shift() ?? [])),
  }

  return {
    mockDb,
    setSelectResultsQueue: (results: unknown[][]) => {
      selectResultsQueue.length = 0
      selectResultsQueue.push(...results)
    },
    setSelectResults: (result: unknown[]) => {
      selectResultsQueue.length = 0
      selectResultsQueue.push(result)
    },
  }
}) as {
  mockDb: { select: ReturnType<typeof vi.fn> }
  setSelectResultsQueue: (results: unknown[][]) => void
  setSelectResults: (result: unknown[]) => void
}

vi.mock("@/lib/db", () => ({ db: mockDb }))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: {
    AUTH: "AUTH",
    SMS: "SMS",
    ACCOUNT: "ACCOUNT",
    WECHAT: "WECHAT",
    UPLOAD: "UPLOAD",
    MATCH: "MATCH",
    CIRCLE: "CIRCLE",
  },
}))

import { matchPeople } from "@/lib/match/people-matcher"
import type { MatchPersonDTO } from "@/types/api"

const REF_LAT = 39.908
const REF_LNG = 116.397

function makeTagRow(
  userId: string,
  tagId: string,
  name: string
): TagJoinRow {
  return {
    userId,
    id: tagId,
    name,
    category: "武术养生",
    subCategory: "太极拳",
    pinyin: "taijiquan",
    pinyinInitials: "tjq",
    status: "approved",
    createdBy: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  }
}

function makeCandidate(overrides: Partial<CandidateUser>): CandidateUser {
  return {
    id: overrides.id ?? "user-1",
    name: overrides.name ?? "User",
    avatarUrl: overrides.avatarUrl ?? null,
    latitude: overrides.latitude ?? 39.91,
    longitude: overrides.longitude ?? 116.40,
    activityLevel: overrides.activityLevel ?? "medium",
    practiceYears: overrides.practiceYears ?? null,
    privacySettings:
      overrides.privacySettings ?? {
        allowMatch: true,
        publicContact: true,
        locationPrecision: "exact",
      },
  }
}

beforeEach(() => {
  mockDb.select.mockClear()
  setSelectResults([])
})

describe("lib/match/people-matcher - matchPeople", () => {
  it("returns empty list when no candidates found", async () => {
    setSelectResultsQueue([[]]) // 无候选用户

    const result = await matchPeople({
      lat: REF_LAT,
      lng: REF_LNG,
      tagIds: ["tag-1"],
      rangeKm: 5,
      currentUserId: "me",
      page: 1,
      pageSize: 20,
    })

    expect(result.list).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it("sorts candidates by weighted total score descending", async () => {
    // User A: 近距离 + 高活跃度 + 全标签重合
    const userA = makeCandidate({
      id: "user-a",
      name: "Alice",
      latitude: 39.91,
      longitude: 116.40,
      activityLevel: "high",
      privacySettings: {
        allowMatch: true,
        publicContact: true,
        locationPrecision: "exact",
      },
    })
    // User B: 中距离 + 中活跃度 + 部分标签重合
    const userB = makeCandidate({
      id: "user-b",
      name: "Bob",
      latitude: 39.95,
      longitude: 116.45,
      activityLevel: "medium",
      privacySettings: {
        allowMatch: true,
        publicContact: true,
        locationPrecision: "exact",
      },
    })
    // User C: 远距离 + 低活跃度 + 无标签重合
    const userC = makeCandidate({
      id: "user-c",
      name: "Charlie",
      latitude: 39.98,
      longitude: 116.48,
      activityLevel: "low",
      privacySettings: {
        allowMatch: true,
        publicContact: true,
        locationPrecision: "exact",
      },
    })

    const tagRows = [
      makeTagRow("user-a", "tag-1", "陈氏太极拳"),
      makeTagRow("user-a", "tag-2", "八段锦"),
      makeTagRow("user-a", "tag-3", "站桩"),
      makeTagRow("user-b", "tag-1", "陈氏太极拳"),
    ]

    setSelectResultsQueue([
      [userA, userB, userC], // 候选用户
      tagRows, // 标签关联
    ])

    const result = await matchPeople({
      lat: REF_LAT,
      lng: REF_LNG,
      tagIds: ["tag-1", "tag-2", "tag-3"],
      rangeKm: 10,
      currentUserId: "me",
      page: 1,
      pageSize: 20,
    })

    expect(result.list).toHaveLength(3)
    expect(result.list[0]!.userId).toBe("user-a")
    expect(result.list[1]!.userId).toBe("user-b")
    expect(result.list[2]!.userId).toBe("user-c")
  })

  it("applies locationPrecision to distanceKm", async () => {
    const userExact = makeCandidate({
      id: "user-exact",
      name: "Exact",
      latitude: 39.92,
      longitude: 116.41,
      activityLevel: "medium",
      privacySettings: {
        allowMatch: true,
        publicContact: true,
        locationPrecision: "exact",
      },
    })
    const userCommunity = makeCandidate({
      id: "user-community",
      name: "Community",
      latitude: 39.95,
      longitude: 116.45,
      activityLevel: "medium",
      privacySettings: {
        allowMatch: true,
        publicContact: true,
        locationPrecision: "community",
      },
    })
    const userRegion = makeCandidate({
      id: "user-region",
      name: "Region",
      latitude: 39.98,
      longitude: 116.48,
      activityLevel: "medium",
      privacySettings: {
        allowMatch: true,
        publicContact: true,
        locationPrecision: "region",
      },
    })

    setSelectResultsQueue([
      [userExact, userCommunity, userRegion],
      [], // 无标签
    ])

    const result = await matchPeople({
      lat: REF_LAT,
      lng: REF_LNG,
      tagIds: [],
      rangeKm: 30,
      currentUserId: "me",
      page: 1,
      pageSize: 20,
    })

    const exact = result.list.find((m) => m.userId === "user-exact")!
    const community = result.list.find((m) => m.userId === "user-community")!
    const region = result.list.find((m) => m.userId === "user-region")!

    // exact: 保留 2 位小数
    expect(exact.distanceKm).toBe(Math.round(exact.distanceKm * 100) / 100)
    // community: 0.5 的整数倍
    expect(community.distanceKm % 0.5).toBe(0)
    // region: 5 的整数倍
    expect(region.distanceKm % 5).toBe(0)
  })

  it("paginates results correctly", async () => {
    const users: CandidateUser[] = Array.from({ length: 5 }, (_, i) =>
      makeCandidate({
        id: `user-${i}`,
        name: `User${i}`,
        // 越来越远,确保排序可预测
        latitude: 39.908 + i * 0.01,
        longitude: 116.397 + i * 0.01,
        activityLevel: "medium",
      })
    )

    setSelectResultsQueue([users, []])

    const result = await matchPeople({
      lat: REF_LAT,
      lng: REF_LNG,
      tagIds: [],
      rangeKm: 30,
      currentUserId: "me",
      page: 1,
      pageSize: 2,
    })

    expect(result.list).toHaveLength(2)
    expect(result.total).toBe(5)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(2)
    // 最近的排在前面
    expect(result.list[0]!.userId).toBe("user-0")
    expect(result.list[1]!.userId).toBe("user-1")
  })

  it("returns correct DTO shape", async () => {
    const user = makeCandidate({
      id: "user-dto",
      name: "DTO User",
      avatarUrl: "http://example.com/avatar.jpg",
      practiceYears: 10,
      activityLevel: "high",
    })

    setSelectResultsQueue([
      [user],
      [makeTagRow("user-dto", "tag-1", "陈氏太极拳")],
    ])

    const result = await matchPeople({
      lat: REF_LAT,
      lng: REF_LNG,
      tagIds: ["tag-1"],
      rangeKm: 10,
      currentUserId: "me",
      page: 1,
      pageSize: 20,
    })

    const dto: MatchPersonDTO = result.list[0]!
    expect(dto.userId).toBe("user-dto")
    expect(dto.name).toBe("DTO User")
    expect(dto.avatarUrl).toBe("http://example.com/avatar.jpg")
    expect(dto.activityLevel).toBe("high")
    expect(dto.practiceYears).toBe(10)
    expect(dto.tags).toHaveLength(1)
    expect(dto.tags[0]!.id).toBe("tag-1")
    expect(typeof dto.distanceKm).toBe("number")
  })
})
