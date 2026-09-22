import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 圈子共享层单测。
 *
 * `findUnapprovedTags` 与 `createCircle` 从 `app/api/circles/route.ts` 抽取而来,
 * 供 C 端接口与教师后台接口(两者共用同一套业务规则)复用。
 * 这里用 mock db 直接锁定配额 / 标签 / 落库 / 副作用四类行为。
 */

const {
  mockDb,
  chainInsert,
  insertReturningMock,
  setSelectResultsQueue,
  notifyAdminsMock,
  recordInterestEventsMock,
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

  const insertReturningMock = vi.fn()
  const chainInsert = {
    values: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    returning: insertReturningMock,
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(undefined).then(resolve, reject),
  }

  const mockDb = {
    select: vi.fn(() => makeSelectChain(selectResultsQueue.shift() ?? [])),
    insert: vi.fn(() => chainInsert),
  }

  return {
    mockDb,
    chainInsert,
    insertReturningMock,
    setSelectResultsQueue: (results: Record<string, unknown>[][]) => {
      selectResultsQueue.length = 0
      selectResultsQueue.push(...results)
    },
    notifyAdminsMock: vi.fn(async () => undefined),
    recordInterestEventsMock: vi.fn(async () => undefined),
  }
}) as {
  mockDb: { select: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> }
  chainInsert: { values: ReturnType<typeof vi.fn>; returning: ReturnType<typeof vi.fn> }
  insertReturningMock: ReturnType<typeof vi.fn>
  setSelectResultsQueue: (results: Record<string, unknown>[][]) => void
  notifyAdminsMock: ReturnType<typeof vi.fn>
  recordInterestEventsMock: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/db", () => ({ db: mockDb }))
vi.mock("@/lib/notifications", () => ({ notifyAdmins: notifyAdminsMock }))
vi.mock("@/lib/interest-events", () => ({
  recordInterestEvents: recordInterestEventsMock,
}))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { CIRCLE: "CIRCLE" },
}))

import {
  DAILY_CREATE_LIMIT,
  createCircle,
  findUnapprovedTags,
  type CreateCircleInput,
} from "@/lib/circles"

const CREATOR_ID = "11111111-1111-1111-1111-111111111111"
const NEW_CIRCLE_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

const VALID_INPUT: CreateCircleInput = {
  title: "陈氏太极拳晨练班",
  tags: ["太极拳", "书法"],
  description: "每周二、四早晨在朝阳公园练习陈氏太极拳,欢迎有一定基础的拳友加入。",
  latitude: 39.9042,
  longitude: 116.4074,
  address: "北京市朝阳区朝阳公园",
  contactPhone: "13800138000",
  activityTime: "每周二、四 06:30",
  maxMembers: 20,
  coverImages: [],
}

function makeTagRow(name: string) {
  return { name }
}

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb.insert.mockClear()
  chainInsert.values.mockClear()
  insertReturningMock.mockReset()
  notifyAdminsMock.mockClear()
  recordInterestEventsMock.mockClear()
  setSelectResultsQueue([])
})

describe("findUnapprovedTags", () => {
  it("returns only the names missing from approved tags (deduped)", async () => {
    setSelectResultsQueue([[makeTagRow("太极拳")]])
    const missing = await findUnapprovedTags(["太极拳", "书法", "书法"])
    // 去重后只剩书法缺失;太极拳已 approved 不算缺失
    expect(missing).toEqual(["书法"])
  })

  it("returns empty array when every tag is approved", async () => {
    setSelectResultsQueue([[makeTagRow("太极拳"), makeTagRow("书法")]])
    const missing = await findUnapprovedTags(["太极拳", "书法"])
    expect(missing).toEqual([])
  })

  it("returns all names when none is approved", async () => {
    setSelectResultsQueue([[]])
    const missing = await findUnapprovedTags(["太极拳", "书法"])
    expect(missing).toEqual(["太极拳", "书法"])
  })
})

describe("createCircle", () => {
  it("rejects with 429 when 24h quota is reached", async () => {
    setSelectResultsQueue([
      Array.from({ length: DAILY_CREATE_LIMIT }, (_, i) => ({ id: `c${i}` })),
    ])

    const result = await createCircle({ creatorId: CREATOR_ID, input: VALID_INPUT })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(429)
    expect(result.message).toContain("24")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("rejects with 400 and lists missing tags when a tag is not approved", async () => {
    setSelectResultsQueue([[], [makeTagRow("太极拳")]])

    const result = await createCircle({ creatorId: CREATOR_ID, input: VALID_INPUT })

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.status).toBe(400)
    expect(result.details).toEqual({ missingTags: ["书法"] })
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("inserts the circle with status=pending when everything checks out", async () => {
    setSelectResultsQueue([
      [],
      [makeTagRow("太极拳"), makeTagRow("书法")],
    ])
    insertReturningMock.mockResolvedValue([{ id: NEW_CIRCLE_ID }])

    const result = await createCircle({ creatorId: CREATOR_ID, input: VALID_INPUT })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.circleId).toBe(NEW_CIRCLE_ID)
    expect(result.status).toBe("pending")

    const circleInsert = chainInsert.values.mock.calls.find((call) => {
      const v = call[0] as Record<string, unknown> | undefined
      return !!v && v.title === VALID_INPUT.title
    })
    expect(circleInsert).toBeDefined()
    const values = circleInsert![0] as Record<string, unknown>
    expect(values.creatorId).toBe(CREATOR_ID)
    expect(values.status).toBe("pending")
    expect(values.tags).toEqual(["太极拳", "书法"])
    expect(values.memberCount).toBe(0)

    // 创建者自动成为 circle_members 的 creator
    const memberInsert = chainInsert.values.mock.calls.find((call) => {
      const v = call[0] as Record<string, unknown> | undefined
      return !!v && v.role === "creator" && v.circleId === NEW_CIRCLE_ID
    })
    expect(memberInsert).toBeDefined()

    // 副作用:通知管理员 + 记录兴趣事件
    expect(notifyAdminsMock).toHaveBeenCalledTimes(1)
    expect(notifyAdminsMock.mock.calls[0]?.[0]).toMatchObject({
      entityId: NEW_CIRCLE_ID,
      type: "circle_review",
    })
    expect(recordInterestEventsMock).toHaveBeenCalledTimes(1)
  })

  it("dedupes tags before persisting", async () => {
    setSelectResultsQueue([[], [makeTagRow("太极拳")]])
    insertReturningMock.mockResolvedValue([{ id: NEW_CIRCLE_ID }])

    await createCircle({
      creatorId: CREATOR_ID,
      input: { ...VALID_INPUT, tags: ["太极拳", "太极拳"] },
    })

    const circleInsert = chainInsert.values.mock.calls.find((call) => {
      const v = call[0] as Record<string, unknown> | undefined
      return !!v && v.title === VALID_INPUT.title
    })
    expect((circleInsert![0] as Record<string, unknown>).tags).toEqual(["太极拳"])
  })

  it("omits optional fields (null when absent)", async () => {
    setSelectResultsQueue([[], [makeTagRow("太极拳")]])
    insertReturningMock.mockResolvedValue([{ id: NEW_CIRCLE_ID }])

    await createCircle({
      creatorId: CREATOR_ID,
      input: {
        title: "极简圈子",
        tags: ["太极拳"],
        description: "只填必填字段的圈子描述,长度需要超过十个字符。",
        latitude: 30,
        longitude: 120,
        address: "某地",
        coverImages: [],
      },
    })

    const circleInsert = chainInsert.values.mock.calls.find((call) => {
      const v = call[0] as Record<string, unknown> | undefined
      return !!v && v.title === "极简圈子"
    })
    const values = circleInsert![0] as Record<string, unknown>
    expect(values.contactPhone).toBeNull()
    expect(values.wechat).toBeNull()
    expect(values.activityTime).toBeNull()
    expect(values.maxMembers).toBeNull()
  })
})
