# 视频课程子系统(设计文档)

> 日期:2026-09-16 | 状态:待评审(rev.2)
> 目标:教师(TEACHER)/ 管理员(ADMIN)可在 Web 后台创建**视频课程**(课程 + 多课时),教师管理自己的课程,管理员审核 / 上下线。

## 1. 背景

`/teacher/` 教师后台已落地(见 `2026-09-15-teacher-console-design.md`),目前覆盖「我的圈子」「我的活动」两类资源,均为**单资源**模型(一张表 = 一条业务记录)。

本次新增第三类资源「视频课程」,与前两者的关键差异:

1. **一对多**:一个课程包含多个课时(lesson),每个课时一个视频 → 需要主从两张表;
2. **富媒体**:课程封面 + 课时视频都需要真实文件存储,且视频体积远超既有图片场景;
3. **审核流转**:课程是"上架前必须审核"的资源(与圈子同构),需要 `pending → active / rejected` 状态机。

### 非目标(明确不做)

- ❌ 小程序 / H5 端课程浏览、播放、报名页(本期只做两个后台页面);
- ❌ 课程付费 / 订单 / 学习进度;
- ❌ 审核结果站内通知(见 §3 决策 7);
- ❌ 改动任何既有 C 端接口行为。

## 2. 现状勘查(关键发现)

| 关注点 | 现状 |
|---|---|
| 后端 | Next.js 16 App Router + Auth.js v5 + Drizzle ORM(Postgres),`admin/` 独立子项目 |
| 教师后台守卫 | `proxy.ts` matcher + `auth.config.ts` `authorized` + `app/teacher/layout.tsx` + `requireTeacher()` 四重 |
| 教师后台范式 | SSR 直查库出列表 + client 组件 `fetch /api/teacher/*` 后 `router.refresh()`;数据范围默认 `creatorId = 自己`,ADMIN 可 `?scope=all` |
| 配套 lib | `lib/circles.ts` / `lib/activities.ts` 承载 schema + DTO + 落库,路由只做薄壳 |
| **COS 直传后端** | **已存在**:`GET /api/upload/cos-credentials`(`lib/cos/sts.ts` 签发 scoped STS,scope=`<prefix>/<userId>/*`,授予 PutObject/PostObject + 分片系列动作) |
| **COS 直传客户端** | **已存在但只在 `frontend_uniapp`**:`src/api/upload.ts` 的 `uploadFileToCos` + `src/utils/cos-client.ts` + `src/utils/cos-key.ts`;**`admin/` 侧完全没有直传实现** |
| 既有前台图片上传 | 小程序端**已全部走 COS 直传**,`uploadFile` 本地上传通道已删除 |
| 既有后台图片上传 | `components/cover-images-field.tsx` 走 `POST /api/upload`(本地磁盘,落 `public/uploads/`),**2 个调用点**:`circle-form-dialog.tsx`、`activity-form-dialog.tsx` |
| `POST /api/upload` 其他调用方 | 仅 `CoverImagesField`;另有既有集成测试 `tests/integration/api/upload.test.ts` 覆盖该路由 |
| 课程相关代码 | **全仓库零命中**:无表、无接口、无页面 |

**能力缺口**(本次要补的):
1. `courses` / `course_lessons` 两张表 + 迁移;
2. `lib/courses.ts`(schema / DTO / 事务化落库 / 状态机);
3. admin 侧 COS 直传客户端(image + video 共用一条链路);
4. `/api/teacher/courses` 三个端点 + `/api/admin/courses/[id]`;
5. `/teacher/courses` + `/admin/courses` 两个页面与侧边栏入口。

## 3. 关键决策

| # | 决策 | 理由 |
|---|---|---|
| 1 | 数据模型 = `courses` + `course_lessons` **两张表** | 用户明确选择;课时需要独立排序 / 独立更新 / 未来可扩展到"课时级进度" |
| 2 | 状态集 `pending / active / offline / rejected / deleted` | 与 `circles` 的审核语义同构,但**不含 `violated`** —— 对课程而言"管理员下线"与 `offline` 是同一个可观察状态,不引入语义重叠 |
| 3 | 教师只能 `active ↔ offline`;`DELETE` → `deleted` | 硬约束"教师不能自己把 pending 变 active"(防绕过审核),与 `PATCH /api/teacher/circles/[circleId]` 一致 |
| 4 | 课时**全量替换**语义 | 表单即真相:提交时以提交的 lessons 数组为准(事务内删旧插新),避免"局部 diff"带来的顺序 / 遗漏 bug |
| 5 | 上传**统一走 COS 直传**:视频 + 封面图都是 | 用户明确要求(两次强调);与小程序端同一存储桶、同一 key 规范,后台不再向本地磁盘写文件 |
| 6 | **不新增图片字段组件**,直接把 `CoverImagesField` 内部上传实现换成 COS 直传 | 它的 props / 交互 / 数量上限 / 错误提示全部保留,只替换"网络这一层" → 圈子和活动两个表单**零改动自动升级**,课程表单直接复用它,代码只维护一份 |
| 7 | **不发**审核结果通知 | `notifications` 的 admin 铃铛只服务 ADMIN(`/api/admin/notifications/*`),教师读不到;小程序端本期无课程页 → 通知无落地页。接入点为 `lib/notifications.ts` 的 `notifyUser`,后续补课程页时再加 |
| 8 | 列表 `lessonCount` **读时聚合**,不冗余存储 | 冗余计数需要双写一致性维护;`group by` count 成本可忽略,避免 `circles.memberCount` 那类漂移风险 |
| 9 | 不新增 C 端 `GET /api/courses` | 非目标;`lib/courses.ts` 的 DTO / 查询函数已就位,后续加路由即可 |
| 10 | `POST /api/upload` 路由**保留**,只是后台 UI 不再调用它 | 删除会连带删掉既有集成测试与其覆盖的本地驱动能力;保留成本为零,且为"未来非媒体小文件"留兜底 |

## 4. 数据模型

### 4.1 `courses`

| 列 | 类型 | 约束 / 说明 |
|---|---|---|
| `id` | uuid | PK,`defaultRandom()` |
| `creator_id` | uuid | FK → `users.id`,`cascade`;教师 / 管理员 |
| `title` | text | not null,2-100 字符 |
| `description` | text | not null,10-5000 字符;纯文本,落库前过危险片段守卫(与 `activities` 同款正则) |
| `cover_images` | text[] | not null,default `'{}'`;0-9 张 COS 公网 URL |
| `tags` | text[] | not null,default `'{}'`;0-5 个 `hobby_tags.name` 快照(与 circles / checkins 惯例一致,不设外键) |
| `status` | text | not null,default `'pending'`;`$type<CourseStatus>()` |
| `reviewer_id` | uuid | FK → `users.id`,`set null`;审核人 |
| `reviewed_at` | timestamptz | 可空;审核时间 |
| `review_note` | text | 可空;驳回原因 / 审核备注(≤500) |
| `created_at` / `updated_at` | timestamptz | not null,default now |

索引:
- `courses_creator_status_idx` on `(creator_id, status)` —— 教师后台列表主路径
- `courses_status_created_idx` on `(status, created_at)` —— 管理后台按状态筛选
- `courses_tags_gin_idx` GIN on `tags` —— 未来按标签匹配

### 4.2 `course_lessons`

| 列 | 类型 | 约束 / 说明 |
|---|---|---|
| `id` | uuid | PK |
| `course_id` | uuid | FK → `courses.id`,`cascade`(课程删除则课时删除) |
| `title` | text | not null,1-100 字符 |
| `description` | text | not null,default `''`;课时简介,**可选填**,≤ 500 字符 |
| `video_url` | text | not null;COS 公网 URL |
| `duration_seconds` | integer | 可空(浏览器可探测);CHECK `>= 0` |
| `sort_order` | integer | not null,default 0;CHECK `>= 0` |
| `created_at` / `updated_at` | timestamptz | not null |

索引:`course_lessons_course_sort_idx` on `(course_id, sort_order)`。

**业务约束(应用层,DB 不跨行)**:每课程 lessons 数量 `1 ≤ n ≤ 30`(`COURSE_LESSONS_MAX`)。

## 5. 状态机

```
                    ┌──────────────── 教师新建 ────────────────┐
                    ▼                                          │
              ┌──────────┐  管理员通过    ┌──────────┐          │
              │ pending  │ ─────────────▶ │  active  │ ◀──┐     │
              └──────────┘                └──────────┘    │     │
                    │                          │  ▲       │     │
        管理员驳回   │                 教师/管理员│  │教师/管理员│  │
                    ▼                      下线 │  │恢复上线 │  │
              ┌──────────┐                     ▼  │       │     │
              │ rejected │               ┌──────────┐      │     │
              └──────────┘               │ offline  │ ─────┘     │
                                         └──────────┘            │
                                               │ 教师软删除        │
                                               ▼                 │
                                         ┌──────────┐            │
                                         │ deleted  │ ◀──────────┘
                                         └──────────┘   (任意状态均可软删除,终态)
```

- **教师侧** `PATCH /api/teacher/courses/[courseId]`
  - 内容字段(title / description / coverImages / tags / lessons)在 `pending` / `active` / `offline` / `rejected` 下均可编辑,便于教师按驳回意见修改;
  - `status` 字段只接受 `"active" | "offline"`,且课程当前状态必须已是 `active` / `offline`,否则 403 —— 教师无法自行把 `pending` 变 `active`(绕过审核),也无法把 `rejected` 变 `active`(需管理员重新放行);
  - `DELETE /api/teacher/courses/[courseId]` → `deleted`(任意非 `deleted` 状态可执行,终态)。
- **管理员侧** `PATCH /api/admin/courses/[id]`
  - `status: "active" | "offline" | "rejected"` + 可选 `reviewNote`;
  - `pending → active`:写入 `reviewerId` / `reviewedAt`;
  - `→ rejected`:写入 `reviewerId` / `reviewedAt` / `reviewNote`;
  - `active ⇄ offline`:管理员下线即 `offline`(语义:课程不可见)。

## 6. 上传:统一 COS 直传

### 6.1 目标形态

后台**所有**文件(课程封面图、圈子封面图、活动封面图、课时视频)都走 COS 直传:

- 浏览器直接用 STS 临时凭证 `PUT` 到 COS,**字节不经过 Next.js 进程**;
- `POST /api/upload`(本地上传)保留为"非媒体小文件"的兜底通道,但后台 UI 已无调用方;
- 与小程序端共用同一 bucket / region / key 规范(`<keyPrefix>/<userId>/<yyyy>/<mm>/<uuid>.<ext>`),同一条 STS scope 校验。

### 6.2 新增文件(`admin/lib/cos/`,纯客户端)

| 文件 | 职责 |
|---|---|
| `credentials.ts` | `fetchCosCredentials()`:同源 `GET /api/upload/cos-credentials`(`getToken` 已支持 cookie session);内存缓存 + 到期前 5 分钟预刷新 + "后端返回的凭证本身已过期则重拉一次"防御(对齐小程序端 `getValidCreds`) |
| `cos-client.ts` | `getCosClient(creds)`:按 `secretId` 缓存 `cos-js-sdk-v5` 单例;把 SDK 回调式 API 包成 Promise 并归一错误信息(对齐小程序端 `callSdk`) |
| `object-key.ts` | 纯函数 `pickExt` / `buildCosObjectKey` / `buildCosPublicUrl`(与 `frontend_uniapp/src/utils/cos-key.ts` 同算法,脱离 SDK 可单测) |
| `upload.ts` | 门面 `uploadFileToCos({ file, onProgress })` → `{ url, key, size, mimeType, originalName }`;`ContentType` 取真实 MIME;`CacheControl: public, max-age=31536000, immutable`(与小程序端一致,key 含 uuid 故永不复用) |

### 6.3 改造文件

| 文件 | 变更 |
|---|---|
| `admin/components/cover-images-field.tsx` | 内部 `POST /api/upload` → `uploadFileToCos`。**对外 props / 交互 / 数量上限 / 错误文案全部不变**,故 2 个调用点零改动;注释里的"上传走 POST /api/upload"同步更新 |
| `admin/components/cos-video-field.tsx` | **新增**:视频上传字段。选择文件 → 直传(带百分比进度条 `Progress`)→ `<video controls>` 预览 → 替换 / 移除;`accept="video/*"`;`onLoadedMetadata` 探测 `durationSeconds` 回传父组件 |

### 6.4 依赖与 SSR 安全

新增 `cos-js-sdk-v5@^1.10.1`(与 `frontend_uniapp` 同版本,自带 `index.d.ts`)。已写入 `package.json` 与 `pnpm-lock.yaml`。

> **SSR 安全**:`CoverImagesField` / `CosVideoField` 都是 `"use client"`,但 client component 仍会在首次 HTML 渲染时**在 Node 侧执行模块顶层代码**,而 `cos-js-sdk-v5` 是浏览器 UMD 包。因此 `cos-client.ts` 内部用 **动态 `await import("cos-js-sdk-v5")`**,保证 SDK 只在"用户点上传"这一刻才在浏览器加载 —— 既避开 SSR,也让 SDK 不进首屏 bundle。

## 7. API 设计

全部走 `ok()` / `fail()` 信封;`/api/teacher/*` 用 `requireTeacher()`(TEACHER | ADMIN),`/api/admin/*` 用 `requireAdmin()`。

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| `POST` | `/api/teacher/courses` | 新建课程(`status=pending`)+ 课时,事务 | TEACHER / ADMIN |
| `PATCH` | `/api/teacher/courses/[courseId]` | 编辑字段(含 lessons 全量替换)+ `status: active \| offline` | 创建者 / ADMIN |
| `DELETE` | `/api/teacher/courses/[courseId]` | 软删除(`status=deleted`) | 创建者 / ADMIN |
| `PATCH` | `/api/admin/courses/[id]` | 审核 / 上下线:`active \| offline \| rejected` + `reviewNote` | ADMIN |

错误语义:`400` 校验失败;`401` 未登录;`403` 角色不符 / 非本人且非 ADMIN / 非法状态转换;`404` 课程不存在;`201` 新建成功。

**写入规则**(集中在 `lib/courses.ts`,路由只做薄壳):

- `createCourseSchema`:title / description / coverImages / tags / lessons(zod;lessons 1-30,每课时 `title` + 可选 `description`(≤500) + `videoUrl` + 可选 `durationSeconds`);
- `updateCourseSchema`:全部可选,`lessons` 若提供则**全量替换**;
- `buildCourseUpdatePatch` / `replaceCourseLessons`(事务)/ `softDeleteCourse`;
- `toCourseDTO(row, lessons)` / `toCourseLessonDTO(row)`;
- `assertTeacherStatusTransition(current, next)`:教师侧只放行 `active ↔ offline`。

## 8. 页面与组件

```
admin/lib/cos/{credentials,cos-client,object-key,upload}.ts   # 新增:统一直传链路

app/teacher/courses/
├── page.tsx                          # SSR:我的课程(默认 creatorId=自己;ADMIN 可 ?scope=all)
└── _components/
    ├── courses-table.tsx             # client:状态 Tab / 桌面表格 + 移动卡片 / 编辑 / 上线 / 下线 / 删除
    ├── course-form-dialog.tsx        # client:新建 & 编辑共用表单(封面用 CoverImagesField + 课时编辑器)
    └── lesson-editor.tsx             # client:课时的增 / 删 / 上移下移 + 标题 + 简介 + CosVideoField

app/admin/courses/
├── page.tsx                          # SSR:全部课程 + 创建者名 + 课时数
└── _components/
    ├── courses-table.tsx             # client:状态 Tab / 通过 / 驳回 / 下线 / 恢复
    └── course-detail-dialog.tsx      # client:审核前查看课程全部字段 + 课时视频(可播放)
```

侧边栏:`components/teacher-sidebar.tsx` 新增「我的课程」;`components/app-sidebar.tsx` 新增「课程管理」。

**列表页响应式(硬要求,沿用 `/teacher/*` 既有范式)**:桌面 `Table`(`hidden md:block`)+ 移动卡片(`md:hidden`)共享同一份筛选 / 弹窗状态;筛选 Tab 包 `-mx-4 overflow-x-auto px-4`;表单弹窗 `max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl`,字段栅格 `grid-cols-1 sm:grid-cols-2`。

**DTO**(新增到 `types/api.ts`):

```ts
type CourseStatus = "pending" | "active" | "offline" | "rejected" | "deleted"

type CourseLessonDTO = {
  id: string
  title: string
  description: string
  videoUrl: string
  durationSeconds: number | null
  sortOrder: number
}

type CourseDTO = {
  id: string
  creatorId: string
  title: string
  description: string
  coverImages: string[]
  tags: string[]
  status: CourseStatus
  lessons: CourseLessonDTO[]
  /** 课时数(列表场景由聚合查询填充,避免为计数额外取 lessons) */
  lessonCount: number
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}
```

## 9. 错误处理

- 所有路由先守卫后解析 body,失败一律 `fail(4xx, 中文文案)`,不泄露内部细节;
- 路径参数先过 `isUuid()`(否则 Postgres 抛 `22P02` → 500,既有 `loadManageableActivity` 同款防护);
- 事务失败(`db.transaction` 抛错)→ 统一 `fail(500, "保存失败")` + `logger.error`,不留半截数据;
- 客户端表单:提交前做本地校验,把后端英文 `Invalid request body` 转成中文可读提示(沿用 `CircleFormDialog` 的 `validate()` 模式);
- **上传失败**(凭证 401 / 无 COS 配置 / SDK 报错)→ 字段内联展示 `message`,不静默、不阻断其他字段编辑;
- 页面守卫:未登录 → `/login`,角色不符 → `/`。

## 10. 测试策略(TDD)

| 层级 | 文件 | 覆盖 |
|---|---|---|
| 单元 | `tests/unit/lib/courses.test.ts`(新) | `createCourseSchema` 边界(title 长度 / lessons 0 与 31 / videoUrl 非 URL / 课时 description 超 500)、`updateCourseSchema`、`buildCourseUpdatePatch`、`assertTeacherStatusTransition` 全状态矩阵、`toCourseDTO` 投影(时间 ISO 化 / `coverImages` 兜底空数组 / `lessonCount` 与 `lessons.length` 关系) |
| 单元 | `tests/unit/lib/cos/object-key.test.ts`(新) | `pickExt`(MIME 优先 / 后缀兜底 / `.bin` 兜底 / 视频 MIME)、`buildCosObjectKey`(段拼接 / 空 prefix / yyyy-mm 段)、`buildCosPublicUrl`(单斜杠) |
| 单元 | `tests/unit/lib/cos/upload.test.ts`(新) | 凭证缓存与提前刷新、key 前缀与 `userId` 一致、`onProgress` 透传、SDK 报错归一为可读 Error(注入 fake SDK 与 fake fetch) |
| 集成 | `tests/integration/api/teacher-courses.test.ts`(新) | 401 / 403(USER) / 400 / 201;PATCH 非本人 403、ADMIN 代管 200、`pending→active` 403、`active→offline` 200、lessons 全量替换;DELETE 软删 |
| 集成 | `tests/integration/api/admin-courses.test.ts`(新) | 401 / 403(非 ADMIN);`pending→active` 写 `reviewerId/reviewedAt`、`→rejected` 写 `reviewNote`、`active→offline` |
| 回归 | 既有全部测试 | 尤其 `tests/integration/api/upload.test.ts`(`POST /api/upload` 路由必须保持绿)+ 圈子 / 活动表单相关测试 |

集成测试沿用既有范式:`vi.hoisted` + `vi.mock("@/auth")` + 直接 import route handler 调用(非 HTTP)。测试先写、先红,再实现。

## 11. 影响面与风险

| 项 | 说明 | 对策 |
|---|---|---|
| 新增依赖 | `cos-js-sdk-v5@^1.10.1`(浏览器端) | 动态 import,不进首屏 bundle、不在 Node 侧执行 |
| 数据库 | 新增 2 表 + 3 索引 + 2 CHECK | `pnpm db:generate` + 人工审 SQL + `pnpm db:migrate` |
| **既有行为变更** | 圈子 / 活动表单的封面图从"本地上传"变为"COS 直传",产生的 URL 形态不同(`public/uploads/...` → `https://<cos>/...`) | 数据库里两者都是 `text[]` URL 字符串,**旧数据仍可正常显示**(`<img src>` 不关心来源);新数据统一 COS |
| `POST /api/upload` | 保留不删 | 既有集成测试继续守护;README 中"可换 OSS 驱动"的说明仍然成立 |
| 无 C 端影响 | 不改任何既有 C 端接口行为;小程序端零改动 | —— |
| 权限面 | 新增 `/api/admin/courses/[id]`(ADMIN)与 `/api/teacher/courses*`(TEACHER/ADMIN);`/admin/courses` 复用 `/admin/*` 既有守卫 | 无需改 `proxy.ts` / `auth.config.ts` |
| CSRF | 走 cookie session(`SameSite=Lax`),与既有后台接口同级 | 沿用现状 |
| 大文件 | COS 直传不经后端;需确认 `COURSE_VIDEO_MAX_MB`(建议 500)在客户端预校验 | 表单里先校验 `file.size`,超限直接提示不发请求 |
| 回滚 | 迁移可逆(纯新增表);前端回滚只需移除页面与侧边栏两项 | —— |

## 12. 验收标准

**功能**

- [ ] TEACHER 在 `/teacher/courses` 可新建课程(落 `pending`)、编辑(含课时增删改序 + 课时简介)、自主上下线、软删除;
- [ ] 教师看不到也改不了别人的课程;ADMIN 可 `?scope=all` 查看全部并代管;
- [ ] 教师无法把 `pending` 改成 `active`(403);
- [ ] ADMIN 在 `/admin/courses` 可通过 / 驳回(填原因)/ 下线 / 恢复上线,并能查看课时视频内容后再审核;
- [ ] 课程封面图、课时视频、以及**圈子 / 活动封面图**均直传 COS(浏览器 Network 中不再出现 `POST /api/upload` 的文件请求);
- [ ] 圈子 / 活动表单的既有交互与提示不变(出现回归即视为失败);
- [ ] `/admin/*`、`/teacher/*` 其余页面行为不变(既有测试全绿)。

**响应式(375 / 390 / 768 / 1440)**

- [ ] 两个课程页无横向滚动;`<768px` 显示卡片视图、`≥768px` 显示表格;
- [ ] 状态 Tab 窄屏可横滑;表单弹窗限高可滚动、底部按钮整行堆叠;
- [ ] 课时编辑器在窄屏单列排布,视频预览不溢出。

**质量门**

- [ ] `pnpm lint` / `pnpm test` / `tsc --noEmit` 全绿(`pnpm build` 若因离线拉取 Google Fonts 失败则按 `AGENTS.md` 豁免);
- [ ] 迁移 SQL 已人工 review 并成功 `db:migrate`。
