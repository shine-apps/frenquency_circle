# 消息子系统实现计划

- **日期**:2026-08-19
- **分支**:已确认使用**新建 `feat/notification-subsystem`(基于 `main`)**,当前实现即在此分支进行。
- **状态**:计划草案(待评审)

## Goal

新增一个通用「消息 / 通知」子系统,让系统能够向特定用户推送站内消息。每条消息包含**文本内容**(标题 + 正文)与**引导打开的页面链接**(`linkUrl` + `linkTarget`)。首批落地的业务场景:

1. **创建圈子 → 通知所有管理员审核**:有人创建圈子(状态为待审核 `pending`)时,所有 `role = 'ADMIN'` 的用户收到「待审核」通知,链接指向后台审核页。
2. **管理员审核结果 → 通知圈子创建者**:管理员通过 / 拒绝圈子后,圈子 `creatorId` 收到「通过 / 被拒绝」通知,链接指向圈子详情页。
3. **关注圈子 → 通知圈子创建者**:有人关注某圈子时,该圈子 `creatorId` 收到「XX 关注了你的圈子」通知,链接指向圈子详情页。

> 复用同一套通知机制,后续(教师认证申请、匹配结果等)可按相同模式低成本接入。

## Context

### 现有代码库(已探查)

- **后端 `admin`**:Next.js 16 + Drizzle ORM + PostgreSQL。约定见 `admin/AGENTS.md`:**类型优先 + 测试驱动**;API 用 `ok()` / `fail()` / `withCors()`(`lib/api.ts`),日志用 `LOG_PREFIX`(`lib/logger.ts`);鉴权用 `requireSession()` / `requireAdmin()`(`lib/auth-utils.ts`);`pnpm test` 运行(vitest)。
- **测试架构(重要)**:`tests/integration/api/*` 是 **mock 集成测试,非真实数据库**。模式见 `tests/integration/api/circles-follow.test.ts`:
  - `vi.mock("@/lib/db")` 用 `mockDb`,其中 `select` 返回**预置队列** `selectResultsQueue.shift()` 的链对象(`from/where/orderBy/limit/offset/then`),`insert` 返回 `chainInsert`(串联 `.values()`、`.onConflictDoNothing()`、`.then()`)。
  - `vi.mock("@/lib/auth/session-token")` 控制 `readUserFromTokenMock` 返回值;`vi.mock("@/lib/logger")` 提供静默 logger。
  - **通知相关测试必须遵循此约定**:`notifyAdmins` 需要 mock select 返回 ADMIN 行;`notify*` 的 insert 需断言 `chainInsert.values` 收到的数组。
- **关键表**(`admin/db/schema.ts`):
  - `users`:`id: uuid`,`role: text`(`'USER' | 'TEACHER' | 'ADMIN'`,默认 `'USER'`)。
  - `circles`:`id: uuid`,`creatorId: uuid`(指向创建者),`title`;`status: text`(第 374 行,**非枚举,默认 `'active'`**;取值包括建圈时写入的 `pending`、管理员可置的 `active`/`offline`/`violated`/`rejected`,以及 `deleted`)。注意:**`status` 是 `text` 列,不是 `pgEnum`**——与计划中 `notifications` 采用 `pgEnum` 需区分(见 Data Model 注)。
  - `circleMembers`:`circleId`,`userId`,`role`(`'owner' | 'member'`)。
  - `circleFollows`:`circleId`,`userId`(`followerId`);唯一索引 `circle_follows_circle_user_idx`(幂等)。
  - `teacherApplications`:`id`,`circleId`,`userId`,`status`,`reviewNote`(审核备注/驳回原因,可选)。
- **触发点(已核查真实路由,确认事实如下)**:
  - `POST /api/circles`(`app/api/circles/route.ts`):**写入 `status: 'pending'`(第 163 行)**,且**仅 `TEACHER` 角色可创建**(第 79 行 `role !== "TEACHER"` 拦截)。创建者必为 TEACHER,与 ADMIN 不重叠 → 建圈通知管理员场景**无自通知风险**。插入后返回 `circleId`。
  - `POST /api/circles/[id]/follow`(`app/api/circles/[id]/follow/route.ts`):当前仅 `select({ id, status })` 校验 active,**未取 `title` / `creatorId` / 关注者昵称**。插入关注记录(幂等,`onConflictDoNothing`)。需补查 `circles(creatorId, title)` 与 `users(name)` 才能拼文案,并加 `followerId !== creatorId` 判断。
  - `PATCH /api/admin/circles/[id]`(`app/api/admin/circles/[id]/route.ts`):管理员审核,置 `status`(enum `active`/`offline`/`violated`/`rejected`)+ 可选 `reviewNote`(第 45/123 行,驳回原因)。**已 `select()` 出 `current`(含 `creatorId`/`title`)**,可直接复用,无需额外查询。联动逻辑在 status 更新后依次执行:`pending→active` 升级 TEACHER + 通过 teacher_application(第 86-113 行)、`→rejected` 驳回 teacher_application(第 116-127 行)。**通知插入应在所有联动逻辑之后、`return ok()` 之前**。
  - **后台审核页深链已核查**:`app/admin/circles/page.tsx` 是 server component,直接从 db 查询,**未消费 `searchParams`** → `/admin/circles?review=<circleId>` 深链**当前不生效**。故建圈通知 `linkUrl` 确定为 `/admin/circles`(审核列表页);本期不做深链定位。
- **前端 `frontend_uniapp`**:uni-app + wot-ui-v2 + pinia + `alova`/`http`(`src/http/http.ts`)。列表用 `z-paging`;页面路由在 `src/pages.json`(圈子详情页为 `pages/circle/circle`)。「我的」页 `src/pages/me/me.vue` 是设置入口列表(现有条目:我的兴趣/我的圈子/我关注的圈子/我发布的圈子/教师认证/隐私设置),适合在列表新增「消息通知」入口与未读角标。

## Design Decisions

1. **写入即扇出(fan-out on write)**:通知在创建时按接收者逐条落库(`recipientId` 必填),而非查询时按角色解析。理由:每条通知需独立的已读状态(`readAt`),且「关注」类通知的接收者是具体的 `creatorId`,天然是逐条。对「通知所有管理员」场景,在创建时查出全部 `ADMIN` 用户并逐条插入。
2. **`linkTarget` 区分端**:枚举 `'miniprogram' | 'admin'`。用户侧通知 `linkTarget='miniprogram'`、`linkUrl` 为小程序页面路径(如 `/pages/circle/circle?id=xxx`);管理员侧通知 `linkTarget='admin'`、`linkUrl` 为后台路由(如 `/admin/circles`,后台审核列表页,深链不支持已确认)。两端各自只渲染自己 `linkTarget` 的消息,打开时用各自导航方式。
3. **复用同一张表 + 同一套 API**:管理员与用户共用 `notifications` 表;后端按当前登录用户过滤。管理员后台 UI 仅为展示与跳转(轻量)。
4. **不做实时推送(WebSocket / 长连)**:本期采用「进入页面拉取未读数 + 列表分页」的轮询式,MVP 足够;实时推送列为非目标(见末尾)。
5. **与业务同一请求顺序执行(不引入消息队列)**:发通知直接在当前请求的 Drizzle `db` 连接上执行。三个触发路由**均不使用 `db.transaction()`**(已核查:follow/审核/建圈均为顺序 await)。通知写入置于业务写入之后、`return ok()` 之前,失败仅 `logger.error` 不影响响应(通知是旁路)。
6. **`linkTarget` 必须在 API 与列表层双向过滤**:`GET /api/notifications` 增加 `linkTarget` 过滤参数,**用户侧列表只返回 `linkTarget='miniprogram'`、后台只返回 `linkTarget='admin'`**。否则管理员在小程序端登录会拉到无法打开的 admin URL,反之亦然。这是硬约束(见 API Surface 与前端段)。
7. **`notifyAdmins` 支持排除本人**:新增可选 `excludeUserId`,避免未来 ADMIN 也能建圈时产生「自己审自己」的自通知。本期建圈场景因创建者为 TEACHER 不会触发,但服务需预留。
8. **拒/审原因带入文案**:`reviewNote`(驳回原因)若存在,须拼入 `circle_review_result` 拒绝通知的 `content`。
9. **关注重复不重复通知**:`circleFollows` 为幂等插入(`onConflictDoNothing`),**重复关注不会再次发通知**;取消关注(`DELETE`)**不撤回**已发通知(业务上合理)。
10. **幂等判断用 `returning()`,不先查后插**:follow 路由现有实现刻意避免「先查后插」的 TOCTOU 竞态(见注释)。判断「本次是否新关注」应改为在现有 `onConflictDoNothing()` 链上追加 `.returning({ id: circleFollows.id })`:**有返回行 = 首次关注 → 发通知;返回空 = 重复关注 → 不发**。不要用先 select 判断存在性的方式(会破坏现有防竞态设计)。
11. **审核结果通知仅限 `pending` 转出**:只有 `current.status === 'pending'` 且目标为 `active`/`rejected` 时才发 `circle_review_result`。后续管理员对 active 圈子的 `offline`/`violated` 等状态变更**不发通知**(状态变更通知留待后续扩展,避免通知噪音)。
12. **`actorId` 记录触发者**:每条通知记录「谁触发了它」(关注者 / 审核管理员 / 建圈者),可空(系统通知为 `null`)。用途:前端展示触发者(头像 / 跳转其主页),**本期 UI 不强制消费但数据层预留**。`onDelete: 'set null'`(触发者注销不级联删除通知)。
13. **昵称快照语义**:通知文案中的人名(关注者昵称等)与圈子名在**通知创建时快照**进 `title` / `content` 字符串;用户改名 / 圈子改名后,历史通知保持创建时原文不变。不额外存结构化人名引用(需要结构化引用时用 `actorId` / `entityId`)。
14. **`entityType` + `entityId` 关联业务对象**:每条通知可关联一个业务对象(本期为 `circle`),为未来「按对象聚合通知」「撤回 / 失效」(对象删除或下线时清理 / 禁用相关通知)预留结构。本期**仅写入不消费**;`entityType` 用 `text` 列 + TS 联合类型(与 `circles.status` 惯例一致),取值 `'circle'`,预留扩展。
15. **后台铃铛走独立 `requireAdmin` 接口,不复用用户侧 API**:用户侧 `/api/notifications/*` 走 `requireSession`,后台若复用需在同一路由里按角色切换 `linkTarget` 并承担跨端鉴权混乱风险(管理员同时是小程序用户)。故后台新增 `/api/admin/notifications/*` 一组接口,统一 `requireAdmin` + 内部 `linkTarget='admin'` 固定过滤,与用户侧接口物理隔离、互不串扰(Design Decision 6 的延伸)。

## Data Model

新增表 `notifications`(`admin/db/schema.ts`)。

> **风格注**:项目现有 `circles.status`/`users.role` 均为 `text` 列 + 应用层类型,并未使用 `pgEnum`。`notifications` 的 `type`/`linkTarget` 采用 `pgEnum` 更严谨,但为与既有代码风格一致,也可改为 `text` 列 + TS 联合类型(服务与 schema 引用同一 `NotificationType` 常量)。**实现步骤 1 时以当前 `AGENTS.md`/`db/schema.ts` 中既有惯例为准,两种皆可;一旦选定,测试断言随之对齐。** `entityType` 按项目惯例**直接使用 `text` 列 + TS 联合类型**(不引入 pgEnum)。

> **新字段语义(已确认)**:`actorId` 记录触发者(可空,`onDelete: 'set null'`,见 Design Decision 12);`entityType`/`entityId` 关联业务对象(本期 `'circle'`,仅写入不消费,见 Design Decision 14);`title`/`content` 中的人名与圈子名在**创建时快照**进字符串(见 Design Decision 13)。

```ts
export const notificationTypeEnum = pgEnum('notification_type', [
  'circle_review',        // 圈子待审核(→管理员)
  'circle_review_result', // 圈子审核结果(→创建者)
  'circle_followed',      // 有人关注圈子(→创建者)
  // 预留:teacher_application / teacher_application_result
])

export const notificationLinkTargetEnum = pgEnum('notification_link_target', [
  'miniprogram',
  'admin',
])

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    recipientId: uuid('recipient_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    // 触发者(可空):谁触发了这条通知(关注者 / 审核管理员 / 建圈者);系统通知为 null
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    // 关联业务对象(可空):本期仅 'circle';为聚合 / 撤回 / 失效预留
    entityType: text('entity_type'),
    entityId: uuid('entity_id'),
    type: notificationTypeEnum('type').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    linkUrl: text('link_url'),
    linkTarget: notificationLinkTargetEnum('link_target').notNull().default('miniprogram'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('notifications_recipient_read_idx').on(table.recipientId, table.readAt),
    index('notifications_recipient_created_idx').on(table.recipientId, table.createdAt),
    index('notifications_entity_idx').on(table.entityType, table.entityId), // 为按对象聚合 / 撤回预留
  ],
)
export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert
```

生成迁移:`pnpm db:generate`(产出 `drizzle/xxxx_notification_subsystem.sql`),并 `pnpm db:migrate`(本地)。

## Notification Service(`admin/lib/notifications.ts`)

> `NotificationDTO` 定义在 **`types/api.ts`**(与 `CircleDTO` 等一致,`createdAt`/`readAt` 序列化为 ISO 字符串);转换函数如 `toNotificationDTO(row: typeof notifications.$inferSelect): NotificationDTO` 放在本服务内(与各路由手写 `toCircleDTO` 的模式一致)。导出:

- 类型:`NotificationDTO`(含 `id`、`type`、`title`、`content`、`linkUrl`、`linkTarget`、`actorId: string | null`、`entityType: NotificationEntityType | null`、`entityId: string | null`、`readAt: string | null`、`createdAt: string`)。
- `notificationTypeEnum`/`notificationLinkTargetEnum` 的 TS 类型:`NotificationType`、`NotificationLinkTarget`。
- 服务函数(如下)。

- `notifyUser(db, { recipientId, actorId?, entityType?, entityId?, type, title, content, linkUrl?, linkTarget? })` — 单条。
- `notifyAdmins(db, { actorId?, entityType?, entityId?, type, title, content, linkUrl?, linkTarget?, excludeUserId? })` — 查 `users` 中 `role = 'ADMIN'`(且 `id != excludeUserId` 当传入时),逐条插入(用 `db.insert(notifications).values([...])` 批量)。
- `listNotifications(db, { recipientId, page, pageSize, unreadOnly?, linkTarget? })` — 返回 `Paginated<NotificationDTO>`,按 `createdAt` 倒序;与 `lib/api.ts` 的 `parsePagination` 约定一致;`linkTarget` 可选过滤(对应 Design Decision 6)。
- `getUnreadCount(db, recipientId, linkTarget?)` — 返回未读条数(`readAt IS NULL`);`linkTarget` 可选(后台角标仅统计 `admin`)。
- `markRead(db, id, recipientId)` — 仅当 `recipientId` 匹配时置 `readAt = now()`。
- `markAllRead(db, recipientId, linkTarget?)` — 批量置 `readAt`(可限定 `linkTarget`)。

所有写库操作包 `try/catch`,失败仅 `logger.error`(`LOG_PREFIX.NOTIFICATION`),**不影响主业务流程**(通知是旁路,不能因通知失败让建圈/审核失败)。

> **日志前缀**:`LOG_PREFIX`(`lib/logger.ts`)当前无 `NOTIFICATION`,须在 `admin/lib/logger.ts` 第 33 行处新增 `NOTIFICATION: "NOTIFICATION"`,方可使用 `LOG_PREFIX.NOTIFICATION`。

## Triggers(在现有路由中插入,均用 `notify*` 服务)

| 触发位置 | 条件 | 接收者 | `type` | `title` 示例 | `linkUrl` | `linkTarget` |
|---|---|---|---|---|---|---|
| `POST /api/circles` | 新建圈子 `status = 'pending'`(`creatorId` 为 TEACHER) | 所有 `ADMIN`(`excludeUserId` 可省略,因创建者非 ADMIN) | `circle_review` | 「新圈子待审核:<圈子名>」 | `/admin/circles`(已确认后台审核页不支持 `?review=` 深链,用列表页;深链列为 Non-goal) | `admin` |
| `POST /api/circles/[id]/follow` | 关注成功且 `followerId ≠ circle.creatorId`(自关注不通知) | `circle.creatorId` | `circle_followed` | 「<关注者昵称> 关注了你的圈子 <圈子名>」 | `/pages/circle/circle?id=<circleId>` | `miniprogram` |
| `PATCH /api/admin/circles/[id]` | 审核置 `active`/`rejected`(`current.status==='pending'` 时) | `circle.creatorId` | `circle_review_result` | 通过:「你的圈子 <名> 已通过审核」/ 拒绝:「你的圈子 <名> 未通过审核」(拒绝时 `content` 追加 `reviewNote` 原因) | `/pages/circle/circle?id=<circleId>` | `miniprogram` |

**触发点实现要点(基于真实路由)**:
- **统一字段映射**:三处触发均传 `actorId = 触发者`(建圈→创建者、关注→关注者、审核→操作管理员),`entityType = 'circle'`、`entityId = <circleId>`(见 Design Decision 12/14)。
- `POST /api/circles`:在 `circleRow` 插入成功后(第 168 行后)调用 `notifyAdmins({ actorId: <创建者 id>, entityType: 'circle', entityId: <circleId>, ... })`;`title` 直接用请求体 `title`,无需额外查询。
- `POST /api/circles/[id]/follow`:
  1. **现有 circle 校验 select 需扩展**:从 `select({ id, status })` 改为同时取 `creatorId`、`title`(若 circle 为 `active` 才继续)。这一变化会影响现有 mock 测试的 select 队列,需同步更新 `circles-follow.test.ts` 的用例。
  2. 补查 `users.name`(关注者昵称),仅当 `userId !== creatorId` 时发通知。
  3. **幂等判断**:在现有 `insert(...).values(...).onConflictDoNothing({ target })` 链上追加 `.returning({ id: circleFollows.id })`;`returning` 有行 → 首次关注,发通知(带 `actorId = 当前用户`、`entityType = 'circle'`、`entityId = <circleId>`);空数组 → 重复关注,不发(不引入先查后插,保持 TOCTOU 安全,见 Design Decision 10)。
- `PATCH /api/admin/circles/[id]`:复用已查出的 `current.creatorId`/`current.title` 与 `reviewNote`。**通知插入位置:所有联动逻辑之后(`→active` 升级 TEACHER、`→rejected` 驳回 teacher_application)、`return ok()` 之前(第 128-135 行之间)**。仅当 `current.status === 'pending'` 且目标为 `active`/`rejected` 时发;`offline`/`violated` 等变更不发(Design Decision 11)。拒绝时把 `reviewNote`(若有)拼入 `content`。`actorId` 用当前登录管理员 id,`entityType = 'circle'`、`entityId = <circleId>`。

## API Surface(用户侧,均 `requireSession`)

- `GET /api/notifications` — 查询参数 `page`、`pageSize`、`unreadOnly`(可选)。**实现偏差**:计划初稿支持可选 `linkTarget` 查询参数,实现为**服务端硬编码 `miniprogram` 且忽略查询参数**(后台走独立 `/api/admin/notifications/*`,见 Admin 段)——此偏差**更安全**(杜绝调用方误取 admin 端),已获确认并记录。返回 `Paginated<NotificationDTO>`,**始终按 `recipientId = 当前用户` 过滤**(实现 Design Decision 6)。
- `GET /api/notifications/unread-count` — 查询参数 `linkTarget`(可选,缺省统计全部);返回 `{ count: number }`,仅统计当前用户、指定 `linkTarget`、未读。
- `PATCH /api/notifications/[id]` — 标记单条已读(校验归属)。**实现偏差**:越权 / 不存在 / 已读统一返回 `ok({ marked: false })`(200)而非计划初稿的 404——这是幂等 UX 的刻意优化(避免客户端反复重试报红,且不泄露存在性),安全性未降低;`marked:false` 同时覆盖「非本人 / 不存在 / 已读」三态,前端应只依赖 `readAt` 变化而非 `marked` 布尔值。**此偏差已获实现确认,记录在此**。
- `POST /api/notifications/read-all` — 标记当前用户全部已读;body 可选 `{ linkTarget }`(仅清某端)。
- 后台管理侧复用同一组 API,仅 `linkTarget` 传 `admin`(管理员自身即接收者,`recipientId` 自然过滤)。**关键:两端都通过 `linkTarget` 过滤,互不可见对方端通知**(Design Decision 6)。
- 越权语义:访问/标记他人通知 → 用户侧返回 `ok({ marked: false })`(200,幂等);**后台侧同样返回 `ok({ marked: false })`**(见 `admin/app/api/admin/notifications/[id]/route.ts`)。跨端(如标记 `miniprogram` 通知)由 `markRead` 的 `recipientId` 隔离天然拦截,不泄露存在性。

## Frontend(小程序 `frontend_uniapp`)

1. **类型** `src/types/index.ts`:新增 `NotificationDTO`(含可空的 `actorId`/`entityType`/`entityId`)、`NotificationType`、`NotificationLinkTarget`、`NotificationEntityType`(`Paginated` 已存在)。
2. **API 客户端** `src/api/notifications.ts`:`getNotifications(params)`、`getUnreadCount()`、`markRead(id)`、`markAllRead()`。复用 `http` 封装。
3. **消息中心页** `src/pages/notifications/notifications.vue`(需在 `src/pages.json` 注册):
   - 用 `z-paging` 分页加载 `getNotifications`(固定 `linkTarget='miniprogram'`,只显示小程序端通知)。
   - 列表项:标题、正文、相对时间、未读圆点;点击 → 调 `markRead(id)`;若 `linkUrl` 非空则 `uni.navigateTo({ url: item.linkUrl })`,**`linkUrl` 为空时仅标记已读不跳转**(前端仅渲染 `miniprogram` 类型,`linkUrl` 必为小程序页面路径)。触发者头像本期不渲染(数据层已备 `actorId`,见 Design Decision 12)。
   - 顶部「全部已读」按钮 → `markAllRead()`。
   - **已读刷新**:点击 `markRead` 后本地将该项标记为已读(或返回 `onShow` 重新 `z-paging` reload),并同步调 `me.vue` 刷新未读角标,避免返回后角标不更新。
   - **相对时间**:基于 `createdAt` 计算(如「刚刚 / N 分钟前 / N 小时前 / 日期」),可用 `dayjs`(若项目已引入)或手写轻量格式化。
4. **「我的」页入口** `src/pages/me/me.vue`:
   - 在设置列表中新增「消息通知」条目,右侧显示未读角标(`getUnreadCount({ linkTarget: 'miniprogram' })`)。
   - `onShow` 时刷新未读数(用户资料刷新后一并拉取);`onShow` 重新进入消息中心页也需 reload 角标。

## Admin(轻量,可选但建议)

- **后台铃铛(已实现)**:在 `app/admin/layout.tsx` 右上角(email 左侧)挂 `NotificationBell` 客户端组件。
  - 组件:`admin/components/notification-bell.tsx`(client component)。挂载时拉一次未读数(`/api/admin/notifications/unread-count`),点击铃铛展开下拉(`/api/admin/notifications?pageSize=10`),点击单条乐观标记已读并 `router.push(linkUrl)` 跳转,下拉头「全部已读」调 `/api/admin/notifications/read-all`。未读 >0 时显示 `Badge` 角标(>99 显示 `99+`)。
  - 接口隔离(见 Design Decision 15):后台走独立 `requireAdmin` 鉴权的 `/api/admin/notifications/*`(列表 / unread-count / 单条已读 `[id]` / read-all),**不复用**用户侧 `/api/notifications`(走 `requireSession`),避免跨端鉴权混乱;所有接口内部 `linkTarget` 固定为 `admin`。
  - **单条已读端点**:`admin/app/api/admin/notifications/[id]/route.ts`(PATCH,`requireAdmin` + `markRead`,`recipientId` 隔离,幂等返回 `{ marked }`)。铃铛点击单条先乐观更新本地,再 `PATCH` 该端点持久化。
  - 类型标签映射(`TYPE_LABEL`)在组件内维护(`circle_review`→圈子待审核、`circle_review_result`→审核结果、`circle_followed`→圈子被关注)。

## Implementation Steps(每步测试驱动)

> 遵循 `AGENTS.md`:先写**失败测试**(red),再实现使其变绿(green),最后重构(refactor);每步结束跑对应 `pnpm test` / `pnpm test:run`。

1. **Schema + 迁移 + 单测**
   - `admin/db/schema.ts` 加 `notifications` 表与两个 enum;`admin/lib/logger.ts` 第 33 行 `LOG_PREFIX` 新增 `NOTIFICATION`。
   - `tests/unit/db/schema.test.ts` 增加断言(表存在、`type`/`linkTarget` 枚举取值、必填字段、`linkTarget` 默认 `miniprogram`、`actorId` 可空、`entityType`/`entityId` 存在、`entityType` 为 `text` 列)。
   - `pnpm db:generate` & `pnpm db:migrate`。
   - 验证:`pnpm test`(unit)通过。
2. **通知服务 + 单测**
   - 写 `admin/lib/notifications.ts` 及 `tests/unit/lib/notifications.test.ts`:覆盖 `notifyUser` / `notifyAdmins`(按 ADMIN 数量扇出,且 `excludeUserId` 生效)/ `listNotifications`(含 `linkTarget` 过滤)/ `getUnreadCount`(含 `linkTarget` 过滤)/ `markRead`(越权保护)/ `markAllRead`(含 `linkTarget` 限定)/ 旁路异常吞掉不抛出;并断言 `actorId`/`entityType`/`entityId` 原样透传到 insert values。
   - 验证:单测绿;为后续集成测试提供基础。
3. **三个触发点 + 集成测试(mock 约定)**
   - 在三个路由中调用对应 `notify*`(见 Triggers 段「触发点实现要点」)。写 `tests/integration/api/notifications-trigger.test.ts`(遵循 Context 段的 mock 模式):
     - 建圈(pending,TEACHER 创建):`setSelectResultsQueue` 返回 N 条 ADMIN 用户行 → 断言 `chainInsert.values` 收到长度为 N 的数组、每项 `type='circle_review'`、`linkTarget='admin'`、`actorId=<创建者 id>`、`entityType='circle'`、`entityId=<新 circleId>`,且 `recipientId` 均为 ADMIN;断言创建者本人**不**在接收者中。
     - 关注(非创建者):circle select 返回含 `creatorId`/`title` 的行 + users select 返回关注者昵称 → 断言 `chainInsert.values` 含 `circle_followed`、`recipientId=creatorId`、`actorId=<关注者 id>`、`entityType='circle'`、`entityId=<circleId>`、`linkTarget='miniprogram'`、文案含昵称与圈子名。**重复关注**:`onConflictDoNothing().returning()` mock 返回空数组 → 断言不发通知。自关注:`userId === creatorId` → 不发。
     - 管理员审核 approve/reject:断言 `circle_review_result` 生成;reject 时 `content` 含 `reviewNote`。`offline`/`violated` → 断言**不发**。
     - 跨端隔离:小程序用户调用 `GET /api/notifications?linkTarget=miniprogram` 返回的 list 中**不**含 `circle_review`(admin)。
   - 验证:`pnpm test`(integration)通过。
   - ⚠️ **存量测试受影响**:follow 路由 circle 校验 select 从 `{ id, status }` 扩展为含 `creatorId`/`title`,现有 `circles-follow.test.ts` 中 `setSelectResultsQueue` 的 circle 行需补充字段、且断言 select 次数的用例(如 `mockDb.select` 仅 1 次)可能变化——**步骤 3 需同步更新该文件**。
4. **用户侧通知 API + 集成测试**
   - 新增 `app/api/notifications/route.ts`(GET,支持 `linkTarget`/`unreadOnly` 过滤)、`app/api/notifications/unread-count/route.ts`(支持 `linkTarget`)、`app/api/notifications/[id]/route.ts`(PATCH)、`app/api/notifications/read-all/route.ts`(POST)。
   - 写 `tests/integration/api/notifications.test.ts`(mock 模式):列表分页 / `linkTarget` 过滤 / `unreadOnly` 过滤 / 单条已读 / 全部已读(`linkTarget` 限定)/ 越权(读/标记他人通知返回 404)。
   - 验证:集成测试通过。
5. **前端类型 + API 客户端 + 单测**
   - `src/types/index.ts`、`src/api/notifications.ts`;为客户端写轻量单测(可选,`pnpm test:run`)。
6. **前端消息中心页 + 「我的」入口**
   - 新建 `pages/notifications/notifications.vue` 并注册 `pages.json`;在 `me.vue` 加入口与未读角标;`onShow` 拉未读数。
   - 验证:`pnpm type-check` 与 `pnpm lint` 通过;手动在 H5 跑通列表/点击跳转/全部已读。
7. **(可选)后台铃铛 — 已实现**
   - 新建独立后台接口(走 `requireAdmin`):`app/api/admin/notifications/route.ts`(GET 列表,`linkTarget='admin'`)、`app/api/admin/notifications/unread-count/route.ts`、`app/api/admin/notifications/read-all/route.ts`(POST)。
   - 新建 `admin/components/notification-bell.tsx` 客户端组件,挂到 `app/admin/layout.tsx` 右上角(email 左侧)。
   - 测试:`tests/integration/api/admin-notifications.test.ts`(6 例:三个接口鉴权 401、列表 `linkTarget='admin'` 过滤、未读计数、全部已读 affected 行数)。
8. **收尾质量门**
   - `admin`:`pnpm lint` + `pnpm test` 全绿;类型检查用 `pnpm build`(Next build 含类型检查;**无 `typecheck` 脚本,不要臆造**)。
   - `frontend_uniapp`:`pnpm lint` + `pnpm type-check` + `pnpm test:run` 全绿。
   - 更新 `README.md`(若有通知相关说明)或本计划追加「完成记录」。

## Quality Gates(最终必须全绿)

- `admin`:`pnpm lint` ✅、`pnpm test` ✅(unit + integration)、`pnpm build`(含类型检查)✅。
- `frontend_uniapp`:`pnpm lint` ✅、`pnpm type-check` ✅、`pnpm test:run` ✅。

## Non-goals(本期不做)

- WebSocket / 长连接实时推送(后台铃铛仅挂载时拉一次,用户停留期间不主动刷新)、短信 / 邮件 / 微信订阅消息等站外渠道。
- 通知聚合、免打扰 / 偏好设置、**撤回 / 过期**(取消关注不撤回已发通知)、历史通知清理策略(数据无限增长,已建索引便于后续按时间清理)。
- 富媒体(图片 / 卡片)通知;本期仅文本 + 链接。
- 管理员后台完整通知管理页(仅铃铛下拉,列全量管理留待后续)。
- **后台审核深链定位**(`/admin/circles?review=<id>` 高亮/定位):后台审核页当前为 server component 未消费 searchParams,本期通知 linkUrl 一律指向 `/admin/circles`。
- **非 pending 状态变更通知**(如 active 圈子被下线/违规的通知):本期不发,待后续扩展。

## Open Questions(已核查,转为确认项)

- ✅ `POST /api/circles` 创建时 `status = 'pending'`(已确认第 163 行),且仅 `TEACHER` 可创建 → 建圈通知管理员场景成立且无自通知。
- ✅ 拒绝原因:`PATCH /api/admin/circles/[id]` 已有 `reviewNote`(可选,驳回原因)→ 拒绝通知 `content` 直接拼入 `reviewNote`。
- ✅ 后台审核页深链:`app/admin/circles/page.tsx` 为 server component、未消费 `searchParams` → 深链不支持,`linkUrl` 定为 `/admin/circles`(已消除待确认项)。
- ✅ 测试架构:`tests/integration/*` 为 **mock db 集成测试**(非真实数据库),通知测试遵循 `circles-follow.test.ts` 的 mock 约定。
- ✅ 幂等判断:采用 `onConflictDoNothing().returning()`(不先查后插,保持 TOCTOU 安全)。
- ✅ **分支**:已确认新建 `feat/notification-subsystem`(基于 `main`)。
