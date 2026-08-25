# 热门兴趣(Hot Interests)实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 新增「热门兴趣」能力:记录用户的兴趣行为事件(保存兴趣标签/搜索关键词/创建圈子标签),按「与锚定日期 2026-08-24 的天数差」为每件事件计算得分,提供时间范围筛选的热门兴趣 API,并在兴趣选择页前端展示。

**Architecture:** 新增 append-only 事件表 `interest_events`(每行含 `eventDate`/`score`,`UNIQUE(user_id, tag_name, event_date)` 保证「同用户同标签同天仅一条」)。事件在三个业务触发点旁路写入(失败仅日志不影响主请求)。查询时按时间窗口过滤 → `GROUP BY tag_name` `SUM(score)` 降序取 Top K → 复用 `selectTagsWithCategory()` 关联分类映射 `HotInterestDTO`。新 API `GET /api/interests/hot` 公开访问,同时替换 `/api/hobby-tags/search` q 为空时的占位热门结果。

**Tech Stack:** Next.js 16 App Router · Drizzle ORM 0.45 · PostgreSQL 16 · Zod 4(admin);uni-app · Vue3 · wot-ui · alova http(frontend_uniapp);Vitest + mock db 集成测试。

---

## 关键文件速查

| 文件 | 动作 |
| --- | --- |
| `admin/db/schema.ts` | MODIFY:新增 `interestEvents` 表 + `INTEREST_EVENT_TYPES` 联合 |
| `admin/lib/logger.ts` | MODIFY:`LOG_PREFIX` 新增 `INTEREST` |
| `admin/lib/interest-events.ts` | NEW:事件写入服务(`chinaDay`/`interestScore`/`recordInterestEvents` 幂等旁路) |
| `admin/lib/interest-ranking.ts` | NEW:热度计算服务(`computeHotInterests` SUM 聚合) |
| `admin/lib/search/tag-search.ts` | MODIFY:删除 `listPopularTags` 占位实现 |
| `admin/types/api.ts` | MODIFY:新增 `HotInterestDTO` |
| `admin/app/api/interests/hot/route.ts` | NEW:GET 热门兴趣 API(公开) |
| `admin/app/api/hobby-tags/search/route.ts` | MODIFY:q 非空记搜索事件;q 为空接新算法 |
| `admin/app/api/users/me/hobby-tags/route.ts` | MODIFY:保存标签后写 `hobby_tag_save` 事件 |
| `admin/app/api/circles/route.ts` | MODIFY:建圈后写 `circle_tag_create` 事件 |
| `frontend_uniapp/src/api/tags.ts` | MODIFY:新增 `getHotInterests` |
| `frontend_uniapp/src/types/index.ts` | MODIFY:新增 `HotInterestDTO` |
| `frontend_uniapp/src/components/TagSelectorPopup/TagSelectorPopup.vue` | MODIFY:热门兴趣区块 |

## 概念要点

- **得分定义**:得分 = 事件所在日期与锚定日期 `2026-08-24` 的天数差(按东八区自然日切「天」,向下取整,早于锚定日按 0 计)。写入时计算落库(快照值)。
- **每日幂等**:`UNIQUE(user_id, tag_name, event_date)` + `insert(...).onConflictDoNothing({ target })`——同用户同标签同天重复提交静默跳过。去重发生在写入时,查询聚合无需 `COUNT(DISTINCT)`。
- **热度聚合**:窗口内 `SUM(score)` 按 `tag_name` 分组降序取前 k。`ORDER BY sum DESC LIMIT k` 为 PG top-N 堆排序,窗口过滤走 `(event_date, tag_name)` 索引。
- **旁路写入**:事件写入失败仅 `logger.error(LOG_PREFIX.INTEREST, ...)`,不影响保存兴趣/建圈/搜索主请求(参照 notifications 子系统)。

---

### Task 1:Schema + 日志前缀 + 计划文档落盘

**Files:**
- Create: `docs/plans/2026-08-25-hot-interests-api.md`(本文件)
- Modify: `admin/db/schema.ts`(末尾追加 `interestEvents` 表)
- Modify: `admin/lib/logger.ts:33-46`(`LOG_PREFIX` 新增 `INTEREST`)
- Test: `admin/tests/unit/db/schema.test.ts`

**Step 1: 写失败测试**

在 `tests/unit/db/schema.test.ts` 增加 `interestEvents` 导入与断言(表存在、列齐全、`eventDate`/`score` 存在、事件类型联合取值):

```ts
import {
  // ... 现有导入
  interestEvents,
  INTEREST_EVENT_TYPES,
  type InterestEventType,
} from "@/db/schema"

// describe 内新增:
it("exports interestEvents table", () => {
  expect(interestEvents).toBeDefined()
})

it("interestEvents table has the expected columns", () => {
  const cols = Object.keys(interestEvents)
  expect(cols).toEqual(
    expect.arrayContaining([
      "id",
      "userId",
      "tagName",
      "eventType",
      "eventDate",
      "score",
      "createdAt",
    ])
  )
})

it("InterestEventType covers the three event sources", () => {
  const t: InterestEventType = "hobby_tag_save"
  expect(t).toBe("hobby_tag_save")
  const t2: InterestEventType = "tag_search"
  expect(t2).toBe("tag_search")
  const t3: InterestEventType = "circle_tag_create"
  expect(t3).toBe("circle_tag_create")
})

it("INTEREST_EVENT_TYPES contains exactly three types", () => {
  expect(INTEREST_EVENT_TYPES).toEqual([
    "hobby_tag_save",
    "tag_search",
    "circle_tag_create",
  ])
})
```

**Step 2: 运行确认失败**

Run: `pnpm test`
Expected: FAIL — `interestEvents` / `INTEREST_EVENT_TYPES` 未导出(模块导入报错)。

**Step 3: 实现 schema + 日志前缀**

`admin/db/schema.ts` 末尾追加(遵循项目惯例:text 列 + TS 联合、uuid defaultRandom、timestamp withTimezone):

```ts
/**
 * 兴趣行为事件类型:
 * - `hobby_tag_save`    保存个人兴趣标签(PUT /api/users/me/hobby-tags)
 * - `tag_search`        搜索兴趣关键词(GET /api/hobby-tags/search 带 q)
 * - `circle_tag_create` 创建圈子选择标签(POST /api/circles)
 */
export const INTEREST_EVENT_TYPES = ["hobby_tag_save", "tag_search", "circle_tag_create"] as const
export type InterestEventType = (typeof INTEREST_EVENT_TYPES)[number]

/**
 * 兴趣行为事件表(append-only + 每日幂等)。
 *
 * 每行 = 用户 + 标签名 + 事件类型 + 事件日期 + 得分。
 * - `tagName` 存 hobby_tags.name 快照(与 users.tags / circles.tags 惯例一致,不设 FK);
 * - `eventDate` 为东八区自然日 YYYY-MM-DD;
 * - `score` = 事件日与锚定日期 2026-08-24 的天数差(写入时计算,>=0);
 * - `UNIQUE(user_id, tag_name, event_date)` 保证同用户同标签同天仅一条(幂等)。
 */
export const interestEvents = pgTable(
  "interest_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tagName: text("tag_name").notNull(),
    eventType: text("event_type").$type<InterestEventType>().notNull(),
    eventDate: date("event_date").notNull(),
    score: integer("score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // 幂等:同一用户同一天对同一标签仅一条
    uniqueIndex("interest_events_user_tag_day_idx").on(
      table.userId,
      table.tagName,
      table.eventDate
    ),
    // 读路径:时间窗口过滤 + 分组聚合
    index("interest_events_date_tag_idx").on(table.eventDate, table.tagName),
  ]
)

export type InterestEvent = typeof interestEvents.$inferSelect
export type NewInterestEvent = typeof interestEvents.$inferInsert
```

`admin/lib/logger.ts` 的 `LOG_PREFIX` 追加 `INTEREST: "INTEREST"`。

**Step 4: 运行确认通过**

Run: `pnpm test`
Expected: PASS(全部单测绿)。

**Step 5: 生成迁移**

Run: `pnpm db:generate`
Expected: 生成 `drizzle/xxxx_interest_events.sql`(建表 + `interest_events_user_tag_day_idx` 唯一索引 + `interest_events_date_tag_idx` 复合索引)。人工 review 生成 SQL 后 `pnpm db:migrate`。

**Step 6: Commit**

```bash
git add docs/plans/2026-08-25-hot-interests-api.md admin/db/schema.ts admin/lib/logger.ts admin/tests/unit/db/schema.test.ts admin/drizzle
git commit -m "feat: add interest_events schema for hot interests"
```

---

### Task 2:事件写入服务 + 热度计算服务(纯函数优先,TDD)

**Files:**
- Create: `admin/lib/interest-events.ts`
- Create: `admin/lib/interest-ranking.ts`
- Test: `admin/tests/unit/lib/interest-events.test.ts`
- Test: `admin/tests/unit/lib/interest-ranking.test.ts`

**Step 1: 写失败测试(时区/跨天/幂等/聚合)**

`tests/unit/lib/interest-events.test.ts`:
- `chinaDay`:2026-08-25 09:00 UTC+8 → `"2026-08-25"`;`2026-08-25 00:30 CST`(即 2026-08-24T16:30Z)→ `"2026-08-25"`(凌晨不跨天);`2026-08-24T16:00Z` → `"2026-08-25"`。
- `interestScore`:锚定日当天 `"2026-08-24"` → 0;`"2026-08-25"` → 1;`"2026-08-20"` → 0(早于锚定日);`"2026-08-31"` → 7。
- `recordInterestEvents`:同用户同标签同天重复 → `insert` 仅一次且 `onConflictDoNothing` target 正确;insert 抛错时函数不抛出(旁路)。

`tests/unit/lib/interest-ranking.test.ts`:
- `computeHotInterests`:`groupBy(tagName)` 聚合队列返回行 → 按 `totalScore` 降序;窗口过滤条件含 `eventDate BETWEEN`;关联分类时非 approved/缺失标签跳过;空结果返回 `{ list: [] }`。

**Step 2: 运行确认失败**

Run: `pnpm test tests/unit/lib/interest-events.test.ts tests/unit/lib/interest-ranking.test.ts`
Expected: FAIL(模块不存在)。

**Step 3: 实现服务**

`admin/lib/interest-events.ts`:

```ts
import { db } from "@/lib/db"
import { interestEvents, type InterestEventType, type NewInterestEvent } from "@/db/schema"
import { logger, LOG_PREFIX } from "@/lib/logger"

const DAY_MS = 86_400_000
/** 锚定日期(东八区自然日);长期运行建议改为配置项避免分数整体膨胀 */
export const ANCHOR_DATE = "2026-08-24"

/** 东八区自然日:本地时间 +8h 后取 UTC 日期部分,返回 YYYY-MM-DD */
export function chinaDay(date: Date): string {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const d = String(shifted.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** 得分 = (事件日 − 锚定日) 的天数差,向下取整,早于锚定日按 0 计 */
export function interestScore(day: string): number {
  const [y, m, d] = day.split("-").map(Number)
  const anchor = new Date(`${ANCHOR_DATE}T00:00:00Z`).getTime()
  const dayMs = Date.UTC(y, m - 1, d)
  return Math.max(0, Math.floor((dayMs - anchor) / DAY_MS))
}

export type InterestEventEntry = {
  userId: string
  tagNames: string[]
  eventType: InterestEventType
}

/** 旁路写入兴趣事件:失败仅记日志,不影响主请求;同用户同标签同天重复被唯一约束幂等跳过 */
export async function recordInterestEvents(entries: InterestEventEntry[]): Promise<void> {
  try {
    const eventDate = chinaDay(new Date())
    const score = interestScore(eventDate)
    const rows: NewInterestEvent[] = []
    for (const entry of entries) {
      for (const tagName of entry.tagNames) {
        rows.push({ userId: entry.userId, tagName, eventType: entry.eventType, eventDate, score })
      }
    }
    if (rows.length === 0) return
    await db.insert(interestEvents).values(rows).onConflictDoNothing({
      target: [interestEvents.userId, interestEvents.tagName, interestEvents.eventDate],
    })
  } catch (err) {
    logger.error(LOG_PREFIX.INTEREST, "record interest events failed", {
      reason: err instanceof Error ? err.message : "unknown",
      count: entries.length,
    })
  }
}
```

`admin/lib/interest-ranking.ts`:

```ts
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { hobbyTags, interestEvents } from "@/db/schema"
import { selectTagsWithCategory, toTagDTO } from "@/lib/search/tag-search"
import type { HotInterestDTO } from "@/types/api"
import { ANCHOR_DATE } from "@/lib/interest-events"

export type HotInterestsParams = {
  days?: number
  startDate?: string // YYYY-MM-DD,优先于 days,含当日
  endDate?: string   // YYYY-MM-DD,含当日
  limit?: number     // Top K,默认 10
}

/** 解析时间窗口:startDate/endDate 优先(endDate 含当日);否则取最近 days 天(默认 30) */
export function resolveWindow(params: HotInterestsParams): { start: string; end: string } {
  const { days = 30, startDate, endDate } = params
  if (startDate || endDate) {
    return {
      start: startDate ?? "1970-01-01",
      end: endDate ?? new Date().toISOString().slice(0, 10),
    }
  }
  const end = new Date()
  const start = new Date(end.getTime() - days * 86_400_000)
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

/**
 * 计算热门兴趣 Top K:
 * 1) 按 eventDate 窗口过滤 → 2) GROUP BY tag_name SUM(score) 降序 → 3) 关联分类映射 HotInterestDTO。
 * 事件中的标签已删除/改名/非 approved 时跳过。
 */
export async function computeHotInterests(params: HotInterestsParams = {}): Promise<{ list: HotInterestDTO[] }> {
  const { limit = 10 } = params
  const { start, end } = resolveWindow(params)

  const totalScore = sql<number>`sum(${interestEvents.score})`.as("total_score")
  const rows = await db
    .select({ tagName: interestEvents.tagName, totalScore })
    .from(interestEvents)
    .where(and(gte(interestEvents.eventDate, start), lte(interestEvents.eventDate, end)))
    .groupBy(interestEvents.tagName)
    .orderBy(desc(totalScore))
    .limit(limit)

  if (rows.length === 0) return { list: [] }

  const tagRows = await selectTagsWithCategory().where(
    and(inArray(hobbyTags.name, rows.map((r) => r.tagName)), eq(hobbyTags.status, "approved"))
  )
  const tagByName = new Map(tagRows.map((t) => [t.name, t]))

  const list: HotInterestDTO[] = []
  for (const row of rows) {
    const tag = tagByName.get(row.tagName)
    if (tag) list.push({ ...toTagDTO(tag), heat: Number(row.totalScore) })
  }
  return { list }
}
```

> 注:`resolveWindow` 用 `toISOString().slice(0,10)` 得到 UTC 自然日;`computeHotInterests` 对 `event_date`(date 列)与 `YYYY-MM-DD` 字符串比较,PG 会隐式转 date,`lte` 即含 end 当日,无需 +1 天。

**Step 4: 运行确认通过**

Run: `pnpm test tests/unit/lib/interest-events.test.ts tests/unit/lib/interest-ranking.test.ts`
Expected: PASS。

**Step 5: Commit**

```bash
git add admin/lib/interest-events.ts admin/lib/interest-ranking.ts admin/tests/unit/lib/interest-events.test.ts admin/tests/unit/lib/interest-ranking.test.ts
git commit -m "feat: add interest event recording and hot ranking services"
```

---

### Task 3:接入三个触发点 + 集成测试

> 前置:用 superpowers:lsp-code-analysis / code-explorer 核查三个路由精确插入位置与存量测试 mock 约定。

**Files:**
- Modify: `admin/app/api/users/me/hobby-tags/route.ts`(`UPDATE users` 成功后、`return ok` 前)
- Modify: `admin/app/api/circles/route.ts`(`notifyAdmins` 之后、`return ok` 前)
- Modify: `admin/app/api/hobby-tags/search/route.ts`(q 非空命中后、返回前)
- Test: `admin/tests/integration/api/interest-events-trigger.test.ts`(NEW)
- Test: `admin/tests/integration/api/users-me-tags.test.ts`(MODIFY:补 insert mock 与事件断言)
- Test: `admin/tests/integration/api/circles-crud.test.ts`(MODIFY:`chainInsert` 补 `onConflictDoNothing`,insert 次数 2→3)
- Test: `admin/tests/integration/api/tags-search.test.ts`(MODIFY:补 `readUserFromToken` mock)

**Step 1: 写失败测试(触发点 + 幂等 + 旁路失败)**

`tests/integration/api/interest-events-trigger.test.ts`(参照 `notification-triggers.test.ts` 的 `vi.hoisted` + `chainInsert` 约定):
- 保存标签:mock update 成功 + insert 返回链 → 断言 `chainInsert.values` 收到 `eventType='hobby_tag_save'`、`eventDate=今日(东八区)`、`score=interestScore(今日)`。
- 建圈:insert 队列(circles + circleMembers + interest_events)→ 断言第三条为 `circle_tag_create`。
- 搜索:q 非空 + `readUserFromToken` 返回登录用户 → 断言插入 `tag_search` 且 `tagName` 为命中标签;游客(q 非空但未登录)→ 不插入。
- 幂等:单测层已覆盖 `onConflictDoNothing` target。
- 旁路失败:insert 抛错 → 主请求仍 200/201。

**Step 2: 运行确认失败**

Run: `pnpm test tests/integration/api/interest-events-trigger.test.ts`
Expected: FAIL。

**Step 3: 实现触发点接入**

三个路由在指定位置调用 `recordInterestEvents([...])`(导入自 `@/lib/interest-events`),参数见概念要点中的触发点表。

**Step 4: 更新存量测试(users-me-tags / circles-crud / tags-search)并运行确认通过**

- `users-me-tags.test.ts`:mockDb 增加 `insert` mock(`onConflictDoNothing` 链),断言事件写入。
- `circles-crud.test.ts`:`chainInsert` 补 `onConflictDoNothing: vi.fn(() => chainInsert)`;`toHaveBeenCalledTimes(2)` 改 3。
- `tags-search.test.ts`:补 `vi.mock("@/lib/auth/session-token")` 的 `readUserFromTokenMock`;select 队列断言更新(q 为空:聚合 select + 分类 select)。

Run: `pnpm test`
Expected: PASS(全量)。

**Step 5: Commit**

```bash
git add admin/app/api/users/me/hobby-tags/route.ts admin/app/api/circles/route.ts admin/app/api/hobby-tags/search/route.ts admin/tests/integration/api/interest-events-trigger.test.ts admin/tests/integration/api/users-me-tags.test.ts admin/tests/integration/api/circles-crud.test.ts admin/tests/integration/api/tags-search.test.ts
git commit -m "feat: record interest events at three trigger points"
```

---

### Task 4:热门兴趣 API + 搜索接口替换占位

**Files:**
- Create: `admin/app/api/interests/hot/route.ts`
- Modify: `admin/types/api.ts`(`HotInterestDTO`)
- Modify: `admin/app/api/hobby-tags/search/route.ts`(q 为空分支 → `computeHotInterests`)
- Modify: `admin/lib/search/tag-search.ts`(删除 `listPopularTags`)
- Test: `admin/tests/integration/api/interests-hot.test.ts`(NEW)
- Test: `admin/tests/unit/lib/search/tag-search.test.ts`(MODIFY:删 `listPopularTags` describe)
- Test: `admin/tests/integration/api/tags-search.test.ts`(MODIFY:q 为空用例)

**Step 1: 写失败测试**

`tests/integration/api/interests-hot.test.ts`(mock db 约定):
- 参数非法:`days=0`/`days=91`/`limit=0`/`limit=51`/坏日期格式 → 400。
- 合法:聚合 select 返回 → 分类 select 返回 → 断言响应 `list` 按 `heat` 降序、含 `heat`/`name`/`category`。
- 空结果:聚合 select 空 → `{ list: [] }`。
- 窗口参数透传:`startDate/endDate` 优先于 `days`,断言 where 队列条件。

**Step 2: 运行确认失败**

Run: `pnpm test tests/integration/api/interests-hot.test.ts`
Expected: FAIL。

**Step 3: 实现 API + DTO + 替换占位**

`types/api.ts` 追加:

```ts
export type HotInterestDTO = TagDTO & {
  /** 时间窗口内该标签的得分总和 */
  heat: number
}
```

`app/api/interests/hot/route.ts`(公开,参照 `hobby-tags/search/route.ts` 模式:zod 校验 + `ok`/`fail`/`withCors`):

```ts
const hotQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
})
```

`search/route.ts` q 为空分支改为 `computeHotInterests({ limit })`;删除 `tag-search.ts` 的 `listPopularTags` 及其 `desc` 导入(如不再使用)。

**Step 4: 运行确认通过(含存量测试更新)**

- `tag-search.test.ts` 删 `listPopularTags` describe;`tags-search.test.ts` q 为空用例断言 `heat` 字段与 select 队列。

Run: `pnpm test`
Expected: PASS(全量)。

**Step 5: Commit**

```bash
git add admin/app/api/interests/hot/route.ts admin/types/api.ts admin/app/api/hobby-tags/search/route.ts admin/lib/search/tag-search.ts admin/tests/integration/api/interests-hot.test.ts admin/tests/unit/lib/search/tag-search.test.ts admin/tests/integration/api/tags-search.test.ts
git commit -m "feat: add hot interests API and replace placeholder hot tags"
```

---

### Task 5:前端集成(热门兴趣区块)

**Files:**
- Modify: `frontend_uniapp/src/api/tags.ts`
- Modify: `frontend_uniapp/src/types/index.ts`
- Modify: `frontend_uniapp/src/components/TagSelectorPopup/TagSelectorPopup.vue`

**Step 1: 类型 + API 客户端**

`src/types/index.ts` 追加 `HotInterestDTO`(基于现有 `TagDTO` + `heat`);`src/api/tags.ts` 新增:

```ts
export function getHotInterests(params?: { days?: number; startDate?: string; endDate?: string; limit?: number }) {
  return http.get<{ list: HotInterestDTO[] }>('/api/interests/hot', { ...params })
}
```

**Step 2: 弹窗热门区块**

`TagSelectorPopup.vue`:在分类态(未输入关键词)顶部展示「热门兴趣」标签区——`onShow`/挂载时拉 `getHotInterests({ days: 7, limit: 12 })`;失败静默隐藏不阻塞分类树;点击标签走现有选中逻辑。

**Step 3: 验证**

Run: `pnpm type-check` + `pnpm lint`(frontend_uniapp)
Expected: PASS。H5 手动验证:打开兴趣选择弹窗,未输入时可见热门兴趣,点击可选中。

**Step 4: Commit**

```bash
git add frontend_uniapp/src/api/tags.ts frontend_uniapp/src/types/index.ts frontend_uniapp/src/components/TagSelectorPopup/TagSelectorPopup.vue
git commit -m "feat: show hot interests in tag selector popup"
```

---

### Task 6:收尾质量门 + 文档

**Step 1: admin 质量门**

Run: `pnpm lint`
Expected: PASS

Run: `pnpm test`
Expected: PASS

Run: `pnpm build`(含类型检查;若离线仅 Google Fonts 拉取失败,用 `node node_modules/typescript/bin/tsc --noEmit` 替代)
Expected: PASS

**Step 2: frontend_uniapp 质量门**

Run: `pnpm lint` + `pnpm type-check`
Expected: PASS

**Step 3: 更新文档**

- `README.md` 若有相关说明则补充;或在本计划追加「完成记录」。
- 确认 `docs/plans/2026-08-25-hot-interests-api.md` 与实际实现一致。

**Step 4: Commit**

```bash
git add README.md docs/plans/2026-08-25-hot-interests-api.md
git commit -m "docs: record hot interests implementation"
```

---

## 质量门(Quality Gates)

- `admin`:`pnpm lint` ✅ · `pnpm test` ✅ · `pnpm build`(含类型检查)✅
- `frontend_uniapp`:`pnpm lint` ✅ · `pnpm type-check` ✅

## Non-goals(本期不做)

- 预聚合日桶表 / 物化视图(`GROUP BY event_date, tag_name` 离线滚聚合)——表结构已按 `eventDate` 预留,列为后续演进。
- 热门兴趣的个性化(按城市/用户偏好加权)。
- 管理后台热门兴趣统计页。
- 锚定日期 `2026-08-24` 动态化(本期为常量,注释已标注可改配置)。
