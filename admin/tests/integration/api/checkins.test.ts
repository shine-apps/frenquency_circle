import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 个人打卡集成测试。
 *
 * 覆盖:
 * - POST /api/checkins:401 / 400(内容为空) / 400(图文混排) / 400(图片>9) /
 *   400(标签不存在) / 400(打卡到未关注圈子) / 400(圈子非 active) / 201 成功
 * - GET /api/checkins/plaza:401 / 400(分页非法) / 200 分页(仅含媒体)
 * - GET /api/checkins/mine:401 / 200 分页(含纯文字)
 * - DELETE /api/checkins/:id:401 / 400(非法 uuid) / 404 / 403(非作者) / 200 软删 / 200 幂等
 * - GET /api/circles/:id/checkins:401 / 400(非法 uuid) / 404(圈子不存在) / 200 分页
 *
 * mock 层级:
 * - @/lib/db:select 队列(每次 db.select() 取队首)+ insert/update 链
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值
 * - @/lib/logger:避免输出噪音
 */

const {
  mockDb,
  chainInsert,
  insertReturningMock,
  updateSetMock,
  updateWhereMock,
  setSelectResultsQueue,
  readUserFromTokenMock,
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

  const updateWhereMock = vi.fn(async () => undefined)
  const updateSetMock = vi.fn(function (this: unknown) {
    return chainUpdate
  })
  const chainUpdate = {
    set: updateSetMock,
    where: updateWhereMock,
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
    insertReturningMock,
    chainUpdate,
    updateSetMock,
    updateWhereMock,
    setSelectResultsQueue: (results: Record<string, unknown>[][]) => {
      selectResultsQueue.length = 0
      selectResultsQueue.push(...results)
    },
    readUserFromTokenMock: vi.fn(),
  }
}) as {
  mockDb: {
    select: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  chainInsert: {
    values: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise<unknown>
  }
  insertReturningMock: ReturnType<typeof vi.fn>
  updateSetMock: ReturnType<typeof vi.fn>
  updateWhereMock: ReturnType<typeof vi.fn>
  setSelectResultsQueue: (results: Record<string, unknown>[][]) => void
  readUserFromTokenMock: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/db", () => ({ db: mockDb }))

vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
}))

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { CHECKIN: "CHECKIN", CIRCLE: "CIRCLE" },
}))

import { POST as createCheckin } from "@/app/api/checkins/route"
import { GET as getPlaza } from "@/app/api/checkins/plaza/route"
import { GET as getMine } from "@/app/api/checkins/mine/route"
import { DELETE as deleteCheckin, GET as getCheckin } from "@/app/api/checkins/[id]/route"
import { GET as getCircleCheckins } from "@/app/api/circles/[id]/checkins/route"
import type { CheckinDTO, IResponse, Paginated } from "@/types/api"

const USER = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "user@example.com",
  name: "李师傅",
  role: "USER" as const,
}

const CHECKIN_ID = "11111111-1111-4111-8111-111111111111"
const CIRCLE_ID = "33333333-3333-4333-8333-333333333333"

type RouteContext = { params: Promise<{ id: string }> }
function makeContext(id: string): RouteContext {
  return { params: Promise.resolve({ id }) }
}

function makePostRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function makeGetRequest(path: string): Request {
  return new Request(`http://localhost${path}`)
}

function makeDeleteRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "DELETE" })
}

/** 构造 checkins 表行(字段与 schema 对齐) */
function makeCheckinRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CHECKIN_ID,
    userId: USER.id,
    content: "今天练了半小时太极",
    circleId: null,
    tags: ["太极拳"],
    images: [],
    videoUrl: null,
    status: "active",
    createdAt: new Date("2026-09-14T02:00:00Z"),
    updatedAt: new Date("2026-09-14T02:00:00Z"),
    ...overrides,
  }
}

const AUTHOR_ROW = {
  id: USER.id,
  name: USER.name,
  avatarUrl: "https://cdn.example.com/a.png",
}

/**
 * COS 环境变量:让 `mediaUrlSchema` 的媒体来源白名单校验在测试中可预期。
 * 取值与夹具中的 `https://cdn.example.com/...` 对齐,便于用另一域名构造「外链」反例。
 */
const COS_ENV_KEYS = [
  "COS_SECRET_ID",
  "COS_SECRET_KEY",
  "COS_BUCKET",
  "COS_REGION",
  "COS_PUBLIC_BASE_URL",
] as const
const cosEnvBackup: Record<string, string | undefined> = {}

beforeEach(() => {
  // 1. 固定 COS 配置(校验通过 → 前缀为 https://cdn.example.com/)
  for (const key of COS_ENV_KEYS) cosEnvBackup[key] = process.env[key]
  process.env.COS_SECRET_ID = "sid"
  process.env.COS_SECRET_KEY = "skey"
  process.env.COS_BUCKET = "bucket-1234567890"
  process.env.COS_REGION = "ap-shanghai"
  process.env.COS_PUBLIC_BASE_URL = "https://cdn.example.com"

  // 2. mock 状态复位
  mockDb.select.mockClear()
  mockDb.insert.mockClear()
  mockDb.update.mockClear()
  chainInsert.values.mockClear()
  insertReturningMock.mockReset()
  updateSetMock.mockClear()
  updateWhereMock.mockClear()
  readUserFromTokenMock.mockReset()
  setSelectResultsQueue([])
})

afterEach(() => {
  for (const key of COS_ENV_KEYS) {
    const previous = cosEnvBackup[key]
    if (previous === undefined) delete process.env[key]
    else process.env[key] = previous
  }
})

describe("POST /api/checkins", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await createCheckin(
      makePostRequest("/api/checkins", { content: "打卡" })
    )
    expect(res.status).toBe(401)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when content and media are all empty", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const res = await createCheckin(
      makePostRequest("/api/checkins", { content: "   ", images: [] })
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when video and images are both provided", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const res = await createCheckin(
      makePostRequest("/api/checkins", {
        videoUrl: "https://cdn.example.com/v.mp4",
        images: ["https://cdn.example.com/1.png"],
      })
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when images exceed 9", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const images = Array.from(
      { length: 10 },
      (_, i) => `https://cdn.example.com/${i}.png`
    )
    const res = await createCheckin(
      makePostRequest("/api/checkins", { images })
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when a tag is not approved/existing", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    // select 1: 标签存在性查询 → 只命中 1 个,缺 '书法'
    setSelectResultsQueue([[{ name: "太极拳" }]])
    const res = await createCheckin(
      makePostRequest("/api/checkins", {
        content: "打卡",
        tags: ["太极拳", "书法"],
      })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.details).toEqual({ missingTags: ["书法"] })
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when checking in to a circle the user does not follow", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    // select 1: 关注关系查询 → 空
    setSelectResultsQueue([[]])
    const res = await createCheckin(
      makePostRequest("/api/checkins", { content: "打卡", circleId: CIRCLE_ID })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toContain("关注的圈子")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when the followed circle is not active", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    // select 1: 关注关系存在;select 2: 圈子为 pending
    setSelectResultsQueue([
      [{ circleId: CIRCLE_ID }],
      [{ id: CIRCLE_ID, status: "pending" }],
    ])
    const res = await createCheckin(
      makePostRequest("/api/checkins", { content: "打卡", circleId: CIRCLE_ID })
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("creates a checkin with images, tags and circle, returning 201 DTO", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const row = makeCheckinRow({
      content: "晨练打卡",
      circleId: CIRCLE_ID,
      tags: ["太极拳", "八段锦"],
      images: [
        "https://cdn.example.com/1.png",
        "https://cdn.example.com/2.png",
      ],
    })
    insertReturningMock.mockResolvedValue([row])
    setSelectResultsQueue([
      // select 1: 标签存在性(两个都命中)
      [{ name: "太极拳" }, { name: "八段锦" }],
      // select 2: 关注关系
      [{ circleId: CIRCLE_ID }],
      // select 3: 圈子状态
      [{ id: CIRCLE_ID, status: "active" }],
      // select 4: hydrate 作者
      [AUTHOR_ROW],
      // select 5: hydrate 圈子标题
      [{ id: CIRCLE_ID, title: "陈氏太极拳晨练班" }],
    ])

    const res = await createCheckin(
      makePostRequest("/api/checkins", {
        content: "  晨练打卡  ",
        circleId: CIRCLE_ID,
        tags: ["太极拳", "八段锦", "太极拳"],
        images: row.images,
      })
    )

    expect(res.status).toBe(201)
    const body = (await res.json()) as IResponse<CheckinDTO>
    expect(body.code).toBe(201)
    expect(body.data.author).toEqual({
      id: USER.id,
      name: USER.name,
      avatarUrl: AUTHOR_ROW.avatarUrl,
    })
    expect(body.data.circleTitle).toBe("陈氏太极拳晨练班")
    expect(body.data.createdAt).toBe("2026-09-14T02:00:00.000Z")

    // 落库字段:正文已 trim,标签已去重
    const insertArg = chainInsert.values.mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(insertArg).toEqual({
      userId: USER.id,
      content: "晨练打卡",
      circleId: CIRCLE_ID,
      tags: ["太极拳", "八段锦"],
      images: row.images,
      videoUrl: null,
    })
  })

  it("creates a text-only checkin without tags or circle", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const row = makeCheckinRow({
      content: "纯文字打卡",
      tags: [],
      images: [],
      videoUrl: null,
    })
    insertReturningMock.mockResolvedValue([row])
    // 仅 hydrate 作者 1 次 select
    setSelectResultsQueue([[AUTHOR_ROW]])

    const res = await createCheckin(
      makePostRequest("/api/checkins", { content: "纯文字打卡" })
    )

    expect(res.status).toBe(201)
    const body = (await res.json()) as IResponse<CheckinDTO>
    expect(body.data.circleTitle).toBeNull()
    expect(body.data.tags).toEqual([])
    expect(body.data.images).toEqual([])
  })

  it("creates a video checkin and stores videoUrl", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const row = makeCheckinRow({
      content: null,
      videoUrl: "https://cdn.example.com/v.mp4",
    })
    insertReturningMock.mockResolvedValue([row])
    setSelectResultsQueue([[AUTHOR_ROW]])

    const res = await createCheckin(
      makePostRequest("/api/checkins", {
        videoUrl: "https://cdn.example.com/v.mp4",
      })
    )

    expect(res.status).toBe(201)
    const insertArg = chainInsert.values.mock.calls[0][0] as Record<
      string,
      unknown
    >
    expect(insertArg.videoUrl).toBe("https://cdn.example.com/v.mp4")
    expect(insertArg.content).toBeNull()
  })

  it("returns 400 when an image url points outside the app COS", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const res = await createCheckin(
      makePostRequest("/api/checkins", {
        content: "外链图片",
        images: ["https://evil.example.com/track.gif"],
      })
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when the video url points outside the app COS", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const res = await createCheckin(
      makePostRequest("/api/checkins", {
        videoUrl: "https://evil.example.com/v.mp4",
      })
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})

describe("GET /api/checkins/plaza", () => {
  it("allows guests to preview the first page", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    setSelectResultsQueue([[makeCheckinRow({ images: ["https://cdn.example.com/1.png"] })], [{ value: 1 }], [AUTHOR_ROW]])
    const res = await getPlaza(makeGetRequest("/api/checkins/plaza"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<CheckinDTO>>
    expect(body.data.list).toHaveLength(1)
    expect(body.data.page).toBe(1)
  })

  it("returns 401 when a guest requests page > 1", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await getPlaza(makeGetRequest("/api/checkins/plaza?page=2"))
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toContain("登录")
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("allows a logged-in user to load page > 1", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[], [{ value: 0 }]])
    const res = await getPlaza(makeGetRequest("/api/checkins/plaza?page=2"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<CheckinDTO>>
    expect(body.data.page).toBe(2)
  })

  it("clamps guest pageSize to the preview limit", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    setSelectResultsQueue([[], [{ value: 0 }]])
    const res = await getPlaza(
      makeGetRequest("/api/checkins/plaza?page=1&pageSize=100")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<CheckinDTO>>
    expect(body.data.pageSize).toBe(20)
  })

  it("keeps the requested pageSize for logged-in users", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[], [{ value: 0 }]])
    const res = await getPlaza(
      makeGetRequest("/api/checkins/plaza?page=1&pageSize=50")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<CheckinDTO>>
    expect(body.data.pageSize).toBe(50)
  })

  it("returns 400 on invalid pagination", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const res = await getPlaza(makeGetRequest("/api/checkins/plaza?page=0"))
    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("returns paginated media checkins", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const row = makeCheckinRow({
      images: ["https://cdn.example.com/1.png"],
    })
    setSelectResultsQueue([
      [row],
      [{ value: 1 }],
      [AUTHOR_ROW],
    ])

    const res = await getPlaza(
      makeGetRequest("/api/checkins/plaza?page=1&pageSize=20")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<CheckinDTO>>
    expect(body.data.total).toBe(1)
    expect(body.data.page).toBe(1)
    expect(body.data.list).toHaveLength(1)
    expect(body.data.list[0].images).toEqual([
      "https://cdn.example.com/1.png",
    ])
    expect(body.data.list[0].author.name).toBe(USER.name)
  })

  it("returns an empty list when there is no media checkin", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[], [{ value: 0 }]])
    const res = await getPlaza(makeGetRequest("/api/checkins/plaza"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<CheckinDTO>>
    expect(body.data.list).toEqual([])
    expect(body.data.total).toBe(0)
  })
})

describe("GET /api/checkins/mine", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await getMine(makeGetRequest("/api/checkins/mine"))
    expect(res.status).toBe(401)
  })

  it("returns the current user's checkins including text-only ones", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([
      [makeCheckinRow({ content: "纯文字", images: [], videoUrl: null })],
      [{ value: 1 }],
      [AUTHOR_ROW],
    ])

    const res = await getMine(makeGetRequest("/api/checkins/mine"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<CheckinDTO>>
    expect(body.data.list).toHaveLength(1)
    expect(body.data.list[0].images).toEqual([])
    expect(body.data.list[0].videoUrl).toBeNull()
  })
})

describe("DELETE /api/checkins/:id", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await deleteCheckin(
      makeDeleteRequest(`/api/checkins/${CHECKIN_ID}`),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(401)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 when id is not a uuid", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const res = await deleteCheckin(
      makeDeleteRequest("/api/checkins/not-a-uuid"),
      makeContext("not-a-uuid")
    )
    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 404 when the checkin does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[]])
    const res = await deleteCheckin(
      makeDeleteRequest(`/api/checkins/${CHECKIN_ID}`),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(404)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 403 when deleting someone else's checkin", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([
      [{ id: CHECKIN_ID, userId: "other-user", status: "active" }],
    ])
    const res = await deleteCheckin(
      makeDeleteRequest(`/api/checkins/${CHECKIN_ID}`),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("soft deletes the checkin", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([
      [{ id: CHECKIN_ID, userId: USER.id, status: "active" }],
    ])
    const res = await deleteCheckin(
      makeDeleteRequest(`/api/checkins/${CHECKIN_ID}`),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ deleted: boolean }>
    expect(body.data).toEqual({ deleted: true })
    expect(updateSetMock).toHaveBeenCalledTimes(1)
    const setArg = updateSetMock.mock.calls[0][0] as Record<string, unknown>
    expect(setArg.status).toBe("deleted")
    expect(setArg.updatedAt).toBeInstanceOf(Date)
    expect(updateWhereMock).toHaveBeenCalledTimes(1)
  })

  it("is idempotent when the checkin is already deleted", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([
      [{ id: CHECKIN_ID, userId: USER.id, status: "deleted" }],
    ])
    const res = await deleteCheckin(
      makeDeleteRequest(`/api/checkins/${CHECKIN_ID}`),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(200)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})

describe("GET /api/checkins/:id", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await getCheckin(
      makeGetRequest(`/api/checkins/${CHECKIN_ID}`),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(401)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("returns 400 when id is not a uuid", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const res = await getCheckin(
      makeGetRequest("/api/checkins/not-a-uuid"),
      makeContext("not-a-uuid")
    )
    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("returns 404 when the checkin does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[]])
    const res = await getCheckin(
      makeGetRequest(`/api/checkins/${CHECKIN_ID}`),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(404)
  })

  it("returns 404 when the checkin is soft-deleted", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[makeCheckinRow({ status: "deleted" })]])
    const res = await getCheckin(
      makeGetRequest(`/api/checkins/${CHECKIN_ID}`),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toContain("不存在")
  })

  it("returns 200 with hydrated author and circle title", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([
      // 打卡本体(带圈子)
      [makeCheckinRow({ circleId: CIRCLE_ID, images: ["https://cdn.example.com/1.png"] })],
      // hydrate 作者
      [AUTHOR_ROW],
      // hydrate 圈子标题
      [{ id: CIRCLE_ID, title: "陈氏太极拳晨练班" }],
    ])

    const res = await getCheckin(
      makeGetRequest(`/api/checkins/${CHECKIN_ID}`),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<CheckinDTO>
    expect(body.data.id).toBe(CHECKIN_ID)
    expect(body.data.author.name).toBe(USER.name)
    expect(body.data.circleTitle).toBe("陈氏太极拳晨练班")
    expect(body.data.images).toEqual(["https://cdn.example.com/1.png"])
  })

  it("returns 200 for a text-only checkin without circle", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[makeCheckinRow({ content: "纯文字", images: [], videoUrl: null })], [AUTHOR_ROW]])

    const res = await getCheckin(
      makeGetRequest(`/api/checkins/${CHECKIN_ID}`),
      makeContext(CHECKIN_ID)
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<CheckinDTO>
    expect(body.data.circleId).toBeNull()
    expect(body.data.circleTitle).toBeNull()
    expect(body.data.videoUrl).toBeNull()
  })
})

describe("GET /api/circles/:id/checkins", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await getCircleCheckins(
      makeGetRequest(`/api/circles/${CIRCLE_ID}/checkins`),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(401)
  })

  it("returns 400 when circle id is not a uuid", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const res = await getCircleCheckins(
      makeGetRequest("/api/circles/not-a-uuid/checkins"),
      makeContext("not-a-uuid")
    )
    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
  })

  it("returns 404 when the circle does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[]])
    const res = await getCircleCheckins(
      makeGetRequest(`/api/circles/${CIRCLE_ID}/checkins`),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(404)
  })

  it("returns paginated circle checkins with circle title hydrated", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    const row = makeCheckinRow({
      circleId: CIRCLE_ID,
      images: ["https://cdn.example.com/1.png"],
    })
    setSelectResultsQueue([
      // 圈子存在性
      [{ id: CIRCLE_ID, status: "active" }],
      // 列表
      [row],
      // 总数
      [{ value: 1 }],
      // hydrate 作者
      [AUTHOR_ROW],
      // hydrate 圈子标题
      [{ id: CIRCLE_ID, title: "陈氏太极拳晨练班" }],
    ])

    const res = await getCircleCheckins(
      makeGetRequest(`/api/circles/${CIRCLE_ID}/checkins?page=1&pageSize=10`),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<CheckinDTO>>
    expect(body.data.total).toBe(1)
    expect(body.data.pageSize).toBe(10)
    expect(body.data.list[0].circleId).toBe(CIRCLE_ID)
    expect(body.data.list[0].circleTitle).toBe("陈氏太极拳晨练班")
  })

  it("returns 404 for a non-creator when the circle is not active", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    // 圈子为 pending 且创建者是他人 → 与 GET /api/circles/:id 口径一致,返回 404
    setSelectResultsQueue([
      [
        {
          id: CIRCLE_ID,
          status: "pending",
          creatorId: "99999999-9999-4999-8999-999999999999",
        },
      ],
    ])
    const res = await getCircleCheckins(
      makeGetRequest(`/api/circles/${CIRCLE_ID}/checkins`),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(404)
  })

  it("allows the creator to read checkins of a non-active circle", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([
      // 圈子为 pending 但创建者是自己 → 放行
      [{ id: CIRCLE_ID, status: "pending", creatorId: USER.id }],
      [],
      [{ value: 0 }],
    ])
    const res = await getCircleCheckins(
      makeGetRequest(`/api/circles/${CIRCLE_ID}/checkins`),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<CheckinDTO>>
    expect(body.data.list).toEqual([])
  })
})
