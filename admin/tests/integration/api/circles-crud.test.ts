import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 圈子 CRUD 集成测试(POST / GET / PUT / DELETE + GET /mine)。
 *
 * 覆盖:
 * - POST: 401 / 403(非 TEACHER) / 201 成功 / 400(校验失败) / 429(24h 配额) / 400(无联系方式)
 * - GET [id]: 401 / 200 成功(含 creator/tags/contactCount) / 404(不存在) / 404(非创建者访问非 active)
 * - PUT [id]: 401 / 403(非创建者) / 200 成功(含 tags 全量替换) / 404 / 400(校验失败)
 * - DELETE [id]: 401 / 403(非创建者) / 200 软删除 / 404
 * - GET /mine: 401 / 200 分页列表
 *
 * mock 层级:
 * - @/lib/db:select 队列(每次 db.select() 取队首)+ insert/update 链
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值
 * - @/lib/logger:避免输出噪音
 *
 * 新契约:
 * - 圈子标签直接存于 circles.tags text[](名称数组),无 circle_tags 桥接表与事务
 * - 创建/更新时校验标签名称存在(approved),缺失返回 400
 */

type CircleRow = {
  id: string
  title: string
  description: string
  creatorId: string
  latitude: number
  longitude: number
  address: string
  contactPhone: string | null
  wechat: string | null
  activityTime: string | null
  maxMembers: number | null
  memberCount: number
  status: string
  /** 轮播图片 URL 数组 */
  coverImages: string[]
  /** 标签名称数组(存 hobby_tags.name) */
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

type TagRow = {
  id: string
  name: string
  category: string
  pinyin: string | null
  pinyinInitials: string | null
  status: string
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
}

const {
  mockDb,
  chainInsert,
  chainUpdate,
  insertReturningMock,
  updateWhereMock,
  setSelectResultsQueue,
  readUserFromTokenMock,
} = vi.hoisted(() => {
  // select 队列:每次 db.select() 调用取出队首结果
  const selectResultsQueue: Record<string, unknown>[][] = []

  // 构造 thenable select chain,支持 from/where/orderBy/limit/offset
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

  // insert().values(...).returning(...) 链
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

  // update().set(...).where(...) 链
  const updateWhereMock = vi.fn(async () => undefined)
  const chainUpdate = {
    set: vi.fn(function (this: unknown) {
      return chainUpdate
    }),
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
    chainUpdate,
    insertReturningMock,
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
  chainUpdate: {
    set: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
  }
  insertReturningMock: ReturnType<typeof vi.fn>
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

import { POST } from "@/app/api/circles/route"
import {
  GET as getCircleById,
  PUT as putCircle,
  DELETE as deleteCircle,
} from "@/app/api/circles/[id]/route"
import { GET as getMyCircles } from "@/app/api/circles/mine/route"
import type { IResponse, CircleDetailDTO, CircleDTO, Paginated } from "@/types/api"

const TEACHER_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "teacher@example.com",
  name: "Teacher",
  role: "TEACHER" as const,
}

const REGULAR_USER = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "user@example.com",
  name: "User",
  role: "USER" as const,
}

const TAG_NAME_1 = "太极拳"
const TAG_NAME_2 = "书法"

const VALID_CIRCLE_BODY = {
  title: "陈氏太极拳晨练班",
  tags: [TAG_NAME_1, TAG_NAME_2],
  description: "每周二、四早晨在朝阳公园练习陈氏太极拳,欢迎有一定基础的拳友加入。",
  latitude: 39.9042,
  longitude: 116.4074,
  address: "北京市朝阳区朝阳公园",
  contactPhone: "13800138000",
  wechat: "taichi2026",
  activityTime: "每周二、四 06:30",
  maxMembers: 20,
}

function makeCircleRow(overrides: Partial<CircleRow> = {}): CircleRow {
  return {
    id: overrides.id ?? "circle-1",
    title: overrides.title ?? "陈氏太极拳晨练班",
    description: overrides.description ?? "描述",
    creatorId: overrides.creatorId ?? TEACHER_USER.id,
    latitude: overrides.latitude ?? 39.9042,
    longitude: overrides.longitude ?? 116.4074,
    address: overrides.address ?? "北京市朝阳区",
    contactPhone: overrides.contactPhone ?? "13800138000",
    wechat: overrides.wechat ?? "taichi2026",
    activityTime: overrides.activityTime ?? "每周二、四 06:30",
    maxMembers: overrides.maxMembers ?? 20,
    memberCount: overrides.memberCount ?? 8,
    status: overrides.status ?? "active",
    coverImages: overrides.coverImages ?? [],
    tags: overrides.tags ?? [TAG_NAME_1, TAG_NAME_2],
    createdAt: overrides.createdAt ?? new Date("2026-07-01T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-07-01T00:00:00Z"),
  }
}

function makeTagRow(overrides: Partial<TagRow> = {}): TagRow {
  return {
    id: overrides.id ?? "00000000-0000-4000-8000-000000000001",
    name: overrides.name ?? TAG_NAME_1,
    category: overrides.category ?? "武术养生",
    pinyin: overrides.pinyin ?? "taijiquan",
    pinyinInitials: overrides.pinyinInitials ?? "tjq",
    status: overrides.status ?? "approved",
    createdBy: overrides.createdBy ?? null,
    createdAt: overrides.createdAt ?? new Date("2026-01-01T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-01-01T00:00:00Z"),
  }
}

function makeJsonRequest(body: unknown, path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function makePutRequest(body: unknown, path: string): Request {
  return new Request(`http://localhost${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

function makeDeleteRequest(path: string): Request {
  return new Request(`http://localhost${path}`, { method: "DELETE" })
}

function makeGetRequest(
  path: string,
  params: Record<string, string | undefined> = {}
): Request {
  const url = new URL(`http://localhost${path}`)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) url.searchParams.set(k, v)
  }
  return new Request(url.toString(), { method: "GET" })
}

type RouteContext = { params: Promise<{ id: string }> }
function makeContext(id: string): RouteContext {
  return { params: Promise.resolve({ id }) }
}

/**
 * 组装 fetchCircleDetail 所需的 3 个 select 结果队列(circle + creator + count)。
 * circles.tags 为数组列,直接存在于 circle 行,无需额外标签查询。
 * circles/[id] 的 GET 与 PUT(更新后回查)都会调用 fetchCircleDetail。
 */
function enqueueFetchCircleDetail(
  queue: Record<string, unknown>[][],
  circle: CircleRow,
  creator: { id: string; name: string; avatarUrl: string | null } | null,
  contactCount: number
) {
  // 1. circle 行(含 tags 数组)
  queue.push([circle])
  // 2. creator 行(select 部分字段)
  queue.push(creator ? [creator] : [])
  // 3. contact count 行
  queue.push([{ value: contactCount }])
}

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb.insert.mockClear()
  mockDb.update.mockClear()
  chainInsert.values.mockClear()
  insertReturningMock.mockReset()
  chainUpdate.set.mockClear()
  updateWhereMock.mockClear()
  readUserFromTokenMock.mockReset()
  setSelectResultsQueue([])
})

describe("POST /api/circles", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await POST(
      makeJsonRequest(VALID_CIRCLE_BODY, "/api/circles")
    )
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(401)
    expect(body.message).toBe("未登录或登录已过期")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 403 when USER role (non-TEACHER)", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    const res = await POST(
      makeJsonRequest(VALID_CIRCLE_BODY, "/api/circles")
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(403)
    expect(body.message).toContain("教师认证")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("creates circle successfully and returns 201 with circleId", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    // select 1: 24h 配额校验(0 个近期圈子)
    // select 2: 标签名称存在性校验(2 个 approved 标签)
    setSelectResultsQueue([[], [makeTagRow(), makeTagRow({ name: TAG_NAME_2 })]])
    // insert circles returning {id}
    const newCircleId = "new-circle-uuid"
    insertReturningMock.mockResolvedValue([{ id: newCircleId }])

    const res = await POST(
      makeJsonRequest(VALID_CIRCLE_BODY, "/api/circles")
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as IResponse<{
      circleId: string
      status: string
    }>
    expect(body.code).toBe(201)
    expect(body.data.circleId).toBe(newCircleId)
    expect(body.data.status).toBe("pending")
    // 验证 insert 链路:circles + circleMembers = 2 次(无桥接表)
    expect(mockDb.insert).toHaveBeenCalledTimes(2)
    // circles insert 应有 returning
    expect(insertReturningMock).toHaveBeenCalledTimes(1)
    // circles insert 的 values 应包含 tags 名称数组
    const valuesCalls = chainInsert.values.mock.calls
    const circleInsert = valuesCalls.find((call) => {
      const v = call[0] as Record<string, unknown> | undefined
      return !!v && v.title === VALID_CIRCLE_BODY.title
    })
    expect(circleInsert).toBeDefined()
    const insertArg = circleInsert![0] as Record<string, unknown>
    expect(insertArg.tags).toEqual([TAG_NAME_1, TAG_NAME_2])
  })

  it("returns 429 when 24h quota reached (5 existing circles)", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    // 24h 内已有 5 个圈子
    setSelectResultsQueue([
      [
        { id: "c1" },
        { id: "c2" },
        { id: "c3" },
        { id: "c4" },
        { id: "c5" },
      ],
    ])

    const res = await POST(
      makeJsonRequest(VALID_CIRCLE_BODY, "/api/circles")
    )
    expect(res.status).toBe(429)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(429)
    expect(body.message).toContain("24")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when a tag name does not exist or is not approved", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    // 配额通过,但标签校验只返回 1 个(另一个名称缺失/未审核)
    setSelectResultsQueue([[], [makeTagRow()]])

    const res = await POST(
      makeJsonRequest(VALID_CIRCLE_BODY, "/api/circles")
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.details).toEqual({ missingTags: [TAG_NAME_2] })
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when title is too short", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const res = await POST(
      makeJsonRequest(
        { ...VALID_CIRCLE_BODY, title: "a" },
        "/api/circles"
      )
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when both contactPhone and wechat are missing", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const { contactPhone: _p, wechat: _w, ...rest } = VALID_CIRCLE_BODY
    void _p
    void _w
    const res = await POST(makeJsonRequest(rest, "/api/circles"))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid request body")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when tags is empty", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const res = await POST(
      makeJsonRequest({ ...VALID_CIRCLE_BODY, tags: [] }, "/api/circles")
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 on malformed json", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const res = await POST(makeJsonRequest("not-json", "/api/circles"))
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("accepts only contactPhone without wechat", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    setSelectResultsQueue([[], [makeTagRow(), makeTagRow({ name: TAG_NAME_2 })]])
    insertReturningMock.mockResolvedValue([{ id: "c-phone-only" }])
    const { wechat: _w, ...rest } = VALID_CIRCLE_BODY
    void _w
    const res = await POST(makeJsonRequest(rest, "/api/circles"))
    expect(res.status).toBe(201)
  })

  it("accepts coverImages and persists them on insert", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    setSelectResultsQueue([[], [makeTagRow(), makeTagRow({ name: TAG_NAME_2 })]])
    insertReturningMock.mockResolvedValue([{ id: "c-with-covers" }])
    const coverImages = [
      "https://example.com/a.jpg",
      "https://example.com/b.jpg",
    ]
    const res = await POST(
      makeJsonRequest(
        { ...VALID_CIRCLE_BODY, coverImages },
        "/api/circles"
      )
    )
    expect(res.status).toBe(201)
    // 验证 circles insert 链路的 values 至少一次传入 coverImages
    const allValuesCalls = chainInsert.values.mock.calls
    const persisted = allValuesCalls.some((call) => {
      const v = call[0] as Record<string, unknown> | undefined
      return (
        !!v &&
        Array.isArray(v.coverImages) &&
        v.coverImages.length === coverImages.length &&
        (v.coverImages as string[])[0] === coverImages[0]
      )
    })
    expect(persisted).toBe(true)
  })

  it("returns 400 when coverImages has more than 9 items", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const coverImages = Array.from(
      { length: 10 },
      (_, i) => `https://example.com/${i}.jpg`
    )
    const res = await POST(
      makeJsonRequest(
        { ...VALID_CIRCLE_BODY, coverImages },
        "/api/circles"
      )
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when coverImages item is not a valid URL", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const res = await POST(
      makeJsonRequest(
        { ...VALID_CIRCLE_BODY, coverImages: ["not-a-url"] },
        "/api/circles"
      )
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})

describe("GET /api/circles/:id", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await getCircleById(
      makeGetRequest("/api/circles/circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(401)
    expect(body.message).toBe("未登录或登录已过期")
  })

  it("returns 200 with CircleDetailDTO on success", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    const circle = makeCircleRow()
    const creator = {
      id: TEACHER_USER.id,
      name: "Teacher",
      avatarUrl: null,
    }
    // fetchCircleDetail 的 3 个 select
    const queue: Record<string, unknown>[][] = []
    enqueueFetchCircleDetail(queue, circle, creator, 3)
    setSelectResultsQueue(queue)

    const res = await getCircleById(
      makeGetRequest("/api/circles/circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<CircleDetailDTO>
    expect(body.code).toBe(200)
    expect(body.data.id).toBe("circle-1")
    expect(body.data.title).toBe("陈氏太极拳晨练班")
    expect(body.data.creator.id).toBe(TEACHER_USER.id)
    expect(body.data.creator.name).toBe("Teacher")
    expect(body.data.tags).toEqual([TAG_NAME_1, TAG_NAME_2])
    expect(body.data.contactCount).toBe(3)
    expect(body.data.memberCount).toBe(8)
  })

  it("returns 404 when circle does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    // fetchCircleDetail 第 1 个 select 返回空(circle 不存在)
    setSelectResultsQueue([[]])

    const res = await getCircleById(
      makeGetRequest("/api/circles/nonexistent"),
      makeContext("nonexistent")
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(404)
    expect(body.message).toBe("圈子不存在")
  })

  it("returns 404 when non-creator accesses non-active circle", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    const offlineCircle = makeCircleRow({
      status: "offline",
      creatorId: TEACHER_USER.id,
    })
    // fetchCircleDetail:circle 行(offline)+ creator + count
    const queue: Record<string, unknown>[][] = []
    enqueueFetchCircleDetail(
      queue,
      offlineCircle,
      { id: TEACHER_USER.id, name: "Teacher", avatarUrl: null },
      0
    )
    setSelectResultsQueue(queue)

    const res = await getCircleById(
      makeGetRequest("/api/circles/circle-1"),
      makeContext("circle-1")
    )
    // 非创建者 + 非 active → 404
    expect(res.status).toBe(404)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(404)
    expect(body.message).toBe("圈子不存在")
  })

  it("allows creator to access own non-active circle", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const offlineCircle = makeCircleRow({ status: "offline" })
    const queue: Record<string, unknown>[][] = []
    enqueueFetchCircleDetail(
      queue,
      offlineCircle,
      { id: TEACHER_USER.id, name: "Teacher", avatarUrl: null },
      0
    )
    setSelectResultsQueue(queue)

    const res = await getCircleById(
      makeGetRequest("/api/circles/circle-1"),
      makeContext("circle-1")
    )
    // 创建者可访问自己的非 active 圈子
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<CircleDetailDTO>
    expect(body.data.status).toBe("offline")
  })
})

describe("PUT /api/circles/:id", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await putCircle(
      makePutRequest({ title: "新标题" }, "/api/circles/circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(401)
  })

  it("returns 403 when non-creator tries to update", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    const circle = makeCircleRow({ creatorId: TEACHER_USER.id })
    // select circle (creator check)
    setSelectResultsQueue([[circle]])

    const res = await putCircle(
      makePutRequest({ title: "新标题" }, "/api/circles/circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(403)
    expect(body.message).toContain("无权")
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 404 when circle does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    setSelectResultsQueue([[]])

    const res = await putCircle(
      makePutRequest({ title: "新标题" }, "/api/circles/nonexistent"),
      makeContext("nonexistent")
    )
    expect(res.status).toBe(404)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("updates title successfully and returns updated detail", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const circle = makeCircleRow()
    const updatedCircle = makeCircleRow({ title: "新标题" })
    const creator = {
      id: TEACHER_USER.id,
      name: "Teacher",
      avatarUrl: null,
    }
    // 队列:1) creator check select 2-4) fetchCircleDetail 的 3 个 select
    const queue: Record<string, unknown>[][] = [[circle]]
    enqueueFetchCircleDetail(queue, updatedCircle, creator, 0)
    setSelectResultsQueue(queue)

    const res = await putCircle(
      makePutRequest({ title: "新标题" }, "/api/circles/circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<CircleDetailDTO>
    expect(body.code).toBe(200)
    expect(body.data.title).toBe("新标题")
    // update 应被调用
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(chainUpdate.set).toHaveBeenCalledTimes(1)
    expect(updateWhereMock).toHaveBeenCalledTimes(1)
  })

  it("updates coverImages and writes them to db (with full replacement)", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const oldCircle = makeCircleRow({
      coverImages: ["https://old/1.jpg"],
    })
    const newCoverImages = [
      "https://new/1.jpg",
      "https://new/2.jpg",
      "https://new/3.jpg",
    ]
    const updatedCircle = makeCircleRow({ coverImages: newCoverImages })
    const creator = {
      id: TEACHER_USER.id,
      name: "Teacher",
      avatarUrl: null,
    }
    // 队列:1) creator check 2-4) fetchCircleDetail
    const queue: Record<string, unknown>[][] = [[oldCircle]]
    enqueueFetchCircleDetail(queue, updatedCircle, creator, 0)
    setSelectResultsQueue(queue)

    const res = await putCircle(
      makePutRequest(
        { coverImages: newCoverImages },
        "/api/circles/circle-1"
      ),
      makeContext("circle-1")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<CircleDetailDTO>
    expect(body.data.coverImages).toEqual(newCoverImages)
    // 验证 update.set 调用包含 coverImages 全量替换
    expect(chainUpdate.set).toHaveBeenCalledTimes(1)
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(setArg.coverImages).toEqual(newCoverImages)
    expect(setArg.updatedAt).toBeInstanceOf(Date)
  })

  it("can clear coverImages by passing empty array", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const oldCircle = makeCircleRow({
      coverImages: ["https://old/1.jpg", "https://old/2.jpg"],
    })
    const clearedCircle = makeCircleRow({ coverImages: [] })
    const creator = {
      id: TEACHER_USER.id,
      name: "Teacher",
      avatarUrl: null,
    }
    const queue: Record<string, unknown>[][] = [[oldCircle]]
    enqueueFetchCircleDetail(queue, clearedCircle, creator, 0)
    setSelectResultsQueue(queue)

    const res = await putCircle(
      makePutRequest({ coverImages: [] }, "/api/circles/circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<CircleDetailDTO>
    expect(body.data.coverImages).toEqual([])
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(setArg.coverImages).toEqual([])
  })

  it("returns 400 when PUT coverImages exceeds 9 items", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const circle = makeCircleRow()
    setSelectResultsQueue([[circle]])

    const coverImages = Array.from(
      { length: 10 },
      (_, i) => `https://example.com/${i}.jpg`
    )
    const res = await putCircle(
      makePutRequest({ coverImages }, "/api/circles/circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("replaces tags directly via update when provided", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const circle = makeCircleRow()
    const updatedCircle = makeCircleRow({ tags: [TAG_NAME_2] })
    const creator = {
      id: TEACHER_USER.id,
      name: "Teacher",
      avatarUrl: null,
    }
    // 队列:1) creator check 2) 标签名称校验 3-5) fetchCircleDetail
    const queue: Record<string, unknown>[][] = [[circle], [makeTagRow({ name: TAG_NAME_2 })]]
    enqueueFetchCircleDetail(queue, updatedCircle, creator, 0)
    setSelectResultsQueue(queue)

    const res = await putCircle(
      makePutRequest(
        { tags: [TAG_NAME_2] },
        "/api/circles/circle-1"
      ),
      makeContext("circle-1")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<CircleDetailDTO>
    expect(body.data.tags).toEqual([TAG_NAME_2])
    // 直接 update,无事务
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.tags).toEqual([TAG_NAME_2])
  })

  it("returns 400 when tag name does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const circle = makeCircleRow()
    // creator check 通过,但标签校验失败(仅返回 1 个)
    setSelectResultsQueue([[circle], [makeTagRow({ name: TAG_NAME_1 })]])

    const res = await putCircle(
      makePutRequest({ tags: [TAG_NAME_1, "不存在的标签"] }, "/api/circles/circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 when title is too short", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const circle = makeCircleRow()
    setSelectResultsQueue([[circle]])

    const res = await putCircle(
      makePutRequest({ title: "a" }, "/api/circles/circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 when refining contact fails (both empty)", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const circle = makeCircleRow()
    setSelectResultsQueue([[circle]])

    const res = await putCircle(
      makePutRequest(
        { contactPhone: "", wechat: "" },
        "/api/circles/circle-1"
      ),
      makeContext("circle-1")
    )
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/circles/:id", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await deleteCircle(
      makeDeleteRequest("/api/circles/circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(401)
  })

  it("soft-deletes circle successfully (status=deleted)", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const circle = makeCircleRow()
    setSelectResultsQueue([[circle]])

    const res = await deleteCircle(
      makeDeleteRequest("/api/circles/circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ id: string }>
    expect(body.code).toBe(200)
    expect(body.data.id).toBe("circle-1")
    // 验证软删除 update 被调用
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(chainUpdate.set).toHaveBeenCalledTimes(1)
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >
    expect(setArg.status).toBe("deleted")
    expect(setArg.updatedAt).toBeInstanceOf(Date)
  })

  it("returns 403 when non-creator tries to delete", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    const circle = makeCircleRow({ creatorId: TEACHER_USER.id })
    setSelectResultsQueue([[circle]])

    const res = await deleteCircle(
      makeDeleteRequest("/api/circles/circle-1"),
      makeContext("circle-1")
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(403)
    expect(body.message).toContain("无权")
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 404 when circle does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    setSelectResultsQueue([[]])

    const res = await deleteCircle(
      makeDeleteRequest("/api/circles/nonexistent"),
      makeContext("nonexistent")
    )
    expect(res.status).toBe(404)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})

describe("GET /api/circles/mine", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await getMyCircles(makeGetRequest("/api/circles/mine"))
    expect(res.status).toBe(401)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(401)
    expect(body.message).toBe("未登录或登录已过期")
  })

  it("returns paginated list of own circles", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const circle1 = makeCircleRow({ id: "c1" })
    const circle2 = makeCircleRow({ id: "c2" })
    // 1) 分页查询返回 2 行 2) 总数查询返回 3 行(total=3)
    setSelectResultsQueue([[circle1, circle2], [{ id: "c1" }, { id: "c2" }, { id: "c3" }]])

    const res = await getMyCircles(
      makeGetRequest("/api/circles/mine", { page: "1", pageSize: "20" })
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<CircleDTO>>
    expect(body.code).toBe(200)
    expect(body.data.list).toHaveLength(2)
    expect(body.data.list[0]!.id).toBe("c1")
    expect(body.data.total).toBe(3)
    expect(body.data.page).toBe(1)
    expect(body.data.pageSize).toBe(20)
  })

  it("returns 400 when page is 0 (invalid pagination)", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const res = await getMyCircles(
      makeGetRequest("/api/circles/mine", { page: "0" })
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(400)
    expect(body.message).toBe("Invalid pagination parameters")
  })
})
