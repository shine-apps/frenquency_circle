# 关注圈子（Circle Follow）Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让用户能「关注」感兴趣的圈子：在圈子详情页一键关注/取消关注，并在「我的」页查看「我关注的圈子」列表。

**Architecture:**
- 后端新增 `circle_follows` 关注关系表（`userId` × `circleId` 唯一），新增三条 REST 路由（关注、取消关注、我关注的列表），并在圈子详情 DTO 中返回 `isFollowed` / `followCount`。
- 前端在圈子详情页底部操作栏加入「关注/已关注」切换按钮（复用现有 `wd-button` 样式），新增「我关注的圈子」页面（参照 `my-published` 页结构），并在「我的」页加入口。
- 与现有代码风格保持一致：Token Bearer 鉴权、`IResponse` 信封、`withCors`、结构化日志 `LOG_PREFIX.CIRCLE`、集成测试用 `@/lib/db` select 队列 mock。

**Tech Stack:** Next.js 16 · Drizzle ORM · PostgreSQL · uni-app (Vue 3 + TS) · wot-ui v2 · Vitest

---

## 探查结论（已核实）

| 事实 | 位置 |
| --- | --- |
| 圈子表 `circles` 已存在，状态含 `active/offline/deleted/violated/pending/rejected` | `admin/db/schema.ts:297-345` |
| 圈子详情路由 `GET /api/circles/:id` 已返回 `creator`/`tags`/`contactCount` | `admin/app/api/circles/[id]/route.ts:46-76` |
| 现有嵌套路由模式：`/api/circles/:id/contact`（POST）、`/api/circles/mine`（GET，分页） | `admin/app/api/circles/[id]/contact/route.ts`、`admin/app/api/circles/mine/route.ts` |
| Next.js 静态段优先于动态段：`/api/circles/followed` 不会被 `[id]` 捕获（与 `/mine` 同理） | 路由约定 |
| 集成测试 mock 模式：`db.select()` 队列 + `insert/update` 链 | `admin/tests/integration/api/circles-crud.test.ts:57-151` |
| `fetchCircleDetail` 目前做 3 个 select（circle + creator + contactCount），改后为 5 个（+ followCount + isFollowed） | `admin/app/api/circles/[id]/route.ts` |
| 前端圈子详情页底部已有「联系老师/编辑 + 分享」按钮栏 | `frontend_uniapp/src/pages/circle/circle.vue:284-307` |
| 前端列表页范式（空态/加载态/卡片/下拉刷新） | `frontend_uniapp/src/pages/my-published/my-published.vue` |
| 前端 API 封装 `http.get/post/delete<T>()`、分页类型 `Paginated<T>` 均已有 | `frontend_uniapp/src/api/circles.ts`、`frontend_uniapp/src/types/index.ts` |
| 仓库当前未跟踪任何迁移 SQL（`drizzle/meta/_journal.json` entries 为空），实际开发用 schema 直连数据库 | `admin/drizzle/meta/_journal.json` |

**关键决策（YAGNI / 简化）：**
- 「关注」仅对 `active` 圈子开放；取消关注不校验状态（只校验圈子存在）。
- 两个接口均为**幂等**：重复关注不重复插入，重复取消不报错。
- `GET /api/circles/followed` 列表排除 `deleted` 圈子；`total` 按关注记录数统计（MVP 接受「已删除圈子计入 total 但不出现在 list」的小偏差，后续如需精确可改 join）。
- 前端不加额外依赖，关注按钮用 `wd-button plain` 文本按钮（与现有「分享」按钮一致）。

---

## 后端集成测试 mock 说明（贯穿 Task 2-4）

`db` mock 需要**新增 `delete` 链**（现有 crud 测试没有）。统一在测试文件顶部用 `vi.hoisted` 构造：

```ts
const chainDelete = { where: deleteWhereMock }
// mockDb 增加:
delete: vi.fn(() => chainDelete),
```

`db.delete(x).where(...)` 的调用链：`delete()` 返回 `chainDelete`，`.where()` 返回 thenable（`vi.fn(async () => undefined)`）。

---

### Task 1: 数据库 — 新增 `circle_follows` 表

**Files:**
- Modify: `admin/db/schema.ts`（在 `circleMembers` 表定义之后追加）

**Step 1: 修改 schema**

在 `admin/db/schema.ts` 的 `circleMembers` 导出（约 378 行）之后追加：

```ts
/**
 * 圈子关注表。
 * 用户关注感兴趣的圈子,关注后可在"我关注的圈子"列表快速回看。
 * 一个用户对同一圈子最多一条关注记录(UNIQUE(circle_id, user_id))。
 */
export const circleFollows = pgTable(
  "circle_follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // 同一用户关注同一圈子只有一条
    uniqueIndex("circle_follows_circle_user_idx").on(
      table.circleId,
      table.userId
    ),
    // 按用户反查关注列表
    index("circle_follows_user_idx").on(table.userId),
  ]
)

export type CircleFollow = typeof circleFollows.$inferSelect
export type NewCircleFollow = typeof circleFollows.$inferInsert
```

> `uniqueIndex` / `index` 已在本文件顶部导入，无需新增 import。

**Step 2: 类型检查**

Run:
```bash
cd admin && pnpm exec tsc --noEmit
```
Expected: 无输出（通过）。

**Step 3: 同步数据库结构**

仓库当前未跟踪迁移 SQL，`drizzle/meta/_journal.json` 为空，故用 `db:push` 增量同步（等价于 generate+migrate，但不会生成巨型全量迁移文件）：

Run:
```bash
cd admin && pnpm db:push
```
Expected: drizzle-kit 输出包含 `+ circle_follows` 的 schema diff 并执行成功。

> 若团队偏好迁移文件，可改跑 `pnpm db:generate && pnpm db:migrate`，并 review 生成的 SQL 确认只含 `circle_follows`（注意 journal 为空时可能生成全量 baseline，需人工确认）。

**Step 4: Commit**

```bash
git add admin/db/schema.ts
git commit -m "feat(admin): 新增 circle_follows 关注关系表"
```

---

### Task 2: 后端 — 关注 / 取消关注接口（TDD）

**Files:**
- Create: `admin/app/api/circles/[id]/follow/route.ts`
- Test: `admin/tests/integration/api/circles-follow.test.ts`

**Step 1: 写失败测试**

创建 `admin/tests/integration/api/circles-follow.test.ts`：

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * 圈子关注集成测试(POST / DELETE /api/circles/:id/follow)。
 *
 * 覆盖:
 * - POST: 401 / 404(不存在) / 404(非 active) / 200 关注成功 / 200 幂等(已关注不重复插入)
 * - DELETE: 401 / 404(不存在) / 200 取消关注 / 200 幂等(未关注不报错)
 *
 * mock 层级:
 * - @/lib/db:select 队列 + insert/delete 链
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值
 * - @/lib/logger:避免输出噪音
 */

const {
  mockDb,
  chainInsert,
  deleteWhereMock,
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

  const chainInsert = {
    values: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(undefined).then(resolve, reject),
  }

  const deleteWhereMock = vi.fn(async () => undefined)
  const chainDelete = { where: deleteWhereMock }

  const mockDb = {
    select: vi.fn(() => makeSelectChain(selectResultsQueue.shift() ?? [])),
    insert: vi.fn(function (this: unknown) {
      return chainInsert
    }),
    delete: vi.fn(function (this: unknown) {
      return chainDelete
    }),
  }

  return {
    mockDb,
    chainInsert,
    deleteWhereMock,
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
    delete: ReturnType<typeof vi.fn>
  }
  chainInsert: {
    values: ReturnType<typeof vi.fn>
    then: (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise<unknown>
  }
  deleteWhereMock: ReturnType<typeof vi.fn>
  setSelectResultsQueue: (results: Record<string, unknown>[][]) => void
  readUserFromTokenMock: ReturnType<typeof vi.fn>
}

vi.mock("@/lib/db", () => ({ db: mockDb }))

vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
}))

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { CIRCLE: "CIRCLE" },
}))

import { POST, DELETE } from "@/app/api/circles/[id]/follow/route"
import type { IResponse } from "@/types/api"

const USER = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "user@example.com",
  name: "User",
  role: "USER" as const,
}

type RouteContext = { params: Promise<{ id: string }> }
function makeContext(id: string): RouteContext {
  return { params: Promise.resolve({ id }) }
}

function makeRequest(path: string, method: "POST" | "DELETE"): Request {
  return new Request(`http://localhost${path}`, { method })
}

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb.insert.mockClear()
  mockDb.delete.mockClear()
  chainInsert.values.mockClear()
  deleteWhereMock.mockClear()
  readUserFromTokenMock.mockReset()
  setSelectResultsQueue([])
})

describe("POST /api/circles/:id/follow", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await POST(makeRequest("/api/circles/c1/follow", "POST"), makeContext("c1"))
    expect(res.status).toBe(401)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 404 when circle does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    // select 1: circle 查询为空
    setSelectResultsQueue([[]])
    const res = await POST(makeRequest("/api/circles/c1/follow", "POST"), makeContext("c1"))
    expect(res.status).toBe(404)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toContain("圈子不存在")
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("returns 404 when circle is not active", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[{ id: "c1", status: "pending" }]])
    const res = await POST(makeRequest("/api/circles/c1/follow", "POST"), makeContext("c1"))
    expect(res.status).toBe(404)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })

  it("follows an active circle and inserts one record", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    // select 1: circle 存在且 active
    // select 2: 关注记录查询 → 空(未关注)
    setSelectResultsQueue([[{ id: "c1", status: "active" }], []])
    const res = await POST(makeRequest("/api/circles/c1/follow", "POST"), makeContext("c1"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ followed: boolean }>
    expect(body.data).toEqual({ followed: true })
    expect(mockDb.insert).toHaveBeenCalledTimes(1)
    const insertArg = chainInsert.values.mock.calls[0][0] as Record<string, unknown>
    expect(insertArg).toEqual({ circleId: "c1", userId: USER.id })
  })

  it("is idempotent: skips insert when already followed", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([
      [{ id: "c1", status: "active" }],
      [{ id: "follow-1", circleId: "c1", userId: USER.id }],
    ])
    const res = await POST(makeRequest("/api/circles/c1/follow", "POST"), makeContext("c1"))
    expect(res.status).toBe(200)
    expect(mockDb.insert).not.toHaveBeenCalled()
  })
})

describe("DELETE /api/circles/:id/follow", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await DELETE(makeRequest("/api/circles/c1/follow", "DELETE"), makeContext("c1"))
    expect(res.status).toBe(401)
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it("returns 404 when circle does not exist", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[]])
    const res = await DELETE(makeRequest("/api/circles/c1/follow", "DELETE"), makeContext("c1"))
    expect(res.status).toBe(404)
    expect(mockDb.delete).not.toHaveBeenCalled()
  })

  it("unfollows a circle and deletes the record", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[{ id: "c1" }]])
    const res = await DELETE(makeRequest("/api/circles/c1/follow", "DELETE"), makeContext("c1"))
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<{ followed: boolean }>
    expect(body.data).toEqual({ followed: false })
    expect(deleteWhereMock).toHaveBeenCalledTimes(1)
  })

  it("is idempotent: deleting a non-existing follow does not error", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    setSelectResultsQueue([[{ id: "c1" }]])
    const res = await DELETE(makeRequest("/api/circles/c1/follow", "DELETE"), makeContext("c1"))
    expect(res.status).toBe(200)
    expect(deleteWhereMock).toHaveBeenCalledTimes(1)
  })
})
```

**Step 2: 运行测试确认失败**

Run:
```bash
cd admin && pnpm exec vitest run tests/integration/api/circles-follow.test.ts
```
Expected: FAIL，错误为找不到模块 `@/app/api/circles/[id]/follow/route`。

**Step 3: 实现路由**

创建 `admin/app/api/circles/[id]/follow/route.ts`：

```ts
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles, circleFollows } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * POST /api/circles/:id/follow
 *
 * 关注圈子(幂等)。仅 active 状态的圈子可被关注;已关注时直接返回 ok,不重复插入。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params

  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 校验圈子存在且 active
  const [circleRow] = await db
    .select({ id: circles.id, status: circles.status })
    .from(circles)
    .where(eq(circles.id, id))
  if (!circleRow || circleRow.status !== "active") {
    return withCors(fail(404, "圈子不存在或已下线"), req)
  }

  // 3. 幂等插入:已关注则跳过
  const [existing] = await db
    .select({ id: circleFollows.id })
    .from(circleFollows)
    .where(
      and(eq(circleFollows.circleId, id), eq(circleFollows.userId, userId))
    )
  if (!existing) {
    await db.insert(circleFollows).values({ circleId: id, userId })
  }

  logger.info(LOG_PREFIX.CIRCLE, "Circle followed", { circleId: id, userId })
  return withCors(ok({ followed: true }), req)
}

/**
 * DELETE /api/circles/:id/follow
 *
 * 取消关注(幂等)。圈子不存在返回 404;未关注时直接返回 ok。
 */
export async function DELETE(req: Request, context: RouteContext) {
  const { id } = await context.params

  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 校验圈子存在
  const [circleRow] = await db
    .select({ id: circles.id })
    .from(circles)
    .where(eq(circles.id, id))
  if (!circleRow) {
    return withCors(fail(404, "圈子不存在"), req)
  }

  // 3. 删除关注记录(幂等)
  await db
    .delete(circleFollows)
    .where(
      and(eq(circleFollows.circleId, id), eq(circleFollows.userId, userId))
    )

  logger.info(LOG_PREFIX.CIRCLE, "Circle unfollowed", { circleId: id, userId })
  return withCors(ok({ followed: false }), req)
}
```

**Step 4: 运行测试确认通过**

Run:
```bash
cd admin && pnpm exec vitest run tests/integration/api/circles-follow.test.ts
```
Expected: 9 个用例全部 PASS。

**Step 5: Commit**

```bash
git add admin/app/api/circles/[id]/follow/route.ts admin/tests/integration/api/circles-follow.test.ts
git commit -m "feat(admin): 圈子关注/取消关注接口(幂等,仅 active 可关注)"
```

---

### Task 3: 后端 — 我关注的圈子列表接口（TDD）

**Files:**
- Create: `admin/app/api/circles/followed/route.ts`
- Test: `admin/tests/integration/api/circles-follow.test.ts`（追加用例）

**Step 1: 写失败测试**

在 `admin/tests/integration/api/circles-follow.test.ts` 追加 import 与用例：

```ts
// 顶部追加 import
import { GET as getFollowedCircles } from "@/app/api/circles/followed/route"
import type { IResponse, Paginated, FollowedCircleDTO } from "@/types/api"

// 追加 helper:构造圈子行(字段与 circles 表对齐)
function makeCircleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "c1",
    title: "陈氏太极拳晨练班",
    description: "每周二、四早晨在朝阳公园练习陈氏太极拳。",
    creatorId: "11111111-1111-1111-1111-111111111111",
    latitude: 39.9042,
    longitude: 116.4074,
    address: "北京市朝阳区朝阳公园",
    contactPhone: "13800138000",
    wechat: "taichi2026",
    activityTime: "每周二、四 06:30",
    maxMembers: 20,
    memberCount: 8,
    status: "active",
    coverImages: [],
    createdAt: new Date("2026-07-01T00:00:00Z"),
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    ...overrides,
  }
}

describe("GET /api/circles/followed", () => {
  it("returns 401 when not logged in", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const res = await getFollowedCircles(
      new Request("http://localhost/api/circles/followed?page=1&pageSize=20")
    )
    expect(res.status).toBe(401)
  })

  it("returns paginated followed circles, excluding deleted circles", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    // select 1: 分页关注记录(2 条,按关注时间倒序)
    // select 2: 对应圈子行(c1 active + c2 deleted)
    // select 3: 全部关注记录用于 total(2 条)
    setSelectResultsQueue([
      [
        { id: "f1", circleId: "c1", userId: USER.id, createdAt: new Date("2026-08-01T00:00:00Z") },
        { id: "f2", circleId: "c2", userId: USER.id, createdAt: new Date("2026-08-02T00:00:00Z") },
      ],
      [
        makeCircleRow({ id: "c1" }),
        makeCircleRow({ id: "c2", status: "deleted" }),
      ],
      [{ id: "f1" }, { id: "f2" }],
    ])
    const res = await getFollowedCircles(
      new Request("http://localhost/api/circles/followed?page=1&pageSize=20")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<FollowedCircleDTO>>
    expect(body.data.total).toBe(2)
    // 已删除的 c2 被排除
    expect(body.data.list).toHaveLength(1)
    expect(body.data.list[0].id).toBe("c1")
    expect(body.data.list[0].followedAt).toBe("2026-08-01T00:00:00.000Z")
  })

  it("returns empty list when no follows", async () => {
    readUserFromTokenMock.mockResolvedValue(USER)
    // select 1: 分页关注记录 → 空
    // select 2: total 查询 → 空
    setSelectResultsQueue([[], []])
    const res = await getFollowedCircles(
      new Request("http://localhost/api/circles/followed?page=1&pageSize=20")
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<Paginated<FollowedCircleDTO>>
    expect(body.data.list).toEqual([])
    expect(body.data.total).toBe(0)
  })
})
```

**Step 2: 运行测试确认失败**

Run:
```bash
cd admin && pnpm exec vitest run tests/integration/api/circles-follow.test.ts
```
Expected: FAIL，找不到模块 `@/app/api/circles/followed/route`。

**Step 3: 实现路由**

创建 `admin/app/api/circles/followed/route.ts`：

```ts
import { and, desc, eq, inArray, ne } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles, circleFollows } from "@/db/schema"
import { corsOptions, fail, ok, withCors, parsePagination } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import type { CircleDTO, FollowedCircleDTO, Paginated } from "@/types/api"

/** 将 circles 表行转换为 CircleDTO(与 mine/route.ts 保持一致) */
function toCircleDTO(row: typeof circles.$inferSelect): CircleDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    creatorId: row.creatorId,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    contactPhone: row.contactPhone,
    wechat: row.wechat,
    activityTime: row.activityTime,
    maxMembers: row.maxMembers,
    memberCount: row.memberCount,
    status: row.status,
    coverImages: row.coverImages ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * GET /api/circles/followed
 *
 * 返回当前用户关注的圈子列表(分页,按关注时间倒序,排除已删除圈子)。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 解析分页
  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }

  // 3. 查询关注记录(分页,按关注时间倒序)
  const followRows = await db
    .select()
    .from(circleFollows)
    .where(eq(circleFollows.userId, userId))
    .orderBy(desc(circleFollows.createdAt))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize)

  // 4. 批量查询对应圈子,排除已删除
  const circleIds = followRows.map((r) => r.circleId)
  let list: FollowedCircleDTO[] = []
  if (circleIds.length > 0) {
    const circleRows = await db
      .select()
      .from(circles)
      .where(and(inArray(circles.id, circleIds), ne(circles.status, "deleted")))
    const circleMap = new Map(circleRows.map((c) => [c.id, c]))
    list = followRows
      .map((f) => {
        const c = circleMap.get(f.circleId)
        if (!c) return null
        return { ...toCircleDTO(c), followedAt: f.createdAt.toISOString() }
      })
      .filter((x): x is FollowedCircleDTO => x !== null)
  }

  // 5. 总数(该用户的关注记录数)
  const allFollows = await db
    .select({ id: circleFollows.id })
    .from(circleFollows)
    .where(eq(circleFollows.userId, userId))

  const result: Paginated<FollowedCircleDTO> = {
    list,
    total: allFollows.length,
    page: pagination.page,
    pageSize: pagination.pageSize,
  }
  return withCors(ok(result), req)
}
```

**Step 4: 运行测试确认通过**

Run:
```bash
cd admin && pnpm exec vitest run tests/integration/api/circles-follow.test.ts
```
Expected: 12 个用例全部 PASS。

**Step 5: Commit**

```bash
git add admin/app/api/circles/followed/route.ts admin/tests/integration/api/circles-follow.test.ts
git commit -m "feat(admin): 我关注的圈子列表接口(分页,排除已删除)"
```

---

### Task 4: 后端 — 圈子详情返回 `isFollowed` / `followCount`

**Files:**
- Modify: `admin/types/api.ts:201-205`（`CircleDetailDTO`，追加两字段）
- Modify: `admin/app/api/circles/[id]/route.ts:1-12,46-76`（import + `fetchCircleDetail` 扩展）
- Modify: `admin/tests/integration/api/circles-crud.test.ts:283-300`（`enqueueFetchCircleDetail` 追加两个 select 队列项）

**Step 1: 写失败测试**

（a）修改 `admin/tests/integration/api/circles-crud.test.ts` 的 `enqueueFetchCircleDetail` helper，追加两个可选参数并压入两个 select 结果：

```ts
/**
 * 组装 fetchCircleDetail 所需的 5 个 select 结果队列
 * (circle + creator + contactCount + followCount + isFollowed)。
 * 现有调用方不传 followCount/isFollowed 时使用默认值,保证老用例不变。
 */
function enqueueFetchCircleDetail(
  queue: Record<string, unknown>[][],
  circle: CircleRow,
  creator: { id: string; name: string; avatarUrl: string | null } | null,
  contactCount: number,
  followCount = 0,
  isFollowed = false
) {
  // 1. circle 行(含 tags 数组)
  queue.push([circle])
  // 2. creator 行(select 部分字段)
  queue.push(creator ? [creator] : [])
  // 3. contact count 行
  queue.push([{ value: contactCount }])
  // 4. follow count 行
  queue.push([{ value: followCount }])
  // 5. isFollowed 行(已关注时返回一行)
  queue.push(isFollowed ? [{ id: "follow-row-id" }] : [])
}
```

（b）在 `describe("GET /api/circles/:id")` 的「returns 200 with detail」用例中，把 `enqueueFetchCircleDetail(queue, circle, creator, 3)` 改为：

```ts
enqueueFetchCircleDetail(queue, circle, creator, 3, 5, true)
```

并在该用例的断言中追加：

```ts
expect(body.data.isFollowed).toBe(true)
expect(body.data.followCount).toBe(5)
```

（c）运行测试确认失败：

```bash
cd admin && pnpm exec vitest run tests/integration/api/circles-crud.test.ts
```
Expected: FAIL，`body.data.isFollowed` 为 `undefined`。

**Step 2: 实现**

（a）`admin/types/api.ts` 的 `CircleDetailDTO` 追加：

```ts
export type CircleDetailDTO = CircleDTO & {
  creator: { id: string; name: string; avatarUrl: string | null }
  tags: string[]
  contactCount: number
  /** 当前用户是否已关注该圈子(未登录场景恒为 false) */
  isFollowed: boolean
  /** 圈子被关注总数 */
  followCount: number
}
```

（b）`admin/app/api/circles/[id]/route.ts`：

- import 处追加 `circleFollows`：

```ts
import {
  circles,
  circleFollows,
  hobbyTags,
  contactLogs,
  users,
} from "@/db/schema"
```

- `fetchCircleDetail` 改为接收 `userId?`，并在 creator / contactCount 之后追加两个查询：

```ts
/** 查询圈子详情并组装 CircleDetailDTO(tags 直接取 circles.tags 数组) */
async function fetchCircleDetail(
  circleId: string,
  userId?: string
): Promise<CircleDetailDTO | null> {
  // 1. 查询圈子本身
  const [circleRow] = await db
    .select()
    .from(circles)
    .where(eq(circles.id, circleId))
  if (!circleRow) return null

  // 2. 查询创建者信息
  const [creatorRow] = await db
    .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, circleRow.creatorId))

  // 3. 统计被联系次数
  const [countRow] = await db
    .select({ value: count() })
    .from(contactLogs)
    .where(eq(contactLogs.circleId, circleId))

  // 4. 统计被关注次数
  const [followCountRow] = await db
    .select({ value: count() })
    .from(circleFollows)
    .where(eq(circleFollows.circleId, circleId))

  // 5. 当前用户是否已关注
  let isFollowed = false
  if (userId) {
    const [followRow] = await db
      .select({ id: circleFollows.id })
      .from(circleFollows)
      .where(
        and(
          eq(circleFollows.circleId, circleId),
          eq(circleFollows.userId, userId)
        )
      )
    isFollowed = !!followRow
  }

  return {
    ...toCircleDTO(circleRow),
    creator: {
      id: creatorRow?.id ?? circleRow.creatorId,
      name: creatorRow?.name ?? "未知用户",
      avatarUrl: creatorRow?.avatarUrl ?? null,
    },
    tags: circleRow.tags ?? [],
    contactCount: countRow?.value ?? 0,
    followCount: followCountRow?.value ?? 0,
    isFollowed,
  }
}
```

- GET 处理器：`const detail = await fetchCircleDetail(id, userId)`
- PUT 处理器（更新后回查）：`const detail = await fetchCircleDetail(id, userId)`

**Step 3: 运行测试确认通过**

```bash
cd admin && pnpm exec vitest run tests/integration/api/circles-crud.test.ts tests/integration/api/circles-follow.test.ts
```
Expected: 全部 PASS。

**Step 4: Commit**

```bash
git add admin/types/api.ts admin/app/api/circles/[id]/route.ts admin/tests/integration/api/circles-crud.test.ts
git commit -m "feat(admin): 圈子详情返回 isFollowed 与 followCount"
```

---

### Task 5: 前端 — API 封装与类型

**Files:**
- Modify: `frontend_uniapp/src/types/index.ts:153-158`（`CircleDetailDTO`）、追加 `FollowedCircleDTO`
- Modify: `frontend_uniapp/src/api/circles.ts:1-8,56-60`（import + 追加 3 个函数）

**Step 1: 类型**

`frontend_uniapp/src/types/index.ts`：

```ts
/** 圈子详情 DTO(含 creator 信息、标签、被联系次数、关注状态) */
export type CircleDetailDTO = CircleDTO & {
  creator: { id: string; name: string; avatarUrl: string | null }
  tags: string[]
  contactCount: number
  /** 当前用户是否已关注该圈子 */
  isFollowed: boolean
  /** 圈子被关注总数 */
  followCount: number
}

/** 我关注的圈子列表项 DTO(用于 /api/circles/followed 响应) */
export type FollowedCircleDTO = CircleDTO & {
  /** 关注时间 */
  followedAt: string
}
```

**Step 2: API**

`frontend_uniapp/src/api/circles.ts`，在 import 追加 `FollowedCircleDTO`，并在文件末尾追加：

```ts
/** 关注圈子(幂等,仅 active 圈子可关注) */
export function followCircle(id: string) {
  return http.post<{ followed: true }>(`/api/circles/${encodeURIComponent(id)}/follow`)
}

/** 取消关注(幂等) */
export function unfollowCircle(id: string) {
  return http.delete<{ followed: false }>(`/api/circles/${encodeURIComponent(id)}/follow`)
}

/** 我关注的圈子列表(分页,按关注时间倒序,排除已删除) */
export function getFollowedCircles(params?: MyCirclesParams) {
  return http.get<Paginated<FollowedCircleDTO>>('/api/circles/followed', {
    ...(params?.page !== undefined ? { page: params.page } : {}),
    ...(params?.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
  })
}
```

**Step 3: 验证**

Run:
```bash
cd frontend_uniapp && pnpm type-check
```
Expected: 无输出（通过）。

**Step 4: Commit**

```bash
git add frontend_uniapp/src/types/index.ts frontend_uniapp/src/api/circles.ts
git commit -m "feat(frontend): 关注圈子 API 封装与类型"
```

---

### Task 6: 前端 — 圈子详情页关注按钮

**Files:**
- Modify: `frontend_uniapp/src/pages/circle/circle.vue`

**Step 1: script 改动**

- import 追加：`import { getCircle, contactCircle, followCircle, unfollowCircle } from '@/api/circles'`
- 新增状态：

```ts
/** 关注状态与操作 */
const followed = ref(false)
const followLoading = ref(false)
```

- 拉取详情成功后同步关注状态（`fetchCircle` 的 success 分支内）：

```ts
const data = await getCircle(id)
circle.value = data
followed.value = !!data.isFollowed
notFound.value = false
```

- 新增关注/取消关注处理器：

```ts
/** 关注/取消关注圈子 */
async function handleFollow() {
  const c = circle.value
  if (!c || followLoading.value) return
  followLoading.value = true
  try {
    if (followed.value) {
      await unfollowCircle(c.id)
      followed.value = false
      uni.showToast({ title: '已取消关注', icon: 'none' })
    }
    else {
      await followCircle(c.id)
      followed.value = true
      uni.showToast({ title: '关注成功', icon: 'success' })
    }
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '操作失败', icon: 'none' })
  }
  finally {
    followLoading.value = false
  }
}
```

**Step 2: template 改动**

（a）底部按钮栏（约 285-307 行）在「联系老师/编辑」主按钮之后、「分享」按钮之前插入关注按钮：

```vue
<view class="flex items-center gap-3">
  <wd-button
    block
    :loading="contactLoading"
    @click="isCreator ? handleEdit() : handleContact()"
  >
    {{ isCreator ? '编辑圈子信息' : '联系老师' }}
  </wd-button>
  <!-- 关注/已关注:创建者无需关注自己的圈子 -->
  <wd-button
    v-if="!isCreator"
    plain
    custom-class="shrink-0"
    :loading="followLoading"
    @click="handleFollow"
  >
    {{ followed ? '已关注' : '关注' }}
  </wd-button>
  <!-- 小程序:原生转发按钮 -->
  <!-- #ifdef MP-WEIXIN -->
  <wd-button plain custom-class="shrink-0" open-type="share">
    分享
  </wd-button>
  <!-- #endif -->
  <!-- H5 微信浏览器:点击引导右上角分享 -->
  <!-- #ifdef H5 -->
  <wd-button plain custom-class="shrink-0" @click="share">
    分享
  </wd-button>
  <!-- #endif -->
</view>
```

（b）成员人数区块（约 266-281 行）追加关注人数行：

```vue
<view class="flex items-center justify-between">
  <text class="text-sm font-medium text-[#333]">
    成员人数
  </text>
  <text class="text-sm text-[#018d71]">
    {{ circle.memberCount }}/{{ maxMembersText }}
  </text>
</view>
<view class="mt-2 flex items-center justify-between">
  <text class="text-sm font-medium text-[#333]">
    关注人数
  </text>
  <text class="text-sm text-[#018d71]">
    {{ circle.followCount }}
  </text>
</view>
```

**Step 3: 验证**

Run:
```bash
cd frontend_uniapp && pnpm type-check
```
Expected: 无输出（通过）。

**Step 4: Commit**

```bash
git add frontend_uniapp/src/pages/circle/circle.vue
git commit -m "feat(frontend): 圈子详情页关注/取消关注按钮与关注数展示"
```

---

### Task 7: 前端 — 我关注的圈子页面 + 入口

**Files:**
- Create: `frontend_uniapp/src/pages/followed-circles/followed-circles.vue`
- Modify: `frontend_uniapp/src/pages.json:108-114`（pages 数组末尾追加）
- Modify: `frontend_uniapp/src/pages/me/me.vue`（设置入口列表追加一项）

**Step 1: 创建页面**

创建 `frontend_uniapp/src/pages/followed-circles/followed-circles.vue`：

```vue
<script lang="ts" setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getFollowedCircles } from '@/api/circles'
import { formatDate } from '@/utils/format'
import type { FollowedCircleDTO } from '@/types'

definePage({
  style: {
    navigationBarTitleText: '我关注的圈子',
  },
})

/** 标签展示最大数量 */
const MAX_TAG_VISIBLE = 3
const PAGE_SIZE = 20

const list = ref<FollowedCircleDTO[]>([])
const loading = ref(false)
const page = ref(1)
const finished = ref(false)

/** 拉取列表;reset=true 时回到第一页 */
async function fetchList(reset = false) {
  if (loading.value) return
  if (reset) {
    page.value = 1
    finished.value = false
  }
  loading.value = true
  try {
    const res = await getFollowedCircles({ page: page.value, pageSize: PAGE_SIZE })
    list.value = reset ? res.list : [...list.value, ...res.list]
    if (list.value.length >= res.total) finished.value = true
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

// 进入时拉取(从详情页返回也会触发 onShow 刷新)
onShow(() => {
  void fetchList(true)
})

/** 下拉刷新 */
onPullDownRefresh(() => {
  fetchList(true).finally(() => {
    uni.stopPullDownRefresh()
  })
})

/** 触底加载下一页 */
onReachBottom(() => {
  if (finished.value) return
  page.value += 1
  void fetchList()
})

/** 跳圈子详情 */
function handleCircleClick(circleId: string) {
  uni.navigateTo({ url: `/pages/circle/circle?id=${circleId}` })
}

/** 返回上一页 */
function handleBack() {
  uni.navigateBack({
    fail() {
      uni.reLaunch({ url: '/pages/me/me' })
    },
  })
}
</script>

<template>
  <view class="flex min-h-screen flex-col bg-[#f7f8fa]">
    <view v-if="loading && list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <view v-else-if="list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        还没有关注任何圈子,去首页发现吧
      </text>
      <wd-button class="mt-4" round size="small" @click="handleBack">返回</wd-button>
    </view>

    <view v-else class="mx-4 mt-3 flex flex-col gap-3">
      <view
        v-for="c in list"
        :key="c.id"
        class="rounded-2xl bg-white p-4"
        @click="handleCircleClick(c.id)"
      >
        <view class="flex items-start justify-between gap-2">
          <view class="min-w-0 flex-1">
            <text class="block truncate text-base font-medium text-[#333]">
              {{ c.title }}
            </text>
            <view class="mt-1 flex items-center gap-1">
              <text class="text-xs text-[#999]">
                {{ c.memberCount }}/{{ c.maxMembers ?? '不限' }}人
              </text>
              <text class="text-xs text-[#999]">
                ·
              </text>
              <text class="text-xs text-[#999]">
                关注于 {{ formatDate(c.followedAt) }}
              </text>
            </view>
            <text v-if="c.activityTime" class="mt-1 block truncate text-xs text-[#999]">
              {{ c.activityTime }}
            </text>
            <view v-if="c.tags.length > 0" class="mt-2 flex flex-wrap gap-2">
              <template v-for="(name, i) in c.tags" :key="name">
                <text v-if="i < MAX_TAG_VISIBLE" class="rounded-full bg-[#e8f5f1] px-2.5 py-1 text-xs text-[#018d71]">
                  {{ name }}
                </text>
              </template>
              <text v-if="c.tags.length > MAX_TAG_VISIBLE" class="text-xs text-[#999]">
                +{{ c.tags.length - MAX_TAG_VISIBLE }}
              </text>
            </view>
          </view>
        </view>
      </view>
      <text v-if="finished && list.length > 0" class="py-3 text-center text-xs text-[#999]">
        没有更多了
      </text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
```

> 依赖检查：`onReachBottom` / `onPullDownRefresh` 由 `@dcloudio/uni-app` 自动导入（本项目 `auto-import` 已启用，`my-published.vue` 同款用法）；`formatDate` 已存在于 `@/utils/format`。

**Step 2: 注册页面**

`frontend_uniapp/src/pages.json` 的 `pages` 数组末尾（`user-home` 条目之后）追加：

```json
{
  "path": "pages/followed-circles/followed-circles",
  "type": "page",
  "style": {
    "navigationBarTitleText": "我关注的圈子"
  }
}
```

**Step 3: 「我的」页加入口**

`frontend_uniapp/src/pages/me/me.vue`：

（a）script 追加跳转函数（放在 `handleMyCircles` 之后）：

```ts
/** 跳我关注的圈子页 */
function handleFollowedCircles() {
  uni.navigateTo({ url: '/pages/followed-circles/followed-circles' })
}
```

（b）在「我的圈子」条目（`handleMyCircles` 那个 `view`）之后追加：

```vue
<view class="flex items-center justify-between border-b border-[#f5f5f5] px-4 py-4" @click="handleFollowedCircles">
  <view class="flex flex-col">
    <text class="text-sm text-[#333] font-medium">
      我关注的圈子
    </text>
    <text class="mt-0.5 text-xs text-[#999]">
      一键回看感兴趣的圈子
    </text>
  </view>
  <text class="text-sm text-[#ccc]">
    ›
  </text>
</view>
```

**Step 4: 验证**

Run:
```bash
cd frontend_uniapp && pnpm type-check
```
Expected: 无输出（通过）。

可选冒烟：`pnpm build:mp` 能正常产出（页面注册被 `uni-pages` 插件校验）。

**Step 5: Commit**

```bash
git add frontend_uniapp/src/pages/followed-circles/followed-circles.vue frontend_uniapp/src/pages.json frontend_uniapp/src/pages/me/me.vue
git commit -m "feat(frontend): 我关注的圈子页面与个人中心入口"
```

---

### Task 8: 回归验证

**Files:** 无（纯验证）

**Step 1: 后端全量验证**

Run:
```bash
cd admin && pnpm exec tsc --noEmit && pnpm test
```
Expected: tsc 无输出;vitest 全部用例（含新增 follow 用例、既有 crud 用例）PASS。

**Step 2: 前端全量验证**

Run:
```bash
cd frontend_uniapp && pnpm type-check && pnpm test:run
```
Expected: type-check 无输出;vitest 前端用例 PASS。

**Step 3: 手工冒烟（可选，需本地起服务）**

- 启动后端 `cd admin && pnpm dev`，小程序 `cd frontend_uniapp && pnpm dev:mp`。
- 验证流程：登录 → 进入某 active 圈子详情 → 点「关注」变「已关注」→ 我的 → 我关注的圈子 → 列表含该圈子 → 回详情点「已关注」取消 → 列表刷新后消失。

**Step 4: Commit（如有遗留改动）**

```bash
git status
```
如无未提交改动则无需提交。

---

## 关键命令汇总

```bash
# 后端
cd admin && pnpm db:push
cd admin && pnpm exec tsc --noEmit
cd admin && pnpm exec vitest run tests/integration/api/circles-follow.test.ts
cd admin && pnpm test

# 前端
cd frontend_uniapp && pnpm type-check
cd frontend_uniapp && pnpm test:run
```

## 提交建议（每完成一个 Task 提交一次，需用户确认后执行）

- Task 1：`feat(admin): 新增 circle_follows 关注关系表`
- Task 2：`feat(admin): 圈子关注/取消关注接口(幂等,仅 active 可关注)`
- Task 3：`feat(admin): 我关注的圈子列表接口(分页,排除已删除)`
- Task 4：`feat(admin): 圈子详情返回 isFollowed 与 followCount`
- Task 5：`feat(frontend): 关注圈子 API 封装与类型`
- Task 6：`feat(frontend): 圈子详情页关注/取消关注按钮与关注数展示`
- Task 7：`feat(frontend): 我关注的圈子页面与个人中心入口`
- Task 8：回归验证，无提交

> 注：实际提交需用户明确同意后再执行（遵循仓库提交规范，不擅自 commit）。

## 实现偏差记录（执行后补充）

1. **Task 1 Step 3（db:push）跳过**：当前环境无 docker/PostgreSQL，按计划风险说明跳过真实库同步；schema 变更已由 tsc 验证，实际部署时执行 `pnpm db:push` 即可。
2. **Task 3 提前添加 `FollowedCircleDTO` 类型**：`admin/types/api.ts` 中该类型本计划放在 Task 4，但 Task 3 的路由与测试已依赖，故提前添加。
3. **Task 3 路由增加 JS 侧兜底过滤**：mock 不应用 where 条件，为让「排除 deleted」契约可测，在组装阶段增加 `c.status === "deleted"` 过滤（与 DB 层 `ne()` 双保险）。
4. **Task 7 pages.json 为生成文件**：`frontend_uniapp/.gitignore` 忽略 `src/pages.json`，由 uni-pages 插件根据各页 `definePage` 自动生成。故不手动注册页面，改为在 `definePage` 中声明 `enablePullDownRefresh`；插件已自动生成 `followed-circles` 条目（仅保留一处，删除手动重复项）。
5. **Task 7 移除卡片 tags 展示**：`FollowedCircleDTO = CircleDTO & { followedAt }` 无 `tags` 字段（后端 `toCircleDTO` 也不含），`my-circles.vue` 的 tags 用的是 `MatchCircleDTO`。为避免运行时崩溃并保持一致，卡片不展示 tags（与 `my-published.vue` 一致）。
6. **Task 8 前端基线问题**：`pnpm type-check` 有 20 个 `node_modules/@wot-ui/ui` 既有类型错误（与本次改动无关，本次文件零错误）；`pnpm test:run` 有 1 个既有失败（`src/tabbar/TabbarItem.test.ts`「isBulge=true 时不渲染文本」，未触碰相关文件）。
7. **最终审查质量改进**（评审通过后追加）：
   - `follow/route.ts` 幂等从「先查后插」改为 `onConflictDoNothing({ target: [circleId, userId] })` 原子插入（遵循 `seed.ts`/`account-service.ts` 既有模式，消除 TOCTOU 竞态），测试同步改为断言「仅 1 次 select + onConflictDoNothing 被调用」。
   - `followed-circles.vue` 的 `finished` 判定补 `res.list.length < PAGE_SIZE` 兜底（`total` 统计含已删除圈子的既有口径偏差不再导致无限加载）。
   - `admin/lib/api.ts` 的 `corsOptions` Allow-Methods 补 `DELETE`（与 `next.config.ts` 生产头对齐，修复 H5 跨域 DELETE 预检）。

## 风险与回滚

- **路由冲突**：`/api/circles/followed` 与 `/api/circles/[id]` —— Next.js 静态段优先于动态段，且 `/mine` 已有同款先例；回归时用 `GET /api/circles/followed` 冒烟确认未被 `[id]` 捕获。
- **既有 crud 测试破坏**：`fetchCircleDetail` 从 3 个 select 变 5 个 —— 通过给 `enqueueFetchCircleDetail` 加**带默认值的可选参数**，老用例无需改动即可继续通过。
- **mock 缺 `db.delete`**：仅新建的 `circles-follow.test.ts` 用到，该文件 mock 已内置 delete 链，不影响既有测试文件。
- **`db:push` 直连数据库**：若当前环境未启动 PostgreSQL（docker 不可用），Task 1 Step 3 可跳过，其余任务（mock 测试 + tsc）不依赖真实数据库。
- 回滚：任一 Task 可直接 `git restore` 对应文件；若已提交则 `git revert`。
