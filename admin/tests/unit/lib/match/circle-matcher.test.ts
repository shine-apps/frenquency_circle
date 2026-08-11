import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * circle-matcher 单元测试。
 *
 * mock 层级同 people-matcher:
 * - @/lib/db:select 队列,每次 select 取队首
 *
 * 测试内容:
 * - 空结果
 * - 按加权总分降序(距离 30% + 重合度 50% + 活跃度 20%)
 * - 分页
 * - DTO 形状(tags 为 string[] 名称数组)
 *
 * 注意:circles.tags 为 text[] 数组列,候选行直接携带 tags 名称数组,
 * 不再需要第二次 SELECT 关联标签。
 */

type CandidateCircle = {
  id: string
  title: string
  latitude: number
  longitude: number
  address: string
  activityTime: string | null
  memberCount: number
  maxMembers: number | null
  tags: string[]
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

import { matchCircles } from "@/lib/match/circle-matcher"
import type { MatchCircleDTO } from "@/types/api"

const REF_LAT = 39.908
const REF_LNG = 116.397

function makeCandidate(overrides: Partial<CandidateCircle>): CandidateCircle {
  return {
    id: overrides.id ?? "circle-1",
    title: overrides.title ?? "Circle",
    latitude: overrides.latitude ?? 39.91,
    longitude: overrides.longitude ?? 116.40,
    address: overrides.address ?? "某地",
    activityTime: overrides.activityTime ?? null,
    memberCount: overrides.memberCount ?? 0,
    maxMembers: overrides.maxMembers === undefined ? 10 : overrides.maxMembers,
    tags: overrides.tags ?? [],
  }
}

beforeEach(() => {
  mockDb.select.mockClear()
  setSelectResults([])
})

describe("lib/match/circle-matcher - matchCircles", () => {
  it("returns empty list when no candidates found", async () => {
    setSelectResultsQueue([[]])

    const result = await matchCircles({
      lat: REF_LAT,
      lng: REF_LNG,
      tags: ["太极拳"],
      rangeKm: 5,
      page: 1,
      pageSize: 20,
    })

    expect(result.list).toHaveLength(0)
    expect(result.total).toBe(0)
  })

  it("sorts circles by weighted total score descending", async () => {
    // Circle A: 近 + 全标签重合 + 高活跃度
    const circleA = makeCandidate({
      id: "circle-a",
      title: "A",
      latitude: 39.91,
      longitude: 116.40,
      memberCount: 8,
      maxMembers: 10,
      tags: ["太极拳", "气功功法", "站桩"],
    })
    // Circle B: 中距离 + 部分重合 + 中活跃度
    const circleB = makeCandidate({
      id: "circle-b",
      title: "B",
      latitude: 39.95,
      longitude: 116.45,
      memberCount: 3,
      maxMembers: 10,
      tags: ["太极拳"],
    })
    // Circle C: 远 + 无重合 + 低活跃度
    const circleC = makeCandidate({
      id: "circle-c",
      title: "C",
      latitude: 39.98,
      longitude: 116.48,
      memberCount: 0,
      maxMembers: 10,
      tags: ["书法"],
    })

    setSelectResultsQueue([[circleA, circleB, circleC]])

    const result = await matchCircles({
      lat: REF_LAT,
      lng: REF_LNG,
      tags: ["太极拳", "气功功法", "站桩"],
      rangeKm: 10,
      page: 1,
      pageSize: 20,
    })

    expect(result.list).toHaveLength(3)
    expect(result.list[0]!.circleId).toBe("circle-a")
    expect(result.list[1]!.circleId).toBe("circle-b")
    expect(result.list[2]!.circleId).toBe("circle-c")
  })

  it("paginates results correctly", async () => {
    const circles: CandidateCircle[] = Array.from({ length: 5 }, (_, i) =>
      makeCandidate({
        id: `circle-${i}`,
        title: `Circle${i}`,
        latitude: 39.908 + i * 0.01,
        longitude: 116.397 + i * 0.01,
        memberCount: 5,
        maxMembers: 10,
        tags: [],
      })
    )

    setSelectResultsQueue([circles])

    const result = await matchCircles({
      lat: REF_LAT,
      lng: REF_LNG,
      tags: [],
      rangeKm: 30,
      page: 1,
      pageSize: 2,
    })

    expect(result.list).toHaveLength(2)
    expect(result.total).toBe(5)
    expect(result.page).toBe(1)
    expect(result.pageSize).toBe(2)
  })

  it("returns correct DTO shape with tags as string array", async () => {
    const circle = makeCandidate({
      id: "circle-dto",
      title: "太极拳晨练班",
      latitude: 39.91,
      longitude: 116.40,
      address: "朝阳公园南门",
      activityTime: "每周六早 7:00-8:30",
      memberCount: 5,
      maxMembers: 15,
      tags: ["太极拳"],
    })

    setSelectResultsQueue([[circle]])

    const result = await matchCircles({
      lat: REF_LAT,
      lng: REF_LNG,
      tags: ["太极拳"],
      rangeKm: 10,
      page: 1,
      pageSize: 20,
    })

    const dto: MatchCircleDTO = result.list[0]!
    expect(dto.circleId).toBe("circle-dto")
    expect(dto.title).toBe("太极拳晨练班")
    expect(dto.address).toBe("朝阳公园南门")
    expect(dto.activityTime).toBe("每周六早 7:00-8:30")
    expect(dto.memberCount).toBe(5)
    expect(dto.maxMembers).toBe(15)
    expect(dto.tags).toEqual(["太极拳"])
    expect(typeof dto.distanceKm).toBe("number")
  })

  it("handles null maxMembers (uses memberCount/10 for activity)", async () => {
    const circle = makeCandidate({
      id: "circle-no-max",
      title: "No Max",
      latitude: 39.91,
      longitude: 116.40,
      memberCount: 3,
      maxMembers: null,
      tags: [],
    })

    setSelectResultsQueue([[circle]])

    const result = await matchCircles({
      lat: REF_LAT,
      lng: REF_LNG,
      tags: [],
      rangeKm: 10,
      page: 1,
      pageSize: 20,
    })

    expect(result.list).toHaveLength(1)
    expect(result.list[0]!.maxMembers).toBeNull()
  })
})
