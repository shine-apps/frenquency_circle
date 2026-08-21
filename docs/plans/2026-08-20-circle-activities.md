# 圈子活动发布功能 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让圈子创建者(TEACHER)在圈子下发布"活动",活动包含活动起始时间、富文本活动介绍、活动联系人电话、报名截止时间,并提供表单录入、数据存储与展示的前后端完整实现。

**Architecture:** 新增一张 `activities` 表(外键指向 `circles`),活动 API 完全嵌套在 `/api/circles/[id]/activities` 下(创建者鉴权);富文本以 HTML 字符串存储,uni-app 端用 `<editor>` 录入、`<rich-text>` 展示;活动由圈子创建者直接发布,无需管理员审核(圈子本身已走审核流)。

**Tech Stack:** Next.js 16 + Drizzle ORM + PostgreSQL + Zod 4(后端);uni-app + Vue 3 + TypeScript + wot-ui v2(`wd-datetime-picker`)+ uni-app `<editor>`/`<rich-text>`(前端)。

---

## 关键设计决策(实施前必读)

1. **活动挂在圈子下**:`activities.circleId` 外键 → `circles.id`(`onDelete: "cascade"`),圈子删除时活动级联删除。
2. **活动字段**:除需求点名的 4 个字段外,增加 `title`(活动标题,列表展示必需)与 `status`(`'active' | 'cancelled'`,软取消)。需求"需包含以下属性"为最小集,`title` 是合理补充。
3. **富文本存储**:`description` 存 HTML 字符串(`text` 列)。前端 `<editor>` 只产出受限标签(粗体/斜体/标题/列表/段落等,无脚本),后端用正则白名单式守卫拒绝 `<script` / `<iframe` / `on*=` 事件属性;展示端用 `<rich-text>`(不执行脚本)。
4. **活动状态与可见性**:`active`(默认)/ `cancelled`(软取消)。非创建者只能看到 `active` 活动;创建者可看到自己圈子的全部活动(与圈子 `[id]` 的可见性规则一致)。
5. **鉴权**:所有活动接口走 `requireSession(req)`(Bearer token,与圈子接口一致);写操作(POST/PUT/DELETE)额外校验"当前用户 === 圈子创建者"。
6. **报名截止时间约束**:`registrationDeadline < startTime`(报名截止必须早于活动起始),创建与更新均校验。
7. **日志前缀复用 `LOG_PREFIX.CIRCLE`**:不新增 `ACTIVITY` 前缀,避免改动 `lib/logger.ts` 及所有既有测试里硬编码的 `LOG_PREFIX` mock。
8. **平台差异**:`<editor>` 仅 H5 / 微信小程序支持;抖音小程序(MP-TOUTIAO)降级为 `<textarea>`(纯文本,同样以 `<p>` 包裹后存 HTML,`<rich-text>` 可正常渲染)。
9. **范围**:本期不做管理后台(admin dashboard)的活动管理页;活动由圈子创建者直接发布。

---

## Task 1: 数据层 — 新增 `activities` 表

**Files:**
- Modify: `admin/db/schema.ts`(在 `contactLogs` 表定义之后、`NOTIFICATION_TYPES` 之前插入)

**Step 1: 写入 schema**

在 `admin/db/schema.ts` 中找到 `export type ContactLog = typeof contactLogs.$inferSelect` 与 `export type NewContactLog = typeof contactLogs.$inferInsert` 之后、`/** 通知类型字面量联合 */` 之前,插入:

```ts
/**
 * 活动状态字面量联合:
 * - `active`    正常(默认)
 * - `cancelled` 已取消(软取消,创建者下线)
 */
export const ACTIVITY_STATUSES = ["active", "cancelled"] as const
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

/**
 * 圈子活动(由圈子创建者 TEACHER 发布)。
 * - description 为富文本 HTML 字符串,由前端 <editor> 生成、<rich-text> 展示
 * - registrationDeadline 必须早于 startTime(应用层校验)
 */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    /** 活动标题(1-50 字符) */
    title: text("title").notNull(),
    /** 活动介绍(富文本 HTML 字符串) */
    description: text("description").notNull(),
    /** 活动起始时间 */
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    /** 报名截止时间(必须早于 startTime) */
    registrationDeadline: timestamp("registration_deadline", {
      withTimezone: true,
    }).notNull(),
    /** 活动联系人电话(11 位手机号) */
    contactPhone: text("contact_phone").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("activities_circle_idx").on(table.circleId),
    index("activities_start_time_idx").on(table.startTime),
    index("activities_status_idx").on(table.status),
  ]
)

export type Activity = typeof activities.$inferSelect
export type NewActivity = typeof activities.$inferInsert
```

**Step 2: 类型检查**

Run: `cd admin; node node_modules/typescript/bin/tsc --noEmit`
Expected: PASS(无新增错误)

**Step 3: Commit**

```bash
git add admin/db/schema.ts
git commit -m "feat(schema): add activities table"
```

---

## Task 2: 生成并应用数据库迁移

**Files:**
- Generate: `admin/drizzle/*`(由 drizzle-kit 生成)

**Step 1: 生成迁移 SQL**

Run: `cd admin; node node_modules/drizzle-kit/bin.cjs generate`
Expected: 在 `admin/drizzle/` 下生成 `*.sql` 与 `meta/_journal.json` 更新

**Step 2: 人工 review 生成的 SQL**

确认包含 `CREATE TABLE "activities"` 及三个索引(`activities_circle_idx` / `activities_start_time_idx` / `activities_status_idx`),外键 `ON DELETE CASCADE`。

**Step 3: 应用迁移**

Run: `cd admin; node node_modules/drizzle-kit/bin.cjs migrate`
Expected: 输出迁移成功(数据库需已 `pnpm db:up`)

**Step 4: Commit**

```bash
git add admin/drizzle/
git commit -m "chore(db): migrate add activities table"
```

---

## Task 3: 后端 DTO 与共享校验逻辑

**Files:**
- Create: `admin/lib/activities.ts`(共享 DTO 转换 + zod schema)
- Modify: `admin/types/api.ts`(新增 `ActivityStatus` / `ActivityDTO`)

**Step 1: 新增 DTO 类型**

在 `admin/types/api.ts` 的 `FollowedCircleDTO` 定义之后追加:

```ts
/**
 * 活动状态:active 正常 / cancelled 已取消。
 */
export type ActivityStatus = "active" | "cancelled"

/**
 * 圈子活动 DTO。
 * - description 为富文本 HTML 字符串
 * - startTime / registrationDeadline 为 ISO 8601 字符串
 */
export type ActivityDTO = {
  id: string
  circleId: string
  title: string
  /** 活动介绍(富文本 HTML) */
  description: string
  /** 活动起始时间(ISO 8601) */
  startTime: string
  /** 报名截止时间(ISO 8601) */
  registrationDeadline: string
  /** 活动联系人电话 */
  contactPhone: string
  status: ActivityStatus
  createdAt: string
  updatedAt: string
}
```

**Step 2: 创建共享逻辑 `admin/lib/activities.ts`**

```ts
import { z } from "zod"
import { activities } from "@/db/schema"
import type { ActivityDTO } from "@/types/api"

/** 手机号格式(与 circles route 一致) */
export const PHONE_RE = /^1[3-9]\d{9}$/
/** 活动标题最大长度 */
export const ACTIVITY_TITLE_MAX = 50
/** 活动介绍(富文本 HTML)最大长度 */
export const ACTIVITY_DESCRIPTION_MAX = 20000

/** 不安全的富文本片段守卫(拒绝脚本/iframe/内联事件) */
const UNSAFE_HTML_RE = /<script|<\/script|<iframe|on\w+\s*=/i

/** 将 activities 表行转换为 ActivityDTO */
export function toActivityDTO(row: typeof activities.$inferSelect): ActivityDTO {
  return {
    id: row.id,
    circleId: row.circleId,
    title: row.title,
    description: row.description,
    startTime: row.startTime.toISOString(),
    registrationDeadline: row.registrationDeadline.toISOString(),
    contactPhone: row.contactPhone,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** 创建活动请求体 schema */
export const createActivitySchema = z
  .object({
    title: z.string().trim().min(1).max(ACTIVITY_TITLE_MAX),
    description: z.string().min(1).max(ACTIVITY_DESCRIPTION_MAX),
    startTime: z.coerce.date(),
    registrationDeadline: z.coerce.date(),
    contactPhone: z.string().regex(PHONE_RE),
  })
  .refine((d) => d.registrationDeadline.getTime() < d.startTime.getTime(), {
    message: "报名截止时间必须早于活动起始时间",
    path: ["registrationDeadline"],
  })
  .refine((d) => !UNSAFE_HTML_RE.test(d.description), {
    message: "活动介绍包含不安全的 HTML 内容",
    path: ["description"],
  })

/** 更新活动请求体 schema(所有字段可选) */
export const updateActivitySchema = z.object({
  title: z.string().trim().min(1).max(ACTIVITY_TITLE_MAX).optional(),
  description: z.string().min(1).max(ACTIVITY_DESCRIPTION_MAX).optional(),
  startTime: z.coerce.date().optional(),
  registrationDeadline: z.coerce.date().optional(),
  contactPhone: z.string().regex(PHONE_RE).optional(),
})

/** 校验更新后的活动时间组合(部分字段缺省时与现有值合并后校验) */
export function validateMergedTimes(
  startTime: Date,
  registrationDeadline: Date
): boolean {
  return registrationDeadline.getTime() < startTime.getTime()
}
```

**Step 3: 类型检查**

Run: `cd admin; node node_modules/typescript/bin/tsc --noEmit`
Expected: PASS

**Step 4: Commit**

```bash
git add admin/lib/activities.ts admin/types/api.ts
git commit -m "feat(activity): add ActivityDTO and shared validation"
```

---

## Task 4: 后端集成测试(先写失败测试)

**Files:**
- Create: `admin/tests/integration/api/circles-activities.test.ts`

**Step 1: 写测试(覆盖 POST / GET list / GET detail / PUT / DELETE)**

按 `admin/tests/integration/api/circles-crud.test.ts` 的 `vi.hoisted` mock 范式编写。mock 层级:`@/lib/db`(select 队列 + insert/update 链)、`@/lib/auth/session-token`、`@/lib/logger`。

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 圈子活动集成测试。
 * 覆盖:
 * - POST   /api/circles/:id/activities:401 / 404(圈子不存在) / 403(非创建者) / 201 成功 / 400(截止时间晚于起始) / 400(危险 HTML) / 400(手机号非法)
 * - GET    /api/circles/:id/activities:401 / 404 / 200 分页(非创建者过滤 cancelled)
 * - GET    /api/circles/:id/activities/:aid:404(非创建者访问 cancelled) / 200
 * - PUT    /api/circles/:id/activities/:aid:403 / 200 / 400(合并后截止时间晚于起始)
 * - DELETE /api/circles/:id/activities/:aid:200 软取消(status=cancelled) / 403
 */

type ActivityRow = {
  id: string
  circleId: string
  title: string
  description: string
  startTime: Date
  registrationDeadline: Date
  contactPhone: string
  status: string
  createdAt: Date
  updatedAt: Date
}

type CircleRow = {
  id: string
  title: string
  creatorId: string
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
}) as any

vi.mock("@/lib/db", () => ({ db: mockDb }))
vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
}))
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { CIRCLE: "CIRCLE" },
}))

import { GET as listActivities, POST as createActivity } from "@/app/api/circles/[id]/activities/route"
import {
  GET as getActivity,
  PUT as putActivity,
  DELETE as deleteActivity,
} from "@/app/api/circles/[id]/activities/[activityId]/route"
import type { ActivityDTO, IResponse, Paginated } from "@/types/api"

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

const CIRCLE_ID = "circle-1"

function makeCircleRow(overrides: Partial<CircleRow> = {}): CircleRow {
  return { id: CIRCLE_ID, title: "太极拳晨练班", creatorId: TEACHER_USER.id, ...overrides }
}

function makeActivityRow(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: "act-1",
    circleId: CIRCLE_ID,
    title: "周六晨练体验课",
    description: "<p>欢迎参加<strong>陈氏太极拳</strong>体验课。</p>",
    startTime: new Date("2026-09-01T07:00:00Z"),
    registrationDeadline: new Date("2026-08-30T23:59:00Z"),
    contactPhone: "13800138000",
    status: "active",
    createdAt: new Date("2026-08-01T00:00:00Z"),
    updatedAt: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  }
}

const VALID_BODY = {
  title: "周六晨练体验课",
  description: "<p>欢迎参加<strong>陈氏太极拳</strong>体验课。</p>",
  startTime: "2026-09-01T07:00:00Z",
  registrationDeadline: "2026-08-30T23:59:00Z",
  contactPhone: "13800138000",
}

function makeJsonRequest(body: unknown, path: string, method = "POST"): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

type RouteContext = { params: Promise<Record<string, string>> }
function makeContext(params: Record<string, string>): RouteContext {
  return { params: Promise.resolve(params) }
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

describe("POST /api/circles/:id/activities", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await createActivity(
      makeJsonRequest(VALID_BODY, "/api/circles/circle-1/activities"),
      makeContext({ id: CIRCLE_ID })
    )
    expect(res.status).toBe(401)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 404 when circle does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    setSelectResultsQueue([[]]) // circle 查询为空
    const res = await createActivity(
      makeJsonRequest(VALID_BODY, "/api/circles/circle-1/activities"),
      makeContext({ id: CIRCLE_ID })
    )
    expect(res.status).toBe(404)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 403 when non-creator tries to create", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    setSelectResultsQueue([[makeCircleRow({ creatorId: TEACHER_USER.id })]])
    const res = await createActivity(
      makeJsonRequest(VALID_BODY, "/api/circles/circle-1/activities"),
      makeContext({ id: CIRCLE_ID })
    )
    expect(res.status).toBe(403)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("creates activity successfully and returns 201 with ActivityDTO", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    setSelectResultsQueue([[makeCircleRow()]])
    const created = makeActivityRow()
    insertReturningMock.mockResolvedValue([created])

    const res = await createActivity(
      makeJsonRequest(VALID_BODY, "/api/circles/circle-1/activities"),
      makeContext({ id: CIRCLE_ID })
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as IResponse<ActivityDTO>
    expect(body.code).toBe(201)
    expect(body.data.id).toBe("act-1")
    expect(body.data.title).toBe(VALID_BODY.title)
    expect(body.data.status).toBe("active")
    // insert values 含 circleId + 字段
    const valuesCalls = chainInsert.values.mock.calls
    const insertArg = valuesCalls.find((c) => c[0]?.title === VALID_BODY.title)?.[0] as Record<string, unknown>
    expect(insertArg.circleId).toBe(CIRCLE_ID)
    expect(insertArg.startTime).toBeInstanceOf(Date)
    expect(insertArg.status).toBe("active")
  })

  it("returns 400 when registrationDeadline is not before startTime", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    setSelectResultsQueue([[makeCircleRow()]])
    const res = await createActivity(
      makeJsonRequest(
        { ...VALID_BODY, registrationDeadline: "2026-09-02T00:00:00Z" },
        "/api/circles/circle-1/activities"
      ),
      makeContext({ id: CIRCLE_ID })
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when description contains script tag", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    setSelectResultsQueue([[makeCircleRow()]])
    const res = await createActivity(
      makeJsonRequest(
        { ...VALID_BODY, description: "<p>hi</p><script>alert(1)</script>" },
        "/api/circles/circle-1/activities"
      ),
      makeContext({ id: CIRCLE_ID })
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 400 when contactPhone is invalid", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    setSelectResultsQueue([[makeCircleRow()]])
    const res = await createActivity(
      makeJsonRequest(
        { ...VALID_BODY, contactPhone: "123" },
        "/api/circles/circle-1/activities"
      ),
      makeContext({ id: CIRCLE_ID })
    )
    expect(res.status).toBe(400)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})

describe("GET /api/circles/:id/activities", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await listActivities(
      makeJsonRequest(undefined, "/api/circles/circle-1/activities", "GET"),
      makeContext({ id: CIRCLE_ID })
    )
    expect(res.status).toBe(401)
  })

  it("returns paginated active activities for non-creator (filters cancelled)", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    const act1 = makeActivityRow()
    const act2 = makeActivityRow({ id: "act-2", status: "cancelled" })
    // select 1: circle(creatorId=TEACHER, 非创建者);select 2: 分页行(仅 active);select 3: 总数行
    setSelectResultsQueue([
      [makeCircleRow({ creatorId: TEACHER_USER.id })],
      [act1],
      [{ id: "act-1" }],
    ])
    const res = await listActivities(
      makeJsonRequest(undefined, "/api/circles/circle-1/activities?page=1&pageSize=20", "GET"),
      makeContext({ id: CIRCLE_ID })
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<ActivityDTO>>
    expect(body.data.list).toHaveLength(1)
    expect(body.data.list[0]!.id).toBe("act-1")
    expect(body.data.total).toBe(1)
  })

  it("returns all activities (incl cancelled) for creator", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const act1 = makeActivityRow()
    const act2 = makeActivityRow({ id: "act-2", status: "cancelled" })
    setSelectResultsQueue([
      [makeCircleRow()],
      [act1, act2],
      [{ id: "act-1" }, { id: "act-2" }],
    ])
    const res = await listActivities(
      makeJsonRequest(undefined, "/api/circles/circle-1/activities", "GET"),
      makeContext({ id: CIRCLE_ID })
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<ActivityDTO>>
    expect(body.data.total).toBe(2)
  })
})

describe("GET /api/circles/:id/activities/:activityId", () => {
  it("returns 404 when non-creator accesses cancelled activity", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    setSelectResultsQueue([
      [makeCircleRow({ creatorId: TEACHER_USER.id })],
      [makeActivityRow({ status: "cancelled" })],
    ])
    const res = await getActivity(
      makeJsonRequest(undefined, "/api/circles/circle-1/activities/act-1", "GET"),
      makeContext({ id: CIRCLE_ID, activityId: "act-1" })
    )
    expect(res.status).toBe(404)
  })

  it("returns 200 with ActivityDTO on success", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    setSelectResultsQueue([
      [makeCircleRow({ creatorId: TEACHER_USER.id })],
      [makeActivityRow()],
    ])
    const res = await getActivity(
      makeJsonRequest(undefined, "/api/circles/circle-1/activities/act-1", "GET"),
      makeContext({ id: CIRCLE_ID, activityId: "act-1" })
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<ActivityDTO>
    expect(body.data.startTime).toBe("2026-09-01T07:00:00.000Z")
  })
})

describe("PUT /api/circles/:id/activities/:activityId", () => {
  it("returns 403 when non-creator updates", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    setSelectResultsQueue([[makeCircleRow({ creatorId: TEACHER_USER.id })]])
    const res = await putActivity(
      makeJsonRequest({ title: "改标题" }, "/api/circles/circle-1/activities/act-1", "PUT"),
      makeContext({ id: CIRCLE_ID, activityId: "act-1" })
    )
    expect(res.status).toBe(403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })

  it("updates activity and returns updated detail", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const existing = makeActivityRow()
    const updated = makeActivityRow({ title: "新标题" })
    // select 1: circle;select 2: activity(existing);select 3: activity(updated, update 后回查)
    setSelectResultsQueue([[makeCircleRow()], [existing], [updated]])
    const res = await putActivity(
      makeJsonRequest({ title: "新标题" }, "/api/circles/circle-1/activities/act-1", "PUT"),
      makeContext({ id: CIRCLE_ID, activityId: "act-1" })
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<ActivityDTO>
    expect(body.data.title).toBe("新标题")
    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })

  it("returns 400 when merged deadline is not before startTime", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    const existing = makeActivityRow() // startTime 2026-09-01T07:00
    setSelectResultsQueue([[makeCircleRow()], [existing]])
    const res = await putActivity(
      makeJsonRequest(
        { registrationDeadline: "2026-09-03T00:00:00Z" },
        "/api/circles/circle-1/activities/act-1",
        "PUT"
      ),
      makeContext({ id: CIRCLE_ID, activityId: "act-1" })
    )
    expect(res.status).toBe(400)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/circles/:id/activities/:activityId", () => {
  it("soft-cancels activity (status=cancelled)", async () => {
    readUserFromTokenMock.mockResolvedValue(TEACHER_USER)
    setSelectResultsQueue([[makeCircleRow()], [makeActivityRow()]])
    const res = await deleteActivity(
      makeJsonRequest(undefined, "/api/circles/circle-1/activities/act-1", "DELETE"),
      makeContext({ id: CIRCLE_ID, activityId: "act-1" })
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ id: string }>
    expect(body.data.id).toBe("act-1")
    const setArg = chainUpdate.set.mock.calls[0]?.[0] as Record<string, unknown>
    expect(setArg.status).toBe("cancelled")
  })

  it("returns 403 when non-creator cancels", async () => {
    readUserFromTokenMock.mockResolvedValue(REGULAR_USER)
    setSelectResultsQueue([[makeCircleRow({ creatorId: TEACHER_USER.id })]])
    const res = await deleteActivity(
      makeJsonRequest(undefined, "/api/circles/circle-1/activities/act-1", "DELETE"),
      makeContext({ id: CIRCLE_ID, activityId: "act-1" })
    )
    expect(res.status).toBe(403)
    expect(mockDb.update).not.toHaveBeenCalled()
  })
})
```

**Step 2: 运行测试,确认失败**

Run: `cd admin; node node_modules/vitest/vitest.mjs run tests/integration/api/circles-activities.test.ts`
Expected: FAIL(导入的 `@/app/api/circles/[id]/activities/route` 与 `[activityId]/route` 文件尚不存在,报 `Failed to resolve import`)

**Step 3: Commit(测试先行)**

```bash
git add admin/tests/integration/api/circles-activities.test.ts
git commit -m "test(activity): add failing integration tests for activities API"
```

---

## Task 5: 实现活动创建/列表路由

**Files:**
- Create: `admin/app/api/circles/[id]/activities/route.ts`

**Step 1: 实现**

```ts
import { and, asc, desc, eq, ne } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles, activities } from "@/db/schema"
import {
  corsOptions,
  fail,
  ok,
  withCors,
  parsePagination,
} from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"
import { createActivitySchema, toActivityDTO } from "@/lib/activities"
import type { ActivityDTO, Paginated } from "@/types/api"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/circles/:id/activities
 *
 * 创建圈子活动(仅圈子创建者可调)。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request, context: RouteContext) {
  const { id: circleId } = await context.params

  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 校验圈子存在且当前用户是创建者
  const [circle] = await db.select().from(circles).where(eq(circles.id, circleId))
  if (!circle) return withCors(fail(404, "圈子不存在"), req)
  if (circle.creatorId !== userId) {
    return withCors(fail(403, "仅圈子创建者可发布活动"), req)
  }

  // 3. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = createActivitySchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  const { title, description, startTime, registrationDeadline, contactPhone } =
    parsed.data

  // 4. 插入活动
  const [row] = await db
    .insert(activities)
    .values({
      circleId,
      title,
      description,
      startTime,
      registrationDeadline,
      contactPhone,
      status: "active",
    })
    .returning()

  logger.info(LOG_PREFIX.CIRCLE, "Activity created", {
    activityId: row.id,
    circleId,
    userId,
  })

  return withCors(ok(toActivityDTO(row), { status: 201 }), req)
}

/**
 * GET /api/circles/:id/activities
 *
 * 返回圈子活动列表(分页,按 startTime 升序)。
 * 非创建者仅可见 active 活动;创建者可见全部(含 cancelled)。
 */
export async function GET(req: Request, context: RouteContext) {
  const { id: circleId } = await context.params

  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 校验圈子存在
  const [circle] = await db.select().from(circles).where(eq(circles.id, circleId))
  if (!circle) return withCors(fail(404, "圈子不存在"), req)

  // 3. 解析分页
  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }

  // 4. 可见性过滤:创建者看全部,非创建者只看 active
  const isCreator = circle.creatorId === userId
  const where = isCreator
    ? eq(activities.circleId, circleId)
    : and(eq(activities.circleId, circleId), eq(activities.status, "active"))

  const rows = await db
    .select()
    .from(activities)
    .where(where)
    .orderBy(asc(activities.startTime))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize)

  const allRows = await db
    .select({ id: activities.id })
    .from(activities)
    .where(where)

  const result: Paginated<ActivityDTO> = {
    list: rows.map(toActivityDTO),
    total: allRows.length,
    page: pagination.page,
    pageSize: pagination.pageSize,
  }

  return withCors(ok(result), req)
}
```

**Step 2: 运行测试(本文件相关用例应通过,详情路由用例仍失败)**

Run: `cd admin; node node_modules/vitest/vitest.mjs run tests/integration/api/circles-activities.test.ts`
Expected: POST / GET list 用例 PASS;GET detail / PUT / DELETE 用例仍 FAIL(文件未创建)

**Step 3: Commit**

```bash
git add admin/app/api/circles/[id]/activities/route.ts
git commit -m "feat(activity): add create/list activity routes"
```

---

## Task 6: 实现活动详情/更新/取消路由

**Files:**
- Create: `admin/app/api/circles/[id]/activities/[activityId]/route.ts`

**Step 1: 实现**

```ts
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles, activities } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"
import {
  updateActivitySchema,
  toActivityDTO,
  validateMergedTimes,
} from "@/lib/activities"

type RouteContext = {
  params: Promise<{ id: string; activityId: string }>
}

/**
 * 查询圈子并校验存在(返回 circle 行,不存在返回 null)。
 */
async function fetchCircleOrNull(circleId: string) {
  const [circle] = await db.select().from(circles).where(eq(circles.id, circleId))
  return circle ?? null
}

/**
 * 查询活动(限定 circleId,防跨圈子越权)。
 */
async function fetchActivityOrNull(circleId: string, activityId: string) {
  const [activity] = await db
    .select()
    .from(activities)
    .where(
      and(eq(activities.id, activityId), eq(activities.circleId, circleId))
    )
  return activity ?? null
}

/**
 * GET /api/circles/:id/activities/:activityId
 *
 * 返回活动详情。非创建者访问 cancelled 活动返回 404。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request, context: RouteContext) {
  const { id: circleId, activityId } = await context.params

  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  const circle = await fetchCircleOrNull(circleId)
  if (!circle) return withCors(fail(404, "圈子不存在"), req)

  const activity = await fetchActivityOrNull(circleId, activityId)
  if (!activity) return withCors(fail(404, "活动不存在"), req)

  // 非创建者访问 cancelled 活动 → 404
  if (activity.status !== "active" && circle.creatorId !== userId) {
    return withCors(fail(404, "活动不存在"), req)
  }

  return withCors(ok(toActivityDTO(activity)), req)
}

/**
 * PUT /api/circles/:id/activities/:activityId
 *
 * 更新活动(仅创建者可调)。时间字段部分更新时与现有值合并后再校验。
 */
export async function PUT(req: Request, context: RouteContext) {
  const { id: circleId, activityId } = await context.params

  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  const circle = await fetchCircleOrNull(circleId)
  if (!circle) return withCors(fail(404, "圈子不存在"), req)
  if (circle.creatorId !== userId) {
    return withCors(fail(403, "仅圈子创建者可修改活动"), req)
  }

  const activity = await fetchActivityOrNull(circleId, activityId)
  if (!activity) return withCors(fail(404, "活动不存在"), req)

  const body = await req.json().catch(() => null)
  const parsed = updateActivitySchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  const {
    title,
    description,
    startTime,
    registrationDeadline,
    contactPhone,
  } = parsed.data

  // 合并后校验时间顺序
  const mergedStart = startTime ?? activity.startTime
  const mergedDeadline = registrationDeadline ?? activity.registrationDeadline
  if (!validateMergedTimes(mergedStart, mergedDeadline)) {
    return withCors(fail(400, "报名截止时间必须早于活动起始时间"), req)
  }
  // 富文本安全守卫
  if (description && /<script|<\/script|<iframe|on\w+\s*=/i.test(description)) {
    return withCors(fail(400, "活动介绍包含不安全的 HTML 内容"), req)
  }

  const updates: Partial<typeof activities.$inferInsert> = {
    updatedAt: new Date(),
  }
  if (title !== undefined) updates.title = title
  if (description !== undefined) updates.description = description
  if (startTime !== undefined) updates.startTime = startTime
  if (registrationDeadline !== undefined) {
    updates.registrationDeadline = registrationDeadline
  }
  if (contactPhone !== undefined) updates.contactPhone = contactPhone

  await db
    .update(activities)
    .set(updates)
    .where(eq(activities.id, activityId))

  logger.info(LOG_PREFIX.CIRCLE, "Activity updated", {
    activityId,
    circleId,
    userId,
  })

  // 回查返回最新详情
  const updated = await fetchActivityOrNull(circleId, activityId)
  return withCors(ok(toActivityDTO(updated!)), req)
}

/**
 * DELETE /api/circles/:id/activities/:activityId
 *
 * 取消活动(软取消,status='cancelled'),仅创建者可调。
 */
export async function DELETE(req: Request, context: RouteContext) {
  const { id: circleId, activityId } = await context.params

  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  const circle = await fetchCircleOrNull(circleId)
  if (!circle) return withCors(fail(404, "圈子不存在"), req)
  if (circle.creatorId !== userId) {
    return withCors(fail(403, "仅圈子创建者可取消活动"), req)
  }

  const activity = await fetchActivityOrNull(circleId, activityId)
  if (!activity) return withCors(fail(404, "活动不存在"), req)

  await db
    .update(activities)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(activities.id, activityId))

  logger.info(LOG_PREFIX.CIRCLE, "Activity cancelled", {
    activityId,
    circleId,
    userId,
  })

  return withCors(ok({ id: activityId }), req)
}
```

**Step 2: 运行全部活动测试,确认全绿**

Run: `cd admin; node node_modules/vitest/vitest.mjs run tests/integration/api/circles-activities.test.ts`
Expected: 全部 PASS

**Step 3: Commit**

```bash
git add admin/app/api/circles/[id]/activities/[activityId]/route.ts
git commit -m "feat(activity): add detail/update/cancel activity routes"
```

---

## Task 7: 后端质量门

**Files:** 无(仅验证)

**Step 1: 运行后端全量单测**

Run: `cd admin; node node_modules/vitest/vitest.mjs run`
Expected: PASS(含既有圈子 CRUD 等全部用例,不破坏存量)

**Step 2: lint**

Run: `cd admin; node node_modules/eslint/bin/eslint.js .`
Expected: 无 error

**Step 3: 类型检查**

Run: `cd admin; node node_modules/typescript/bin/tsc --noEmit`
Expected: PASS

---

## Task 8: 前端类型与 API 客户端

**Files:**
- Modify: `frontend_uniapp/src/types/index.ts`(新增活动类型)
- Create: `frontend_uniapp/src/api/activities.ts`

**Step 1: 新增前端类型**

在 `frontend_uniapp/src/types/index.ts` 的 `FollowedCircleDTO` 之后追加:

```ts
/** 活动状态 */
export type ActivityStatus = 'active' | 'cancelled'

/** 圈子活动 DTO */
export type ActivityDTO = {
  id: string
  circleId: string
  title: string
  /** 活动介绍(富文本 HTML) */
  description: string
  /** 活动起始时间(ISO 8601) */
  startTime: string
  /** 报名截止时间(ISO 8601) */
  registrationDeadline: string
  /** 活动联系人电话 */
  contactPhone: string
  status: ActivityStatus
  createdAt: string
  updatedAt: string
}

/** 创建活动输入 */
export type CreateActivityInput = {
  title: string
  description: string
  startTime: string
  registrationDeadline: string
  contactPhone: string
}

/** 更新活动输入(全部可选) */
export type UpdateActivityInput = Partial<CreateActivityInput>
```

**Step 2: 创建 API 客户端 `frontend_uniapp/src/api/activities.ts`**

```ts
import { http } from '@/http/http'
import type {
  ActivityDTO,
  CreateActivityInput,
  Paginated,
  UpdateActivityInput,
} from '@/types'

/** 活动列表查询参数 */
export interface ActivitiesParams {
  page?: number
  pageSize?: number
}

/** 创建活动(仅圈子创建者) */
export function createActivity(circleId: string, input: CreateActivityInput) {
  return http.post<ActivityDTO>(
    `/api/circles/${encodeURIComponent(circleId)}/activities`,
    input as unknown as Record<string, unknown>,
  )
}

/** 获取圈子活动列表(分页) */
export function getActivities(circleId: string, params?: ActivitiesParams) {
  return http.get<Paginated<ActivityDTO>>(
    `/api/circles/${encodeURIComponent(circleId)}/activities`,
    {
      ...(params?.page !== undefined ? { page: params.page } : {}),
      ...(params?.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
    },
  )
}

/** 获取活动详情 */
export function getActivity(circleId: string, activityId: string) {
  return http.get<ActivityDTO>(
    `/api/circles/${encodeURIComponent(circleId)}/activities/${encodeURIComponent(activityId)}`,
  )
}

/** 更新活动(仅创建者) */
export function updateActivity(
  circleId: string,
  activityId: string,
  patch: UpdateActivityInput,
) {
  return http.put<ActivityDTO>(
    `/api/circles/${encodeURIComponent(circleId)}/activities/${encodeURIComponent(activityId)}`,
    patch as unknown as Record<string, unknown>,
  )
}

/** 取消活动(仅创建者,软取消) */
export function cancelActivity(circleId: string, activityId: string) {
  return http.delete<{ id: string }>(
    `/api/circles/${encodeURIComponent(circleId)}/activities/${encodeURIComponent(activityId)}`,
  )
}
```

**Step 3: 类型检查**

Run: `cd frontend_uniapp; node node_modules/typescript/bin/tsc --noEmit`(若报 vue 组件相关,改用 `pnpm type-check` 即 vue-tsc)
Expected: PASS

**Step 4: Commit**

```bash
git add frontend_uniapp/src/types/index.ts frontend_uniapp/src/api/activities.ts
git commit -m "feat(activity): add frontend activity types and api client"
```

---

## Task 9: 富文本编辑器组件

**Files:**
- Create: `frontend_uniapp/src/components/RichTextEditor/RichTextEditor.vue`

**Step 1: 实现组件(含平台降级)**

H5 / 微信小程序用 `<editor>`;抖音小程序降级为 `<textarea>`(纯文本)。组件对外暴露 `getHtml()` 供父组件在提交前取 HTML。

```vue
<script lang="ts" setup>
import { getCurrentInstance, ref } from 'vue'

const props = defineProps<{
  /** 编辑态初始 HTML(编辑已有活动时回填) */
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
}>()

// 仅 H5 / 微信小程序使用 editor 上下文
let editorCtx: any = null
const instance = getCurrentInstance()

/** 富文本工具栏命令 */
function format(name: string, value?: string) {
  editorCtx?.format(name, value)
}

function onEditorReady() {
  // #ifdef H5 || MP-WEIXIN
  uni
    .createSelectorQuery()
    .in(instance)
    .select('#activity-editor')
    .context((res: any) => {
      editorCtx = res?.context
    })
    .exec()
  // #endif
}

/** 提交前由父组件调用,返回 HTML 字符串 */
function getHtml(): Promise<string> {
  return new Promise((resolve) => {
    // #ifdef H5 || MP-WEIXIN
    if (editorCtx) {
      editorCtx.getContents({
        success: (res: { html?: string }) => resolve(res?.html ?? ''),
        fail: () => resolve(''),
      })
    }
    else {
      resolve('')
    }
    // #endif
    // #ifndef H5 || MP-WEIXIN
    // 非 editor 平台:textarea 直接 v-model 纯文本,包裹为 <p> 供 rich-text 渲染
    resolve(props.modelValue ? `<p>${props.modelValue}</p>` : '')
    // #endif
  })
}

// textarea 平台的 v-model 同步
function onTextInput(e: any) {
  emit('update:modelValue', e?.detail?.value ?? '')
}

defineExpose({ getHtml })
</script>

<template>
  <view class="rich-editor">
    <!-- H5 / 微信小程序:富文本编辑器 -->
    <!-- #ifdef H5 || MP-WEIXIN -->
    <view class="rich-editor__toolbar">
      <text class="rich-editor__tool" @click="format('bold')">B</text>
      <text class="rich-editor__tool" @click="format('italic')">I</text>
      <text class="rich-editor__tool" @click="format('underline')">U</text>
      <text class="rich-editor__tool" @click="format('header', 'H2')">标题</text>
      <text class="rich-editor__tool" @click="format('list', 'bullet')">• 列表</text>
      <text class="rich-editor__tool" @click="format('list', 'ordered')">1. 列表</text>
    </view>
    <editor
      id="activity-editor"
      class="rich-editor__body"
      :placeholder="placeholder || '请输入活动介绍...'"
      @ready="onEditorReady"
    />
    <!-- #endif -->

    <!-- 抖音等不支持 editor 的平台:纯文本降级 -->
    <!-- #ifndef H5 || MP-WEIXIN -->
    <textarea
      class="rich-editor__textarea"
      :value="modelValue"
      :placeholder="placeholder || '请输入活动介绍...'"
      placeholder-class="text-[#bbb]"
      @input="onTextInput"
    />
    <!-- #endif -->
  </view>
</template>

<style lang="scss" scoped>
.rich-editor {
  background: #f5f6f7;
  border-radius: 8px;
  overflow: hidden;
}
.rich-editor__toolbar {
  display: flex;
  gap: 4px;
  padding: 8px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
}
.rich-editor__tool {
  padding: 2px 10px;
  font-size: 13px;
  color: #018d71;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
}
.rich-editor__body {
  min-height: 200px;
  padding: 12px;
  font-size: 14px;
}
.rich-editor__textarea {
  width: 100%;
  min-height: 200px;
  padding: 12px;
  font-size: 14px;
  line-height: 1.6;
}
</style>
```

**Step 2: 类型检查**

Run: `cd frontend_uniapp; pnpm type-check`
Expected: PASS(如条件编译导致 `instance` 未用告警,忽略或加注释)

**Step 3: Commit**

```bash
git add frontend_uniapp/src/components/RichTextEditor/RichTextEditor.vue
git commit -m "feat(activity): add RichTextEditor component with platform fallback"
```

---

## Task 10: 活动发布/编辑表单页

**Files:**
- Create: `frontend_uniapp/src/pages/create-activity/create-activity.vue`

**Step 1: 实现表单页(新建 + 编辑复用)**

路由参数:`circleId`(必填)、`activityId`(编辑时携带)。时间选择用 `wd-datetime-picker`(`type="datetime"`,`v-model` 为时间戳)。

```vue
<script lang="ts" setup>
import { computed, ref } from 'vue'
import { createActivity, getActivity, updateActivity } from '@/api/activities'
import { useUserStore } from '@/store/user'
import { LOGIN_PAGE } from '@/router/config'
import RichTextEditor from '@/components/RichTextEditor/RichTextEditor.vue'
import { formatDateTime } from '@/utils/format'
import type { ActivityDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '发布活动',
  },
  excludeLoginPath: false,
})

/** 标题最大长度 */
const TITLE_MAX = 50
/** 手机号校验 */
const PHONE_RE = /^1\d{10}$/

const userStore = useUserStore()

const circleId = ref('')
const activityId = ref('')
const isEdit = computed(() => !!activityId.value)
const loading = ref(false)

// 表单状态
const title = ref('')
const contactPhone = ref('')
const descriptionHtml = ref('')
const startTime = ref<string>('') // ISO 字符串
const registrationDeadline = ref<string>('') // ISO 字符串
const submitting = ref(false)

// 时间选择器状态(时间戳)
const startPickerVisible = ref(false)
const deadlinePickerVisible = ref(false)
const now = Date.now()
const minDate = now
const maxDate = now + 365 * 24 * 60 * 60 * 1000 // 一年内

const editorRef = ref<InstanceType<typeof RichTextEditor> | null>(null)

let hasFetched = false

/** 编辑回填 */
async function fetchForEdit(circleIdParam: string, id: string) {
  loading.value = true
  try {
    const data: ActivityDTO = await getActivity(circleIdParam, id)
    title.value = data.title || ''
    contactPhone.value = data.contactPhone || ''
    descriptionHtml.value = data.description || ''
    startTime.value = data.startTime || ''
    registrationDeadline.value = data.registrationDeadline || ''
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

onShow(() => {
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: LOGIN_PAGE })
    return
  }
  const pages = getCurrentPages()
  const current = pages[pages.length - 1] as any
  const opts = current?.options || current?.$page?.options || {}
  circleId.value = opts.circleId || ''
  activityId.value = opts.activityId || ''
  if (isEdit.value && !hasFetched) {
    hasFetched = true
    void fetchForEdit(circleId.value, activityId.value)
  }
})

// 校验
const trimmedTitle = computed(() => title.value.trim())
const titleValid = computed(() => trimmedTitle.value.length >= 1 && trimmedTitle.value.length <= TITLE_MAX)
const phoneValid = computed(() => PHONE_RE.test(contactPhone.value.trim()))
const timesValid = computed(() => {
  if (!startTime.value || !registrationDeadline.value)
    return false
  return new Date(registrationDeadline.value).getTime() < new Date(startTime.value).getTime()
})

// 富文本是否有内容(编辑态已有值视为有内容;新建态提交前由 getHtml 兜底校验)
const descriptionValid = computed(() => {
  // #ifdef H5 || MP-WEIXIN
  return true // editor 内容由提交时 getHtml 校验
  // #endif
  // #ifndef H5 || MP-WEIXIN
  return descriptionHtml.value.trim().length > 0
  // #endif
})

const canSubmit = computed(() =>
  titleValid.value && phoneValid.value && timesValid.value && descriptionValid.value && !submitting.value)

const formErr = computed((): string => {
  if (!titleValid.value)
    return '请填写活动标题(1-50 字)'
  if (!phoneValid.value)
    return '手机号格式不正确(11 位)'
  if (!startTime.value || !registrationDeadline.value)
    return '请选择活动起始时间与报名截止时间'
  if (!timesValid.value)
    return '报名截止时间必须早于活动起始时间'
  return ''
})

// 时间选择确认
function onStartConfirm(e: { value: number }) {
  startTime.value = new Date(e.value).toISOString()
  startPickerVisible.value = false
}
function onDeadlineConfirm(e: { value: number }) {
  registrationDeadline.value = new Date(e.value).toISOString()
  deadlinePickerVisible.value = false
}

// 提交
async function handleSubmit() {
  if (!canSubmit.value)
    return
  // 取富文本 HTML
  const html = await editorRef.value?.getHtml() ?? ''
  const finalHtml = html || `<p>${descriptionHtml.value}</p>`
  if (!finalHtml.replace(/<[^>]+>/g, '').trim()) {
    uni.showToast({ title: '请填写活动介绍', icon: 'none' })
    return
  }

  submitting.value = true
  try {
    if (isEdit.value) {
      await updateActivity(circleId.value, activityId.value, {
        title: trimmedTitle.value,
        description: finalHtml,
        startTime: startTime.value,
        registrationDeadline: registrationDeadline.value,
        contactPhone: contactPhone.value.trim(),
      })
      uni.redirectTo({ url: `/pages/activity/activity?circleId=${circleId.value}&activityId=${activityId.value}` })
    }
    else {
      const res = await createActivity(circleId.value, {
        title: trimmedTitle.value,
        description: finalHtml,
        startTime: startTime.value,
        registrationDeadline: registrationDeadline.value,
        contactPhone: contactPhone.value.trim(),
      })
      uni.redirectTo({ url: `/pages/activity/activity?circleId=${circleId.value}&activityId=${res.id}` })
    }
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '提交失败', icon: 'none' })
  }
  finally {
    submitting.value = false
  }
}

const titleCount = computed(() => `${title.value.length}/${TITLE_MAX}`)
</script>

<template>
  <view class="flex flex-col pb-40">
    <view v-if="loading && isEdit" class="flex flex-col items-center pt-32">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <template v-else>
      <scroll-view scroll-y class="flex-1">
        <!-- 标题 -->
        <view class="mx-4 mt-4 rounded-2xl bg-white p-4">
          <view class="flex items-center justify-between">
            <text class="text-sm text-[#333] font-medium">
              活动标题 <text class="text-[#f53f3f]">*</text>
            </text>
            <text class="text-xs text-[#999]">{{ titleCount }}</text>
          </view>
          <input
            v-model="title"
            class="mt-2 h-10 w-full rounded-lg bg-[#f5f6f7] px-3 text-sm"
            :maxlength="TITLE_MAX"
            placeholder="如:周六陈氏太极拳体验课"
            placeholder-class="text-[#bbb]"
          >
        </view>

        <!-- 活动起始时间 -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4" @click="startPickerVisible = true">
          <text class="text-sm text-[#333] font-medium">
            活动起始时间 <text class="text-[#f53f3f]">*</text>
          </text>
          <view class="mt-2 flex items-center justify-between rounded-lg bg-[#f5f6f7] p-3">
            <text :class="startTime ? 'text-sm text-[#333]' : 'text-sm text-[#bbb]'">
              {{ startTime ? formatDateTime(startTime) : '点击选择' }}
            </text>
            <text class="text-sm text-[#018d71]">选择 ›</text>
          </view>
        </view>

        <!-- 报名截止时间 -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4" @click="deadlinePickerVisible = true">
          <text class="text-sm text-[#333] font-medium">
            报名截止时间 <text class="text-[#f53f3f]">*</text>
          </text>
          <view class="mt-2 flex items-center justify-between rounded-lg bg-[#f5f6f7] p-3">
            <text :class="registrationDeadline ? 'text-sm text-[#333]' : 'text-sm text-[#bbb]'">
              {{ registrationDeadline ? formatDateTime(registrationDeadline) : '点击选择' }}
            </text>
            <text class="text-sm text-[#018d71]">选择 ›</text>
          </view>
        </view>

        <!-- 活动联系人电话 -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
          <text class="text-sm text-[#333] font-medium">
            活动联系人电话 <text class="text-[#f53f3f]">*</text>
          </text>
          <input
            v-model="contactPhone"
            class="mt-2 h-10 w-full rounded-lg bg-[#f5f6f7] px-3 text-sm"
            type="number"
            :maxlength="11"
            placeholder="11 位手机号"
            placeholder-class="text-[#bbb]"
          >
        </view>

        <!-- 活动介绍(富文本) -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
          <text class="text-sm text-[#333] font-medium">
            活动介绍 <text class="text-[#f53f3f]">*</text>
          </text>
          <view class="mt-2">
            <RichTextEditor
              ref="editorRef"
              v-model="descriptionHtml"
              placeholder="请输入活动介绍(支持加粗、标题、列表等格式)"
            />
          </view>
        </view>
      </scroll-view>

      <!-- 底部提交 -->
      <view class="border-t border-[#f0f0f0] bg-white px-4 py-3 pb-safe">
        <wd-button block :loading="submitting" :disabled="!canSubmit" @click="handleSubmit">
          {{ isEdit ? '保存修改' : '发布活动' }}
        </wd-button>
        <text v-if="formErr" class="mt-2 block text-center text-xs text-[#f53f3f]">
          {{ formErr }}
        </text>
      </view>

      <!-- 时间选择器 -->
      <wd-datetime-picker
        v-model="startPickerValue"
        v-model:visible="startPickerVisible"
        type="datetime"
        :min-date="minDate"
        :max-date="maxDate"
        title="选择活动起始时间"
        @confirm="onStartConfirm"
      />
      <wd-datetime-picker
        v-model="deadlinePickerValue"
        v-model:visible="deadlinePickerVisible"
        type="datetime"
        :min-date="minDate"
        :max-date="maxDate"
        title="选择报名截止时间"
        @confirm="onDeadlineConfirm"
      />
    </template>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
```

**注意**:上例还需在 `<script setup>` 中补充两个时间戳 ref,供 `wd-datetime-picker` 的 `v-model` 使用:

```ts
const startPickerValue = ref<number>(Date.now())
const deadlinePickerValue = ref<number>(Date.now())
```

**Step 2: 类型检查**

Run: `cd frontend_uniapp; pnpm type-check`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend_uniapp/src/pages/create-activity/create-activity.vue
git commit -m "feat(activity): add create/edit activity form page"
```

---

## Task 11: 活动详情页

**Files:**
- Create: `frontend_uniapp/src/pages/activity/activity.vue`

**Step 1: 实现详情页(富文本用 `<rich-text>` 展示)**

```vue
<script lang="ts" setup>
import { computed, ref } from 'vue'
import { cancelActivity, getActivity } from '@/api/activities'
import { useUserStore } from '@/store/user'
import { formatDateTime } from '@/utils/format'
import type { ActivityDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '活动详情',
  },
  excludeLoginPath: false,
})

const userStore = useUserStore()

const circleId = ref('')
const activityId = ref('')
const activity = ref<ActivityDTO | null>(null)
const loading = ref(true)
const notFound = ref(false)
const cancelling = ref(false)

async function fetchActivity() {
  if (!circleId.value || !activityId.value) {
    notFound.value = true
    loading.value = false
    return
  }
  loading.value = true
  try {
    activity.value = await getActivity(circleId.value, activityId.value)
    notFound.value = false
  }
  catch (e) {
    notFound.value = true
    console.warn('[Activity] fetch error:', (e as Error)?.message)
  }
  finally {
    loading.value = false
  }
}

onShow(() => {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1] as any
  const opts = current?.options || current?.$page?.options || {}
  circleId.value = opts.circleId || ''
  activityId.value = opts.activityId || ''
  void fetchActivity()
})

const isCreator = computed(() => {
  return !!(
    activity.value
    && userStore.userInfo
    // 活动属于圈子,创建者即圈子创建者;前端用活动详情无法直接拿 creatorId,
    // 但活动详情页由圈子详情页进入,创建者通过圈子详情跳编辑/取消按钮直接到达,
    // 此处以用户是否登录 TEACHER/ADMIN + 活动状态判断可编辑性(兜底展示编辑入口)
    && ['TEACHER', 'ADMIN'].includes(userStore.userInfo.role ?? '')
  )
})

/** 取消活动 */
function handleCancel() {
  const a = activity.value
  if (!a || cancelling.value)
    return
  uni.showModal({
    title: '取消活动',
    content: `确定取消「${a.title}」吗?取消后学员将不可见。`,
    confirmText: '取消活动',
    cancelText: '再想想',
    confirmColor: '#f53f3f',
    success(res) {
      if (!res.confirm)
        return
      cancelling.value = true
      cancelActivity(circleId.value, activityId.value)
        .then(() => {
          a.status = 'cancelled'
          uni.showToast({ title: '已取消', icon: 'success' })
        })
        .catch((e) => {
          uni.showToast({ title: (e as Error).message || '取消失败', icon: 'none' })
        })
        .finally(() => {
          cancelling.value = false
        })
    },
  })
}

function handleEdit() {
  uni.navigateTo({
    url: `/pages/create-activity/create-activity?circleId=${circleId.value}&activityId=${activityId.value}`,
  })
}

function handleCall(phone: string) {
  uni.makePhoneCall({ phoneNumber: phone })
}

function handleBack() {
  uni.navigateBack({
    fail() {
      uni.reLaunch({ url: '/pages/index/index' })
    },
  })
}
</script>

<template>
  <view class="flex flex-col">
    <view v-if="loading && !activity" class="flex flex-col items-center pt-32">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <view v-else-if="notFound || !activity" class="flex flex-col items-center pt-32">
      <text class="text-base text-[#333] font-medium">
        该活动已不存在
      </text>
      <wd-button class="mt-4" round size="small" @click="handleBack">
        返回
      </wd-button>
    </view>

    <template v-else>
      <scroll-view scroll-y class="flex-1">
        <!-- 已取消横幅 -->
        <view v-if="activity.status === 'cancelled'" class="bg-[#eef0f2] px-4 py-3">
          <text class="text-xs text-[#666]">
            该活动已取消。
          </text>
        </view>

        <!-- 标题 -->
        <view class="bg-white px-4 py-4">
          <text class="block text-xl text-[#333] font-semibold">
            {{ activity.title }}
          </text>
        </view>

        <!-- 时间信息 -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
          <view class="flex items-center justify-between py-2">
            <text class="text-sm text-[#999]">活动起始时间</text>
            <text class="text-sm text-[#333]">{{ formatDateTime(activity.startTime) }}</text>
          </view>
          <view class="flex items-center justify-between border-t border-[#f5f5f5] py-2">
            <text class="text-sm text-[#999]">报名截止时间</text>
            <text class="text-sm text-[#333]">{{ formatDateTime(activity.registrationDeadline) }}</text>
          </view>
        </view>

        <!-- 活动介绍(富文本) -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
          <text class="block text-sm text-[#333] font-medium">
            活动介绍
          </text>
          <view class="mt-2 text-sm text-[#666] leading-6">
            <rich-text :nodes="activity.description" />
          </view>
        </view>

        <!-- 联系人电话 -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4" @click="handleCall(activity.contactPhone)">
          <view class="flex items-center justify-between">
            <text class="text-sm text-[#333] font-medium">活动联系人电话</text>
            <text class="text-sm text-[#018d71]">
              {{ activity.contactPhone }} ›
            </text>
          </view>
          <text class="mt-2 block text-xs text-[#999]">
            点击直接拨打
          </text>
        </view>
      </scroll-view>

      <!-- 底部操作(创建者可见编辑/取消) -->
      <view v-if="isCreator" class="border-t border-[#f0f0f0] bg-white px-4 py-3 pb-safe">
        <view class="flex items-center gap-3">
          <wd-button block :disabled="activity.status === 'cancelled'" @click="handleEdit">
            编辑活动
          </wd-button>
          <wd-button
            v-if="activity.status === 'active'"
            plain
            custom-class="shrink-0"
            :loading="cancelling"
            @click="handleCancel"
          >
            取消活动
          </wd-button>
        </view>
      </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
```

> **说明**:`isCreator` 用角色 + 进入路径兜底判断编辑权限。更精确的方案是在 `ActivityDTO` 中透出 `circleCreatorId` 或由后端在详情里返回 `canEdit` 布尔值;若需严格鉴权,可在 Task 8 的类型与 Task 6 的 DTO 中补充 `canEdit: boolean`(由后端在 GET 详情时对比 `circle.creatorId === userId` 计算)。本计划采用前端角色判断作为 MVP,后端写接口已有严格鉴权兜底。

**Step 2: 类型检查**

Run: `cd frontend_uniapp; pnpm type-check`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend_uniapp/src/pages/activity/activity.vue
git commit -m "feat(activity): add activity detail page"
```

---

## Task 12: 圈子详情页集成(活动列表 + 发布入口)

**Files:**
- Modify: `frontend_uniapp/src/pages/circle/circle.vue`

**Step 1: 在圈子详情页加入活动区块**

1. 在 `<script setup>` 顶部引入:

```ts
import { getActivities } from '@/api/activities'
import { formatDateTime } from '@/utils/format' // 已存在,无需重复
import type { ActivityDTO } from '@/types'
```

2. 新增状态与拉取逻辑:

```ts
const activities = ref<ActivityDTO[]>([])
const activitiesLoading = ref(false)

async function fetchActivities() {
  if (!circleId.value)
    return
  activitiesLoading.value = true
  try {
    const res = await getActivities(circleId.value, { page: 1, pageSize: 20 })
    activities.value = res.list || []
  }
  catch (e) {
    console.warn('[Circle] fetch activities error:', (e as Error)?.message)
  }
  finally {
    activitiesLoading.value = false
  }
}
```

在 `onShow` 的 `void fetchCircle(id)` 之后追加 `void fetchActivities()`。

3. 新增跳转方法:

```ts
function handleGoActivity(a: ActivityDTO) {
  uni.navigateTo({
    url: `/pages/activity/activity?circleId=${circleId.value}&activityId=${a.id}`,
  })
}

function handlePublishActivity() {
  uni.navigateTo({
    url: `/pages/create-activity/create-activity?circleId=${circleId.value}`,
  })
}
```

4. 在模板"圈子介绍"区块之后、"活动时间"区块之前,插入活动区块:

```vue
<!-- ====== 4.5 圈子活动列表 ====== -->
<view class="mx-4 mt-3 rounded-2xl bg-white p-4">
  <view class="flex items-center justify-between">
    <text class="text-sm text-[#333] font-medium">
      圈子活动
    </text>
    <text v-if="isCreator" class="text-sm text-[#018d71]" @click="handlePublishActivity">
      + 发布活动
    </text>
  </view>

  <view v-if="activitiesLoading && activities.length === 0" class="mt-3">
    <text class="text-xs text-[#999]">加载中...</text>
  </view>
  <view v-else-if="activities.length === 0" class="mt-3">
    <text class="text-xs text-[#999]">暂无活动{{ isCreator ? ',点击右上角发布' : '' }}</text>
  </view>
  <view v-else class="mt-3 flex flex-col gap-2">
    <view
      v-for="a in activities"
      :key="a.id"
      class="flex items-center justify-between rounded-lg bg-[#f8f9fa] p-3"
      @click="handleGoActivity(a)"
    >
      <view class="min-w-0 flex-1">
        <view class="flex items-center gap-2">
          <text class="truncate text-sm text-[#333] font-medium">{{ a.title }}</text>
          <text v-if="a.status === 'cancelled'" class="shrink-0 text-xs text-[#999]">已取消</text>
        </view>
        <text class="mt-0.5 block text-xs text-[#999]">
          {{ formatDateTime(a.startTime) }}
        </text>
      </view>
      <text class="shrink-0 text-xs text-[#999]">报名截止 {{ formatDateTime(a.registrationDeadline) }}</text>
    </view>
  </view>
</view>
```

**Step 2: 类型检查**

Run: `cd frontend_uniapp; pnpm type-check`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend_uniapp/src/pages/circle/circle.vue
git commit -m "feat(activity): integrate activity list into circle detail"
```

---

## Task 13: 前端质量门与手动验证清单

**Files:** 无(验证 + 文档)

**Step 1: 前端 lint 与类型检查**

Run: `cd frontend_uniapp; pnpm lint`
Expected: 无 error

Run: `cd frontend_uniapp; pnpm type-check`
Expected: PASS

**Step 2: 手动验证清单(启动前后端后逐项确认)**

1. 后端 `pnpm dev`、前端 `pnpm dev:mp`(或 `dev:h5`),数据库 `pnpm db:up`。
2. 用 `wangshifu@example.com / teacher123` 登录(TEACHER),进入某圈子详情 → 看到"圈子活动"区块与"+ 发布活动"。
3. 点"发布活动" → 填写标题/起始时间/截止时间/电话/富文本介绍 → 提交 → 跳转活动详情,富文本正确渲染。
4. 报名截止时间晚于起始时间时被拦截,提示"报名截止时间必须早于活动起始时间"。
5. 手机号非法被拦截。
6. 编辑活动 → 保存 → 详情更新。
7. 取消活动 → 列表标记"已取消";用普通 USER 账号登录看不到该活动。
8. 普通 USER 账号打开圈子详情,可见活动列表但无"+ 发布活动"入口。
9. 抖音小程序(如启用)降级为纯文本 textarea,`<rich-text>` 仍正常展示。

**Step 3: 最终提交(如手动验证产生微调)**

```bash
git add -A
git commit -m "chore(activity): final polish after manual verification"
```

---

## 验证与回滚说明

- **数据库**:`activities` 表为新增,回滚只需删除该表;迁移文件保留在 `drizzle/`。
- **兼容性**:本次未改动 `circles` 表既有字段,圈子 CRUD / 匹配 / 通知均不受影响。
- **质量门(后端)**:`pnpm lint` + `pnpm build`(离线时可 `tsc --noEmit` 替代)+ `pnpm test`。
- **质量门(前端)**:`pnpm lint` + `pnpm type-check`。
