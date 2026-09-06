import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * people-matcher 单元测试。
 *
 * mock 层级:
 * - @/lib/db:select 队列,每次 select 取队首
 *
 * 测试内容:
 * - 空结果(无候选用户)
 * - 排序/分页由 SQL 层完成(ORDER BY totalScore DESC / LIMIT/OFFSET),mock 按页返回
 * - locationPrecision 脱敏(exact / community / region)
 * - 数据页与 COUNT 并行查询,total 来自 COUNT 结果
 *
 * 注意:重构后距离与打分均在 SQL 层计算,候选行直接携带 SQL 计算的
 * `distance` 字段;users.tags 为 text[] 数组列,行内直接携带 tags 名称数组。
 */

type CandidateRow = {
  id: string
  name: string
  avatarUrl: string | null
  activityLevel: string
  practiceYears: number | null
  privacySettings: unknown
  tags: string[]
  /** SQL 层 Haversine 计算的精确距离(km) */
  distance: number
}

const { mockDb, setSelectResultsQueue, setSelectResults } = vi.hoisted(() => {
  const selectResultsQueue: unknown[][] = []

  function makeChain(result: unknown[]) {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
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

function makeRow(overrides: Partial<CandidateRow>): CandidateRow {
  return {
    id: overrides.id ?? "user-1",
    name: overrides.name ?? "User",
    avatarUrl: overrides.avatarUrl ?? null,
    activityLevel: overrides.activityLevel ?? "medium",
    practiceYears: overrides.practiceYears ?? null,
    privacySettings:
      overrides.privacySettings ?? {
        allowMatch: true,
        publicContact: true,
        locationPrecision: "exact",
      },
    tags: overrides.tags ?? [],
    distance: overrides.distance ?? 1,
  }
}

/** 构造「数据页 + COUNT」select 队列:数据页查询先入队,COUNT 查询随后 */
function setQueue(pageRows: CandidateRow[], total: number) {
  setSelectResultsQueue([pageRows, [{ count: total }]])
}

beforeEach(() => {
  mockDb.select.mockClear()
  setQueue([], 0)
})

describe("lib/match/people-matcher - matchPeople", () => {
  it("returns empty list when no candidates found", async () => {
    setQueue([], 0) // 无候选用户:数据页空,COUNT=0

    const result = await matchPeople({
      lat: REF_LAT,
      lng: REF_LNG,
      tags: ["太极拳"],
      rangeKm: 5,
      currentUserId: "me",
      page: 1,
      pageSize: 20,
    })

    expect(result.list).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it("returns rows in SQL-provided order (ORDER BY totalScore DESC in SQL)", async () => {
    // 排序已下推 SQL,mock 按总分降序返回;此处验证引擎不再改变顺序
    const userA = makeRow({
      id: "user-a",
      name: "Alice",
      distance: 0.5,
      activityLevel: "high",
      tags: ["太极拳", "气功功法", "站桩"],
    })
    const userB = makeRow({
      id: "user-b",
      name: "Bob",
      distance: 5,
      activityLevel: "medium",
      tags: ["太极拳"],
    })
    const userC = makeRow({
      id: "user-c",
      name: "Charlie",
      distance: 9,
      activityLevel: "low",
      tags: ["书法"],
    })

    setQueue([userA, userB, userC], 3)

    const result = await matchPeople({
      lat: REF_LAT,
      lng: REF_LNG,
      tags: ["太极拳", "气功功法", "站桩"],
      rangeKm: 10,
      currentUserId: "me",
      page: 1,
      pageSize: 20,
    })

    expect(result.list).toHaveLength(3)
    expect(result.total).toBe(3)
    expect(result.list[0]!.userId).toBe("user-a")
    expect(result.list[1]!.userId).toBe("user-b")
    expect(result.list[2]!.userId).toBe("user-c")
  })

  it("applies locationPrecision to distanceKm", async () => {
    const userExact = makeRow({
      id: "user-exact",
      name: "Exact",
      distance: 1.3,
      activityLevel: "medium",
      privacySettings: {
        allowMatch: true,
        publicContact: true,
        locationPrecision: "exact",
      },
    })
    const userCommunity = makeRow({
      id: "user-community",
      name: "Community",
      distance: 1.3,
      activityLevel: "medium",
      privacySettings: {
        allowMatch: true,
        publicContact: true,
        locationPrecision: "community",
      },
    })
    const userRegion = makeRow({
      id: "user-region",
      name: "Region",
      distance: 1.3,
      activityLevel: "medium",
      privacySettings: {
        allowMatch: true,
        publicContact: true,
        locationPrecision: "region",
      },
    })

    setQueue([userExact, userCommunity, userRegion], 3)

    const result = await matchPeople({
      lat: REF_LAT,
      lng: REF_LNG,
      tags: [],
      rangeKm: 30,
      currentUserId: "me",
      page: 1,
      pageSize: 20,
    })

    const exact = result.list.find((m) => m.userId === "user-exact")!
    const community = result.list.find((m) => m.userId === "user-community")!
    const region = result.list.find((m) => m.userId === "user-region")!

    // exact: 保留 2 位小数
    expect(exact.distanceKm).toBe(1.3)
    // community: 0.5 的整数倍(round(1.3/0.5)=3 → 1.5)
    expect(community.distanceKm).toBe(1.5)
    // region: 5 的整数倍
    expect(region.distanceKm).toBe(0)
  })

  it("returns only current page rows with total from COUNT query", async () => {
    // LIMIT/OFFSET 已下推 SQL:mock 仅返回当前页 2 行,COUNT 返回总数 5
    const pageRows: CandidateRow[] = Array.from({ length: 2 }, (_, i) =>
      makeRow({
        id: `user-${i}`,
        name: `User${i}`,
        distance: 1 + i,
        activityLevel: "medium",
      })
    )

    setQueue(pageRows, 5)

    const result = await matchPeople({
      lat: REF_LAT,
      lng: REF_LNG,
      tags: [],
      rangeKm: 30,
      currentUserId: "me",
      page: 1,
      pageSize: 2,
    })

    expect(result.list).toHaveLength(2)
    expect(result.total).toBe(5)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(2)
    expect(result.list[0]!.userId).toBe("user-0")
    expect(result.list[1]!.userId).toBe("user-1")
  })

  it("returns correct DTO shape with tags as string array", async () => {
    const row = makeRow({
      id: "user-dto",
      name: "DTO User",
      avatarUrl: "http://example.com/avatar.jpg",
      practiceYears: 10,
      activityLevel: "high",
      tags: ["太极拳"],
      distance: 2,
    })

    setQueue([row], 1)

    const result = await matchPeople({
      lat: REF_LAT,
      lng: REF_LNG,
      tags: ["太极拳"],
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
    expect(dto.tags).toEqual(["太极拳"])
    expect(dto.distanceKm).toBe(2)
  })

  it("issues two parallel queries: page data + COUNT", async () => {
    setQueue([], 0)

    await matchPeople({
      lat: REF_LAT,
      lng: REF_LNG,
      tags: [],
      rangeKm: 5,
      currentUserId: "me",
      page: 1,
      pageSize: 20,
    })

    expect(mockDb.select).toHaveBeenCalledTimes(2)
  })
})
