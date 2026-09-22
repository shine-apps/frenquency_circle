import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * circle-matcher 单元测试。
 *
 * mock 层级同 people-matcher:
 * - @/lib/db:select 队列,每次 select 取队首
 *
 * 测试内容:
 * - 空结果
 * - 排序/分页由 SQL 层完成(ORDER BY totalScore DESC / LIMIT/OFFSET),mock 按页返回
 * - 分页 total 来自 COUNT 查询
 * - DTO 形状(tags 为 string[] 名称数组)
 *
 * 注意:重构后距离与打分均在 SQL 层计算,候选行直接携带 SQL 计算的
 * `distance` 字段;circles.tags 为 text[] 数组列,行内直接携带 tags 名称数组。
 */

type CandidateRow = {
  id: string
  title: string
  address: string
  activityTime: string | null
  memberCount: number
  maxMembers: number | null
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

import { matchCircles } from "@/lib/match/circle-matcher"
import type { MatchCircleDTO } from "@/types/api"

const REF_LAT = 39.908
const REF_LNG = 116.397

function makeRow(overrides: Partial<CandidateRow>): CandidateRow {
  return {
    id: overrides.id ?? "circle-1",
    title: overrides.title ?? "Circle",
    address: overrides.address ?? "某地",
    activityTime: overrides.activityTime ?? null,
    memberCount: overrides.memberCount ?? 0,
    maxMembers: overrides.maxMembers === undefined ? 10 : overrides.maxMembers,
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

describe("lib/match/circle-matcher - matchCircles", () => {
  it("returns empty list when no candidates found", async () => {
    setQueue([], 0) // 无候选圈子:数据页空,COUNT=0

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

  it("returns rows in SQL-provided order (ORDER BY totalScore DESC in SQL)", async () => {
    // 排序已下推 SQL,mock 按总分降序返回;此处验证引擎不再改变顺序
    const circleA = makeRow({
      id: "circle-a",
      title: "A",
      distance: 0.5,
      memberCount: 8,
      maxMembers: 10,
      tags: ["太极拳", "气功功法", "站桩"],
    })
    const circleB = makeRow({
      id: "circle-b",
      title: "B",
      distance: 5,
      memberCount: 3,
      maxMembers: 10,
      tags: ["太极拳"],
    })
    const circleC = makeRow({
      id: "circle-c",
      title: "C",
      distance: 9,
      memberCount: 0,
      maxMembers: 10,
      tags: ["书法"],
    })

    setQueue([circleA, circleB, circleC], 3)

    const result = await matchCircles({
      lat: REF_LAT,
      lng: REF_LNG,
      tags: ["太极拳", "气功功法", "站桩"],
      rangeKm: 10,
      page: 1,
      pageSize: 20,
    })

    expect(result.list).toHaveLength(3)
    expect(result.total).toBe(3)
    expect(result.list[0]!.circleId).toBe("circle-a")
    expect(result.list[1]!.circleId).toBe("circle-b")
    expect(result.list[2]!.circleId).toBe("circle-c")
  })

  it("returns only current page rows with total from COUNT query", async () => {
    // LIMIT/OFFSET 已下推 SQL:mock 仅返回当前页 2 行,COUNT 返回总数 5
    const pageRows: CandidateRow[] = Array.from({ length: 2 }, (_, i) =>
      makeRow({
        id: `circle-${i}`,
        title: `Circle${i}`,
        distance: 1 + i,
        memberCount: 5,
        maxMembers: 10,
        tags: [],
      })
    )

    setQueue(pageRows, 5)

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
    const row = makeRow({
      id: "circle-dto",
      title: "太极拳晨练班",
      address: "朝阳公园南门",
      activityTime: "每周六早 7:00-8:30",
      memberCount: 5,
      maxMembers: 15,
      tags: ["太极拳"],
      distance: 2.345,
    })

    setQueue([row], 1)

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
    // 距离保留 2 位小数
    expect(dto.distanceKm).toBe(2.35)
  })

  it("handles null maxMembers (uses memberCount/10 for activity)", async () => {
    const row = makeRow({
      id: "circle-no-max",
      title: "No Max",
      memberCount: 3,
      maxMembers: null,
      tags: [],
      distance: 1,
    })

    setQueue([row], 1)

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

  it("issues two parallel queries: page data + COUNT", async () => {
    setQueue([], 0)

    await matchCircles({
      lat: REF_LAT,
      lng: REF_LNG,
      tags: [],
      rangeKm: 5,
      page: 1,
      pageSize: 20,
    })

    expect(mockDb.select).toHaveBeenCalledTimes(2)
  })
})
