import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 教师后台圈子 API 集成测试。
 *
 * 覆盖:
 * - POST   /api/teacher/circles
 *     401 未登录 / 403 USER 角色 / 400 校验失败 / 400 标签未通过审核 /
 *     429 24h 配额 / 201 新建(复用 lib/circles 的 createCircle)
 * - PATCH  /api/teacher/circles/:circleId
 *     401 / 403 非创建者且非 ADMIN / 403 非法状态转换(pending → active) /
 *     400 空 body / 400 非法 status / 400 标签未通过审核 /
 *     200 字段更新 / 200 自主上下线 / 200 ADMIN 代管
 *
 * mock 层级与 circles-crud.test.ts 一致:
 * - @/lib/db:select 队列 + insert/update 链
 * - @/auth:requireTeacher 走的 cookie session
 * - @/lib/auth/session-token:requireSession 走 token(本文件不涉及,占位避免真读 cookie)
 * - @/lib/logger:静默
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
  coverImages: string[]
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

const {
  mockDb,
  chainInsert,
  chainUpdate,
  insertReturningMock,
  updateReturningMock,
  setSelectResultsQueue,
  authMock,
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
    onConflictDoNothing: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    returning: insertReturningMock,
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(undefined).then(resolve, reject),
  }

  const updateReturningMock = vi.fn()
  const chainUpdate = {
    set: vi.fn(function (this: unknown) {
      return chainUpdate
    }),
    where: vi.fn(() => chainUpdate),
    returning: updateReturningMock,
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(undefined).then(resolve, reject),
  }

  const mockDb = {
    select: vi.fn(() => makeSelectChain(selectResultsQueue.shift() ?? [])),
    insert: vi.fn(() => chainInsert),
    update: vi.fn(() => chainUpdate),
  }

  return {
    mockDb,
    chainInsert,
    chainUpdate,
    insertReturningMock,
    updateReturningMock,
    setSelectResultsQueue: (results: Record<string, unknown>[][]) => {
      selectResultsQueue.length = 0
      selectResultsQueue.push(...results)
    },
    authMock: vi.fn(),
  }
}) as {
  mockDb: {
    select: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  chainInsert: { values: ReturnType<typeof vi.fn>; returning: ReturnType<typeof vi.fn> }
  chainUpdate: {
    set: ReturnType<typeof vi.fn>
    where: ReturnType<typeof vi.fn>
    returning: ReturnType<typeof vi.fn>
  }
  insertReturningMock: ReturnType<typeof vi.fn>
  updateReturningMock: ReturnType<typeof vi.fn>
  setSelectResultsQueue: (results: Record<string, unknown>[][]) => void
  authMock: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/db", () => ({ db: mockDb }))
vi.mock("@/auth", () => ({ auth: authMock }))
vi.mock("@/lib/auth/session-token", () => ({ readUserFromToken: vi.fn() }))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { CIRCLE: "CIRCLE" },
}))

import { POST as postCircle } from "@/app/api/teacher/circles/route"
import { PATCH as patchCircle } from "@/app/api/teacher/circles/[circleId]/route"
import type { CircleDTO, IResponse } from "@/types/api"

const TEACHER_ID = "11111111-1111-1111-1111-111111111111"
const OTHER_TEACHER_ID = "44444444-4444-4444-4444-444444444444"
const ADMIN_ID = "33333333-3333-3333-3333-333333333333"
/** 路径参数必须是合法 uuid(路由有 isUuid 前置校验,假 id 会直接 400) */
const CIRCLE_ID = "99999999-9999-4999-8999-999999999999"
const MISSING_CIRCLE_ID = "00000000-0000-4000-8000-000000000000"

const TEACHER = { id: TEACHER_ID, role: "TEACHER", email: "t@e.com", name: "T" }
const OTHER_TEACHER = {
  id: OTHER_TEACHER_ID,
  role: "TEACHER",
  email: "t2@e.com",
  name: "T2",
}
const ADMIN = { id: ADMIN_ID, role: "ADMIN", email: "a@e.com", name: "A" }
const USER = { id: "22222222-2222-2222-2222-222222222222", role: "USER", email: "u@e.com", name: "U" }

function sessionOf(user: unknown) {
  return user ? { user, expires: "2099-01-01" } : null
}

function makeCircleRow(overrides: Partial<CircleRow> = {}): CircleRow {
  return {
    id: overrides.id ?? CIRCLE_ID,
    title: overrides.title ?? "陈氏太极拳晨练班",
    description: overrides.description ?? "描述",
    creatorId: overrides.creatorId ?? TEACHER_ID,
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
    tags: overrides.tags ?? ["太极拳"],
    createdAt: overrides.createdAt ?? new Date("2026-07-01T00:00:00Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-07-01T00:00:00Z"),
  }
}

const VALID_CIRCLE_BODY = {
  title: "陈氏太极拳晨练班",
  tags: ["太极拳"],
  description: "每周二、四早晨在朝阳公园练习陈氏太极拳,欢迎有一定基础的拳友加入。",
  latitude: 39.9042,
  longitude: 116.4074,
  address: "北京市朝阳区朝阳公园",
  contactPhone: "13800138000",
}

function makeJsonRequest(
  body: unknown,
  path: string,
  method: "POST" | "PATCH" = "POST"
): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

type CircleContext = { params: Promise<{ circleId: string }> }
function makeContext(circleId: string): CircleContext {
  return { params: Promise.resolve({ circleId }) }
}

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb.insert.mockClear()
  mockDb.update.mockClear()
  chainInsert.values.mockClear()
  insertReturningMock.mockReset()
  chainUpdate.set.mockClear()
  chainUpdate.where.mockClear()
  updateReturningMock.mockReset()
  authMock.mockReset()
  setSelectResultsQueue([])
})

describe("POST /api/teacher/circles", () => {
  it("returns 401 when not logged in", async () => {
    authMock.mockResolvedValue(null)
    const res = await postCircle(makeJsonRequest(VALID_CIRCLE_BODY, "/api/teacher/circles"))
    expect(res.status).toBe(401)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 403 when the session role is USER", async () => {
    authMock.mockResolvedValue(sessionOf(USER))
    const res = await postCircle(makeJsonRequest(VALID_CIRCLE_BODY, "/api/teacher/circles"))
    expect(res.status).toBe(403)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when the body fails validation", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    const res = await postCircle(
      makeJsonRequest({ ...VALID_CIRCLE_BODY, title: "a" }, "/api/teacher/circles")
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 429 when the 24h quota is reached", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([
      Array.from({ length: 5 }, (_, i) => ({ id: `c${i}` })),
    ])
    const res = await postCircle(makeJsonRequest(VALID_CIRCLE_BODY, "/api/teacher/circles"))
    expect(res.status).toBe(429)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toContain("24")
  })

  it("returns 400 when a tag is not approved", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[], []])
    const res = await postCircle(makeJsonRequest(VALID_CIRCLE_BODY, "/api/teacher/circles"))
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.details).toEqual({ missingTags: ["太极拳"] })
  })

  it("creates the circle as pending and returns 201", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[], [{ name: "太极拳" }]])
    insertReturningMock.mockResolvedValue([{ id: "new-circle-id" }])

    const res = await postCircle(makeJsonRequest(VALID_CIRCLE_BODY, "/api/teacher/circles"))

    expect(res.status).toBe(201)
    const body = (await res.json()) as IResponse<{ circleId: string; status: string }>
    expect(body.data.circleId).toBe("new-circle-id")
    expect(body.data.status).toBe("pending")
    const circleInsert = chainInsert.values.mock.calls.find((call) => {
      const v = call[0] as Record<string, unknown> | undefined
      return !!v && v.title === VALID_CIRCLE_BODY.title
    })
    expect((circleInsert![0] as Record<string, unknown>).creatorId).toBe(TEACHER_ID)
  })

  it("allows ADMIN to create a circle", async () => {
    authMock.mockResolvedValue(sessionOf(ADMIN))
    setSelectResultsQueue([[], [{ name: "太极拳" }]])
    insertReturningMock.mockResolvedValue([{ id: "admin-circle" }])
    const res = await postCircle(makeJsonRequest(VALID_CIRCLE_BODY, "/api/teacher/circles"))
    expect(res.status).toBe(201)
  })
})

describe("PATCH /api/teacher/circles/:circleId", () => {
  it("returns 401 when not logged in", async () => {
    authMock.mockResolvedValue(null)
    const res = await patchCircle(
      makeJsonRequest({ title: "新标题" }, `/api/teacher/circles/${CIRCLE_ID}`, "PATCH"),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(401)
  })

  it("returns 403 when the session role is USER", async () => {
    authMock.mockResolvedValue(sessionOf(USER))
    const res = await patchCircle(
      makeJsonRequest({ title: "新标题" }, `/api/teacher/circles/${CIRCLE_ID}`, "PATCH"),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(403)
  })

  it("returns 404 when the circle does not exist", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[]])
    const res = await patchCircle(
      makeJsonRequest({ title: "新标题" }, `/api/teacher/circles/${MISSING_CIRCLE_ID}`, "PATCH"),
      makeContext(MISSING_CIRCLE_ID)
    )
    expect(res.status).toBe(404)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 403 when another teacher tries to edit", async () => {
    authMock.mockResolvedValue(sessionOf(OTHER_TEACHER))
    setSelectResultsQueue([[makeCircleRow({ creatorId: TEACHER_ID })]])
    const res = await patchCircle(
      makeJsonRequest({ title: "新标题" }, `/api/teacher/circles/${CIRCLE_ID}`, "PATCH"),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("allows ADMIN to edit someone else's circle (代管)", async () => {
    authMock.mockResolvedValue(sessionOf(ADMIN))
    setSelectResultsQueue([[makeCircleRow({ creatorId: TEACHER_ID })]])
    updateReturningMock.mockResolvedValue([makeCircleRow({ title: "管理员改的标题" })])

    const res = await patchCircle(
      makeJsonRequest({ title: "管理员改的标题" }, `/api/teacher/circles/${CIRCLE_ID}`, "PATCH"),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<CircleDTO>
    expect(body.data.title).toBe("管理员改的标题")
  })

  it("returns 403 when trying to activate a pending circle (防绕过审核)", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeCircleRow({ status: "pending" })]])

    const res = await patchCircle(
      makeJsonRequest({ status: "active" }, `/api/teacher/circles/${CIRCLE_ID}`, "PATCH"),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(403)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toContain("审核")
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 when status is not an owner-controllable value", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeCircleRow()]])
    const res = await patchCircle(
      makeJsonRequest({ status: "violated" }, `/api/teacher/circles/${CIRCLE_ID}`, "PATCH"),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("takes a circle offline (active → offline)", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeCircleRow({ status: "active" })]])
    updateReturningMock.mockResolvedValue([makeCircleRow({ status: "offline" })])

    const res = await patchCircle(
      makeJsonRequest({ status: "offline" }, `/api/teacher/circles/${CIRCLE_ID}`, "PATCH"),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(200)
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.status).toBe("offline")
    expect(setArg.updatedAt).toBeInstanceOf(Date)
  })

  it("brings an offline circle back online (offline → active)", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeCircleRow({ status: "offline" })]])
    updateReturningMock.mockResolvedValue([makeCircleRow({ status: "active" })])

    const res = await patchCircle(
      makeJsonRequest({ status: "active" }, `/api/teacher/circles/${CIRCLE_ID}`, "PATCH"),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(200)
    expect((chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>).status).toBe("active")
  })

  it("returns 400 when no updatable field is provided", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeCircleRow()]])
    const res = await patchCircle(
      makeJsonRequest({}, `/api/teacher/circles/${CIRCLE_ID}`, "PATCH"),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 when a provided tag is not approved", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeCircleRow()], []])
    const res = await patchCircle(
      makeJsonRequest({ tags: ["不存在的标签"] }, `/api/teacher/circles/${CIRCLE_ID}`, "PATCH"),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("edits location and covers", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeCircleRow()]])
    const coverImages = ["https://cdn.example.com/a.png"]
    updateReturningMock.mockResolvedValue([
      makeCircleRow({
        address: "上海市黄浦区",
        latitude: 31.2304,
        longitude: 121.4737,
        coverImages,
      }),
    ])

    const res = await patchCircle(
      makeJsonRequest(
        {
          address: "上海市黄浦区",
          latitude: 31.2304,
          longitude: 121.4737,
          coverImages,
        },
        `/api/teacher/circles/${CIRCLE_ID}`,
        "PATCH"
      ),
      makeContext(CIRCLE_ID)
    )

    expect(res.status).toBe(200)
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.address).toBe("上海市黄浦区")
    expect(setArg.latitude).toBe(31.2304)
    expect(setArg.longitude).toBe(121.4737)
    expect(setArg.coverImages).toEqual(coverImages)
  })

  it("returns 400 when only one of latitude/longitude is provided", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeCircleRow()]])
    const res = await patchCircle(
      makeJsonRequest({ latitude: 31.23 }, `/api/teacher/circles/${CIRCLE_ID}`, "PATCH"),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 400 for a non-uuid circleId (避免 Postgres 22P02 → 500)", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    const res = await patchCircle(
      makeJsonRequest({ title: "新标题" }, "/api/teacher/circles/not-a-uuid", "PATCH"),
      makeContext("not-a-uuid")
    )
    expect(res.status).toBe(400)
    expect(mockDb.select).not.toHaveBeenCalled()
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("returns 403 when activating a pending circle while also editing other fields", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeCircleRow({ status: "pending" })]])

    const res = await patchCircle(
      makeJsonRequest(
        { status: "active", title: "想顺手改个标题" },
        `/api/teacher/circles/${CIRCLE_ID}`,
        "PATCH"
      ),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it.each(["rejected", "violated", "deleted"])(
    "returns 403/400 when the circle is in %s state and status change is attempted",
    async (status) => {
      authMock.mockResolvedValue(sessionOf(TEACHER))
      setSelectResultsQueue([[makeCircleRow({ status })]])
      const res = await patchCircle(
        makeJsonRequest({ status: "active" }, `/api/teacher/circles/${CIRCLE_ID}`, "PATCH"),
        makeContext(CIRCLE_ID)
      )
      // deleted → 400(不可编辑);其余 → 403(需管理员处理)
      expect([400, 403]).toContain(res.status)
      expect(mockDb.update).not.toHaveBeenCalled()
    }
  )

  it("clears contactPhone when the teacher empties it (保留微信)", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeCircleRow()]])
    updateReturningMock.mockResolvedValue([makeCircleRow({ contactPhone: null })])

    const res = await patchCircle(
      makeJsonRequest(
        { contactPhone: "", wechat: "taichi2026" },
        `/api/teacher/circles/${CIRCLE_ID}`,
        "PATCH"
      ),
      makeContext(CIRCLE_ID)
    )

    expect(res.status).toBe(200)
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>
    // 空串必须落成 NULL,而不是被丢弃导致"提示已保存但库里没变"
    expect(setArg.contactPhone).toBeNull()
    expect(setArg.wechat).toBe("taichi2026")
  })

  it("returns 400 when both contact channels are emptied", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    const res = await patchCircle(
      makeJsonRequest(
        { contactPhone: "", wechat: "" },
        `/api/teacher/circles/${CIRCLE_ID}`,
        "PATCH"
      ),
      makeContext(CIRCLE_ID)
    )
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("clears activityTime / maxMembers when submitted as empty or null", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))
    setSelectResultsQueue([[makeCircleRow()]])
    updateReturningMock.mockResolvedValue([
      makeCircleRow({ activityTime: null, maxMembers: null }),
    ])

    const res = await patchCircle(
      makeJsonRequest(
        { activityTime: "", maxMembers: null },
        `/api/teacher/circles/${CIRCLE_ID}`,
        "PATCH"
      ),
      makeContext(CIRCLE_ID)
    )

    expect(res.status).toBe(200)
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.activityTime).toBeNull()
    expect(setArg.maxMembers).toBeNull()
  })
})
