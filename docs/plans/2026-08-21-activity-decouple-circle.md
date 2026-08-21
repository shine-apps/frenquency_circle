# 活动(activities)模块与圈子(circle)解耦

> 日期:2026-08-21 | 状态:计划待评审
> 目标:使活动创建不再依赖圈子归属,任何 TEACHER / ADMIN 用户可直接创建活动。

## 背景与范围

当前活动模块挂在圈子下:`activities` 表有 `circle_id` 外键;创建/查询接口都要求
`circleId` 路径参数并校验"当前用户是圈子创建者"。本次将其改为**顶层独立资源**:

- 移除 `circle_id` 字段与所有 circle 关联逻辑。
- 权限判定改为角色(teacher/admin),不依赖圈子归属。
- 前端表单 / 列表 / 详情去掉 circle 关联展示与校验,并在相关页面补充活动入口。

活动专属属性(标题、富文本介绍、起始时间、报名截止、联系人电话、状态)保持不变。

## 关键决策

1. **路由重定位**(推荐,语义最清晰):`/api/circles/[id]/activities/*`
   → `/api/activities/*`。与圈子平级成为顶层资源。前端同步调整 URL。
   (替代方案:保留路径但忽略 circleId —— 不推荐,会留下死字段与误导语义。)
2. **权限**:复用现有 `requireRole(['TEACHER', 'ADMIN'])`,移除 `requireRole('creator')`
   与 `getCircle` 调用。创建/编辑/取消均要求 teacher/admin。
3. **数据库**:`activities` 表 `DROP COLUMN circle_id`;保留 `creator_id`(活动归属创建者,
   用于"我的活动"与可见性控制)、`status` 软取消。
4. **可见性**:列表仍按 `status='active'` 对外(非创建者不可见 cancelled),但过滤维度
   从"圈子"变为"全局"——即返回全部 active 活动(不再按 circle 过滤)。
5. **联系人电话**:保留 `contactPhone` 字段(用户填写或留空)。
6. **迁移**:手写 SQL `ALTER TABLE activities DROP COLUMN circle_id;` + 删相关索引,
   并登记到 drizzle journal(沿用 `0000` 之后的新序号)。**需在具备 DATABASE_URL 环境执行。**

## 任务清单

### 后端
- [ ] **T1 数据库 schema**:`admin/db/schema.ts` 删除 `activities.circleId` 列定义
      (含 `activitiesCircleFk` 外键、`circleId` 索引)。
- [ ] **T2 迁移文件**:新增 `admin/drizzle/0001_drop_activity_circle_id.sql`
      (`ALTER TABLE ... DROP COLUMN circle_id;` + `DROP INDEX activities_circle_idx;`),
      并在 `admin/drizzle/meta/_journal.json` 追加 entry(新 idx/checksum)。
- [ ] **T3 校验层**:`admin/lib/activities.ts` 的 `createActivitySchema`/
      `updateActivitySchema` 移除任何 circle 相关字段(当前已无,确认即可);
      新增 `requireRole(['TEACHER','ADMIN'])` 辅助或确认 `requireSession` 用法。
- [ ] **T4 类型**:`admin/types/api.ts` 的 `ActivityDTO` 移除 `circleId`。
- [ ] **T5 创建/列表路由**:新建 `admin/app/api/activities/route.ts`
      (原 `circles/[id]/activities/route.ts` 内容迁移):
      - POST:校验 teacher/admin → 用 `session.user.id` 作 `creatorId` → 不再查 circle。
      - GET:分页返回全部 active(非创建者仅 active;创建者可加 `?mine=1` 看自己的含 cancelled)。
      删除旧文件 `circles/[id]/activities/route.ts`。
- [ ] **T6 详情/更新/取消路由**:新建 `admin/app/api/activities/[activityId]/route.ts`
      (迁移自 `circles/[id]/activities/[activityId]/route.ts`):GET/PATCH/DELETE
      去掉 circleId 路径参数与 circle 校验,仅按 `activityId` + `creatorId` 鉴权。
      删除旧文件。
- [ ] **T7 测试**:重写 `admin/tests/integration/api/activities.test.ts`
      - 路径改为 `/api/activities` 与 `/api/activities/:id`。
      - 移除所有 circle mock 与 "circle creator" 上下文;改为 teacher/admin 角色校验。
      - 覆盖:401 未登录 / 403 非 teacher-admin / 404 不存在 / 201 创建 / 400 校验失败 /
        PATCH 仅自己可改 / DELETE 软取消。
      - 保留既有 mock 模式(select/insert/update chain),仅去掉 circle 行。

### 前端
- [ ] **T8 类型**:`frontend_uniapp/src/types/index.ts`
      `ActivityDTO` 移除 `circleId`;`CreateActivityInput`/`UpdateActivityInput` 不变。
- [ ] **T9 API 客户端**:`frontend_uniapp/src/api/activities.ts`
      - `createActivity(input)` 去掉 `circleId` 参数。
      - `getActivities(params)` 改为顶层列表 `/api/activities`。
      - `getActivity(activityId)` / `updateActivity(activityId, patch)` /
        `cancelActivity(activityId)` 去掉 `circleId`。
- [ ] **T10 发布表单**:`frontend_uniapp/src/pages/create-activity/create-activity.vue`
      - `onLoad` 不再读取 `circleId`(仅 `activityId` 编辑态)。
      - 移除 `isCreator`/circle 校验;提交走新 `createActivity(input)`。
      - 跳转详情改为 `/pages/activity/activity?activityId=<id>`。
- [ ] **T11 活动详情**:`frontend_uniapp/src/pages/activity/activity.vue`
      - `onLoad` 仅取 `activityId`;调用 `getActivity(activityId)`。
      - 去掉 circleId 相关展示。
- [ ] **T12 圈子详情移除活动区块**:`frontend_uniapp/src/pages/circle/circle.vue`
      - 删除"圈子活动"区块(section 5.5)、`getCircleActivities` 导入与 `loadActivities`、
        `goActivity`/`goCreateActivity` 函数;`isCreator` 仍用于圈子自身逻辑保留。
- [ ] **T13 活动入口补充**(方案 A:新建两页):
      - **新建** `frontend_uniapp/src/pages/activity-list/activity-list.vue`:
        全局活动列表页。调 `getActivities({ page, pageSize })` 渲染所有 active 活动卡片
        (标题 / 起始时间 / 报名截止 / 联系人),点击跳 `/pages/activity/activity?activityId=<id>`。
        所有登录用户可访问;`onShow` 拉取 + 下拉刷新。
      - **新建** `frontend_uniapp/src/pages/my-activities/my-activities.vue`:
        我的活动管理页。复用 `my-published.vue` 模式:`onShow` 先 `canCreateCircle(role)` 校验
        (非 teacher/admin toast + navigateBack),调 `getActivities({ mine: 1, page, pageSize })`
        只展示自己发布的(含 cancelled),卡片含 状态chip / 编辑(跳 create-activity?activityId) /
        取消(cancelActivity 确认弹窗)。
      - `frontend_uniapp/src/pages/index/index.vue`:顶部品牌区新增"活动"按钮
        (`canCreateCircle` 用户旁边,或所有人可进)→ `/pages/activity-list/activity-list`。
      - `frontend_uniapp/src/pages/me/me.vue`:对 `canCreateCircle(role)` 用户新增
        "活动管理"入口(样式同"我发布的圈子")→ `/pages/my-activities/my-activities`。

### 质量门
- [ ] **T14 后端**:`node ./node_modules/typescript/bin/tsc --noEmit`(我的文件干净)、
      `eslint` 干净、`vitest run activities.test.ts` 全过。
- [ ] **T15 前端**:`eslint` 干净;`vue-tsc --noEmit` 我引入的文件无新增错误
      (既有 `MapView.vue`/`<input v-model>` 多端类型告警不计入)。
- [ ] **T16 手动验证清单**:
      1. 具备 DATABASE_URL 环境执行迁移 `node db/migrate.mjs`。
      2. teacher 账号:首页/我的 → 进入活动 → 发布活动(无 circle 选择)→ 富文本 + 时间 → 提交 → 跳详情。
      3. 普通 USER 账号:无法发布(入口不可见 / 接口 403)。
      4. 活动列表展示、详情富文本渲染正常。

## 影响面 / 风险

- **破坏性接口变更**:`/api/circles/:id/activities` 旧路径将被删除,前端若有其他调用需同步。
  当前前端仅 `circle.vue` 与 `create-activity`/`activity` 使用,均已纳入本计划改造。
- **数据库迁移不可逆**:`DROP COLUMN circle_id` 为破坏性 DDL,生产需备份后执行。
- **测试改动较大**:activities 集成测试整体重写路径与权限上下文,属预期内。
- **既有 notification-* 测试错误**与本次无关,不处理。

## 验收标准

- [ ] `activities` 表无 `circle_id`;活动接口不接收/返回 circleId。
- [ ] teacher/admin 可直接创建活动,无需圈子。
- [ ] 前端无 circle 关联的表单/列表/详情展示与校验。
- [ ] 首页与"我的"页均有活动入口,可访问发布与列表。
- [ ] 后端测试全过,前后端 lint/tsc 通过(既有告警除外)。
