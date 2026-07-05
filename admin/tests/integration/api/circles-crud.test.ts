import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 圈子 CRUD 集成测试(POST / GET / PUT / DELETE + GET /mine)。
 *
 * 覆盖:
 * - POST: 401 / 403(非 TEACHER) / 201 成功 / 400(校验失败) / 429(24h 配额) / 400(无联系方式)
 * - GET [id]: 401 / 200 成功(含 creator/tags/contactCount) / 404(不存在) / 404(非创建者访问非 active)
 * - PUT [id]: 401 / 403(非创建者) / 200 成功(含 tagIds 全量替换) / 404 / 400(校验失败)
 * - DELETE [id]: 401 / 403(非创建者) / 200 软删除 / 404
 * - GET /mine: 401 / 200 分页列表
 *
 * mock 层级:
 * - @/lib/db:select 队列(每次 db.select() 取队首)+ insert/update/transaction 链
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值
 * - @/lib/logger:避免输出噪音
 * - 不 mock @/lib/search/tag-search,使用真实 toTagDTO(需提供完整 tag row 含 Date 字段)
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
  createdAt: Date
  updatedAt: Date
}

type TagRow = {
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

const {
  mockDb,
  chainInsert,
  chainUpdate,
  insertReturningMock,
  updateWhereMock,
  setSelectResultsQueue,
  transactionSpy,
  txDeleteWhereSpy,
  txInsertValuesSpy,
  readUserFromTokenMock,
} = vi.hoisted(() => {
  // select 队列:每次 db.select() 调用取出队首结果
  const selectResultsQueue: Record<string, unknown>[][] = []

  // 构造 thenable select chain,支持 from/where/innerJoin/orderBy/limit/offset
  function makeSelectChain(result: Record<string, unknown>[]) {
    const chain = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
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
  // values 返回 chain(thenable,resolve undefined),支持无 returning 的 await
  // returning 返回 Promise,支持有 returning 的 await
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

  // update().set(...).where(...) 链(where 可被 await)
  const updateWhereMock = vi.fn(async () => undefined)
  const chainUpdate = {
    set: vi.fn(function (this: unknown) {
      return chainUpdate
    }),
    where: updateWhereMock,
  }

  // 事务 tx mock:tx.delete(...).where() / tx.insert(...).values()
  const txDeleteWhereSpy = vi.fn(async () => undefined)
  const txDeleteChain = { where: txDeleteWhereSpy }
  const txInsertValuesSpy = vi.fn(async () => undefined)
  const txInsertChain = { values: txInsertValuesSpy }
  const transactionTx = {
    delete: vi.fn(() => txDeleteChain),
    insert: vi.fn(() => txInsertChain),
  }

  const mockDb = {
    select: vi.fn(() => makeSelectChain(selectResultsQueue.shift() ?? [])),
    insert: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    update: vi.fn(function (this: unknown) {
      return chainUpdate
    }),
    transaction: vi.fn(
      async (cb: (tx: typeof transactionTx) => Promise<unknown>) => {
        return cb(transactionTx)
      }
    ),
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
    transactionSpy: mockDb.transaction,
    txDeleteWhereSpy,
    txInsertValuesSpy,
    readUserFromTokenMock: vi.fn(),
  }
}) as {
  mockDb: {
    select: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    transaction: ReturnType<typeof vi.fn>
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
  transactionSpy: ReturnType<typeof vi.fn>
  txDeleteWhereSpy: ReturnType<typeof vi.fn>
  txInsertValuesSpy: ReturnType<typeof vi.fn>
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

const TAG_ID_1 = "00000000-0000-4000-8000-000000000001"
const TAG_ID_2 = "00000000-0000-4000-8000-000000000002"

const VALID_CIRCLE_BODY = {
  title: "陈氏太极拳晨练班",
  tagIds: [TAG_ID_1, TAG_ID_2],
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
    createdAt: overrides.createdAt ?? new Date("2026-07-01T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-07-01T00:00:00Z"),
  }
}

function makeTagRow(overrides: Partial<TagRow> = {}): TagRow {
  return {
    id: overrides.id ?? TAG_ID_1,
    name: overrides.name ?? "陈氏太极拳",
    category: overrides.category ?? "武术养生",
    subCategory: overrides.subCategory ?? "太极拳",
    pinyin: overrides.pinyin ?? "chenshitaijiquan",
    pinyinInitials: overrides.pinyinInitials ?? "cstjq",
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
 * 组装 fetchCircleDetail 所需的 4 个 select 结果队列(circle + creator + tags + count)。
 * circles/[id] 的 GET 与 PUT(更新后回查)都会调用 fetchCircleDetail。
 */
function enqueueFetchCircleDetail(
  queue: Record<string, unknown>[][],
  circle: CircleRow,
  creator: { id: string; name: string; avatarUrl: string | null } | null,
  tags: TagRow[],
  contactCount: number
) {
  // 1. circle 行
  queue.push([circle])
  // 2. creator 行(select 部分字段)
  queue.push(creator ? [creator] : [])
  // 3. tags 行(innerJoin 结果,每项含 .tags 属性)
  queue.push(tags.map((t) => ({ tags: t })))
  // 4. contact count 行
  queue.push([{ value: contactCount }])
}

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb.insert.mockClear()
  mockDb.update.mockClear()
  mockDb.transaction.mockClear()
  chainInsert.values.mockClear()
  insertReturningMock.mockReset()
  chainUpdate.set.mockClear()
  updateWhereMock.mockClear()
  transactionSpy.mockClear()
  txDeleteWhereSpy.mockClear()
  txInsertValuesSpy.mockClear()
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

  it("returns 403 when role is USER (not TEACHER)", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    const res = await POST(
      makeJsonRequest(VALID_CIRCLE_BODY, "/api/circles")
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as IResponse<null>
    expect(body.code).toBe(403)
    expect(body.message).toContain("TEACHER")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("creates circle successfully and returns 201 with circleId", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    // select 24h 配额校验:返回空数组(0 个近期圈子)
    setSelectResultsQueue([[]])
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
    expect(body.data.status).toBe("active")
    // 验证 insert 链路:circles + circleTags + circleMembers = 3 次
    expect(mockDb.insert).toHaveBeenCalledTimes(3)
    // circles insert 应有 returning
    expect(insertReturningMock).toHaveBeenCalledTimes(1)
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

  it("returns 400 when tagIds is empty", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const res = await POST(
      makeJsonRequest({ ...VALID_CIRCLE_BODY, tagIds: [] }, "/api/circles")
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
    setSelectResultsQueue([[]])
    insertReturningMock.mockResolvedValue([{ id: "c-phone-only" }])
    const { wechat: _w, ...rest } = VALID_CIRCLE_BODY
    void _w
    const res = await POST(makeJsonRequest(rest, "/api/circles"))
    expect(res.status).toBe(201)
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
    const tags = [makeTagRow({ id: TAG_ID_1 }), makeTagRow({ id: TAG_ID_2 })]
    // fetchCircleDetail 的 4 个 select
    const queue: Record<string, unknown>[][] = []
    enqueueFetchCircleDetail(queue, circle, creator, tags, 3)
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
    expect(body.data.tags).toHaveLength(2)
    expect(body.data.tags[0]!.id).toBe(TAG_ID_1)
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
    // fetchCircleDetail:circle 行(offline)+ creator + tags + count
    const queue: Record<string, unknown>[][] = []
    enqueueFetchCircleDetail(
      queue,
      offlineCircle,
      { id: TEACHER_USER.id, name: "Teacher", avatarUrl: null },
      [],
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
      [],
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
    // 队列:1) creator check select 2-5) fetchCircleDetail 的 4 个 select
    const queue: Record<string, unknown>[][] = [[circle]]
    enqueueFetchCircleDetail(queue, updatedCircle, creator, [], 0)
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
    // 不应触发事务(未提供 tagIds)
    expect(transactionSpy).not.toHaveBeenCalled()
  })

  it("replaces tagIds via transaction when provided", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const circle = makeCircleRow()
    const updatedCircle = makeCircleRow()
    const newTags = [makeTagRow({ id: TAG_ID_2 })]
    const creator = {
      id: TEACHER_USER.id,
      name: "Teacher",
      avatarUrl: null,
    }
    // 队列:1) creator check 2-5) fetchCircleDetail
    const queue: Record<string, unknown>[][] = [[circle]]
    enqueueFetchCircleDetail(queue, updatedCircle, creator, newTags, 0)
    setSelectResultsQueue(queue)

    const res = await putCircle(
      makePutRequest(
        { tagIds: [TAG_ID_2] },
        "/api/circles/circle-1"
      ),
      makeContext("circle-1")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<CircleDetailDTO>
    expect(body.data.tags).toHaveLength(1)
    expect(body.data.tags[0]!.id).toBe(TAG_ID_2)
    // 事务应被调用(删除旧 tag + 插入新 tag)
    expect(transactionSpy).toHaveBeenCalledTimes(1)
    expect(txDeleteWhereSpy).toHaveBeenCalledTimes(1)
    expect(txInsertValuesSpy).toHaveBeenCalledTimes(1)
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
