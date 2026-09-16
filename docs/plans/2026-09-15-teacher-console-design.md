# 老师后台子系统 `/teacher/`

> 日期:2026-09-15 | 状态:✅ 已实施(见 `2026-09-15-teacher-console.md`)
> 目标:为 TEACHER 角色提供与 `/admin/` 同构的独立后台入口,用于管理**自己创建的圈子与活动**。

## 1. 背景

当前只有 `/admin/` 一个后台子系统,守卫为 `role === "ADMIN"`。TEACHER 用户目前只能通过小程序发布圈子/活动,没有任何 Web 管理端:看不到 `pending` 状态的审核进度,也无法批量编辑或自主上下线。

本次新增 `/teacher/` 子系统,复用既有 `app/(auth)/login` 登录链路,按角色分流入口。

**非目标**:不新增数据库表与迁移;不改动小程序端接口契约;不做教师认证流程(已有 `/api/teacher-applications`)。

## 2. 现状勘查(关键发现)

项目是 **Next.js 16 App Router + Auth.js v5 + Drizzle ORM(Postgres)**,不是 NestJS。

| 关注点 | 现状 |
|---|---|
| 页面守卫 | `proxy.ts` matcher + `auth.config.ts` 的 `authorized` 回调 + `app/admin/layout.tsx`,三重 |
| 管理 API 守卫 | `requireAdmin()`(`lib/auth-utils.ts`)走 cookie session |
| 业务 API 守卫 | `requireSession(req)` 走 `readUserFromToken` |
| **关键发现** | `@auth/core` 的 `getToken` **先读 cookie 再读 Bearer**(`node_modules/@auth/core/jwt.js:90-96`),因此 `requireSession(req)` 对浏览器同源 cookie 请求同样有效,`/api/upload` 无需新增端点即可被老师后台复用 |
| 角色 | `USER` / `TEACHER` / `ADMIN`(`text` 列 + TS 字面量联合,无 pgEnum) |
| 已完成能力 | `POST /api/circles`(TEACHER)、`PUT /api/circles/[id]`(创建者)、`GET /api/circles/mine`、`POST /api/activities`(TEACHER/ADMIN)、`PATCH|DELETE /api/activities/[activityId]`(创建者) |

**能力缺口**(本次要补的):

1. 圈子**自主上下线**(active ↔ offline):现有 `PUT /api/circles/[id]` 不改 `status`;改 `status` 的接口只有 `PATCH /api/admin/circles/[id]`(管理员专属)。
2. 圈子**地址/经纬度**编辑:`PUT` 的 schema 不含 `address` / `latitude` / `longitude`。
3. **ADMIN 代管**:`POST /api/circles` 硬判 `role === "TEACHER"`,ADMIN 被 403;`PUT`/`PATCH` 硬判 `creatorId === userId`。
4. 圈子列表需要 `pending` / `offline` 等全部状态(现 `GET /api/circles/mine` 满足,但教师后台还有代管需求)。

## 3. 关键决策

1. **登录入口复用 `/login`**,登录成功后按角色分流:`ADMIN → /admin`,`TEACHER → /teacher`,`USER → 无权限页`。不新建 `/teacher/login`。
2. **角色门槛**:`/teacher/*` 允许 `TEACHER` 与 `ADMIN`(ADMIN 可代管)。`USER` 一律重定向到 `/`。
3. **数据范围**:默认只看自己创建的;ADMIN 额外可通过页面开关 `?scope=all` 查看全部(含「创建者」列)。
4. **写权限**:`creatorId === 当前用户` **或** `role === "ADMIN"`。
5. **状态机约束(防绕过审核)**:老师只能做 `active ↔ offline`;`pending` / `rejected` / `violated` / `deleted` 一律不可由老师改写 status(403)。`pending` 期间**允许**编辑其他字段。
6. **新增 `/api/teacher/*` 作为教师后台专用 API 层**(cookie session + `requireTeacher()`),与既有 `/api/admin/*` 范式对齐;业务规则通过抽取到 `lib/` 复用(C 端 `/api/*` 保持对外行为不变)。
7. **列表走 SSR 直查库**(与 `app/admin/*` 一致,上限 200 条),写操作由 client 组件 `fetch /api/teacher/*` 后 `router.refresh()`。
8. **图片上传复用既有 `POST /api/upload`**(cookie session 已被 `getToken` 支持),不新增上传端点。

## 4. 守卫层改动(4 处)

`lib/user-role.ts` 新增共享常量,避免散落魔法数组:

```ts
/** 可访问 /teacher/ 教师后台的角色 */
export const TEACHER_AREA_ROLES: UserRole[] = ["TEACHER", "ADMIN"]
```

| 文件 | 改动 |
|---|---|
| `proxy.ts` | `matcher: ["/admin/:path*", "/teacher/:path*"]` |
| `auth.config.ts` | `authorized` 新增 `isOnTeacher` 分支:未登录 → `false`(跳 `/login`);role ∉ `TEACHER_AREA_ROLES` → `redirect("/")`;否则 `true` |
| `app/teacher/layout.tsx`(新建) | `auth()` 取 session,未登录 `redirect("/login")`,role ∉ `TEACHER_AREA_ROLES` → `redirect("/")`;渲染 `TeacherSidebar` + header(与 `app/admin/layout.tsx` 同构,含登出) |

> **通知铃不在本期范围**:admin 的 `NotificationBell` 只调用 `/api/admin/notifications/*`(管理员专属),
> 老师打开会 403。要接入需先补一套老师侧的通知读取端点,属于独立需求,本设计明确不做
> (老师的审核结果通知仍通过小程序触达,`circle_review_result` 的 `linkTarget` 本就是 `miniprogram`)。
| `app/page.tsx` | `role === "TEACHER"` → `redirect("/teacher")`;其余非 ADMIN 保持「无访问权限」页 |

`lib/auth-utils.ts` 新增:

```ts
/** 教师后台守卫:走 NextAuth cookie session,role ∈ {TEACHER, ADMIN} */
export async function requireTeacher(): Promise<AuthGuardResult>
```

复用既有 `AuthGuardResult` 类型,与 `requireAdmin()` 同构(401 未登录 / 403 角色不符)。

## 5. API 设计 `/api/teacher/*`

全部经 `requireTeacher()`(cookie session,同源),响应统一 `ok()` / `fail()`。

| 方法 | 路径 | 说明 | 权限 |
|---|---|---|---|
| `POST` | `/api/teacher/circles` | 新建圈子(`status=pending`,等管理员审核) | TEACHER / ADMIN |
| `PATCH` | `/api/teacher/circles/[circleId]` | 编辑圈子字段 + `status: "active" \| "offline"` | 创建者 / ADMIN |
| `POST` | `/api/teacher/activities` | 发布活动 | TEACHER / ADMIN |
| `PATCH` | `/api/teacher/activities/[activityId]` | 编辑活动 | 创建者 / ADMIN |
| `DELETE` | `/api/teacher/activities/[activityId]` | 软取消(`status=cancelled`) | 创建者 / ADMIN |

错误语义:`401` 未登录;`403` 角色不符 / 非本人且非 ADMIN / 非法状态转换;`400` 校验失败(含「部分标签未通过审核」);`404` 资源不存在;`429` 24h 建圈配额超限;`201` 新建成功。

**边界规则**(与 C 端一致,防绕过):新建圈子沿用 24h ≤ 5 个配额、标签必须 `hobby_tags.status='approved'`、`status='pending'`、写入 `circle_members(role='creator')`、`notifyAdmins` 扇出、`recordInterestEvents` 旁路。

## 6. lib 层抽取(DRY)

现状:创建圈子逻辑(约 130 行)内联在 `app/api/circles/route.ts`;`toActivityDTO` 在 `app/api/activities/` 的两个文件里**重复了两份**;标签白名单校验在 create 与 update 两处重复。

| 文件 | 改动 |
|---|---|
| `lib/circles.ts` | 新增 `createCircleSchema` / `CreateCircleInput` / `DAILY_CREATE_LIMIT` / `findUnapprovedTags(names): Promise<string[]>` / `createCircle(params): Promise<CreateCircleOutcome>`(含配额、标签、插入、circle_members、notifyAdmins、interestEvents) |
| `lib/activities.ts` | 新增 `toActivityDTO(row)`(消除两处重复) |
| `app/api/circles/route.ts` | POST 改为薄壳:守卫 + 调 `createCircle`,外部行为不变 |
| `app/api/circles/[id]/route.ts` | 标签校验改用 `findUnapprovedTags`;`toCircleDTO` 本地副本改为 import `lib/circles` |
| `app/api/activities/*` | 两处 `toActivityDTO` 本地定义删除,改 import |

> 既有集成测试 `tests/integration/api/circles-crud.test.ts`、`activities.test.ts` 是这次重构的安全网,必须保持全绿。

## 7. 页面与组件

```
app/teacher/
├── layout.tsx                                  # 守卫 + TeacherSidebar + header
├── page.tsx                                    # 概览:我的圈子数 / 活动数 / 待审核数 / 已下线数
├── circles/
│   ├── page.tsx                                # SSR 查询(默认自己,ADMIN 可 ?scope=all)
│   └── _components/
│       ├── circles-table.tsx                   # client:状态筛选 Tab / 编辑 / 上线 / 下线
│       └── circle-form-dialog.tsx              # client:新建 & 编辑共用表单
└── activities/
    ├── page.tsx
    └── _components/
        ├── activities-table.tsx                # client:状态筛选 / 编辑 / 取消
        └── activity-form-dialog.tsx            # client:新建 & 编辑共用表单

components/teacher-sidebar.tsx                  # 概览 / 我的圈子 / 我的活动
components/location-picker.tsx                  # 高德地图 + POI 搜索(见下)
```

**表单字段**

- 圈子:`title` / `description` / `tags`(从 SSR 传入的已审核标签里多选 1-5) / `address` + 经纬度(地图选点) / `contactPhone` 或 `wechat`(至少一个) / `activityTime` / `maxMembers` / `coverImages`(调 `/api/upload` 上传,最多 9 张)。
- 活动:`title` / `description` / `startTime` / `registrationDeadline`(须早于开始时间) / `contactPhone` / `coverImages`。

**`components/location-picker.tsx`(抽取,DRY)**:现有 `app/admin/users/_components/edit-address-dialog.tsx` 内含约 150 行高德地图 + POI 搜索 + 中心图钉逻辑。把它抽成受控组件 `LocationPicker({ value: {latitude, longitude, address} | null, onChange })`,老师圈子表单直接复用,并让 `EditAddressDialog` 改为组合 `LocationPicker`(删除重复实现)。定位相关 UI/交互与既有实现保持一致。

**交互模式**:表格操作 → `fetch /api/teacher/*` → 成功后 `router.refresh()`(与 `app/admin/circles/_components/circles-table.tsx` 一致)。`_components` 均为 `"use client"`;页面为 Server Component。禁止 client 组件 import `db`。

两个列表页各自渲染**桌面表格 + 移动卡片**双视图(详见 §8.2)。

## 8. 响应式适配(移动端优先)

老师很可能直接用手机浏览器打开后台,因此 `/teacher/*` 全部页面必须自适应。断点沿用 Tailwind 默认值(`sm=640px` / `md=768px` / `lg=1024px`),与 `hooks/use-mobile.ts` 的 768px 判定保持一致。

### 8.1 现有组件已提供的能力(无需改动)

| 能力 | 来源 | 说明 |
|---|---|---|
| 侧边栏移动端抽屉 | `components/ui/sidebar.tsx` + `hooks/use-mobile.ts` | 小屏时 `Sidebar` 自动渲染为 `Sheet` 抽屉,由 `SidebarTrigger` 开合 |
| 弹窗宽度 | `components/ui/dialog.tsx` | `DialogContent` 默认 `w-full max-w-[calc(100%-2rem)]` |
| 弹窗按钮堆叠 | `DialogFooter` | 默认 `flex-col-reverse … sm:flex-row sm:justify-end`,小屏按钮整行堆叠 |
| 表格横向滚动 | `components/ui/table.tsx` | 外层自带 `overflow-x-auto` |
| viewport meta | Next.js 默认 | `app/layout.tsx` 未覆盖,`width=device-width` 生效 |

### 8.2 需要新增的响应式处理

1. **侧边栏与头部**:`app/teacher/layout.tsx` 照抄 `app/admin/layout.tsx` 结构(`SidebarProvider` + `SidebarTrigger` + header);header 右侧邮箱用 `hidden sm:block`,避免小屏挤压。
2. **列表:桌面表格 + 移动卡片(核心改动)**。两个列表页各渲染双视图、共享同一份状态:
   - `hidden md:block` → `Table` 形态(6 列)
   - `md:hidden` → 卡片列表:标题 + 状态 Badge 一行,次要信息(创建者 / 成员数 / 时间)折行小字,操作收进 `DropdownMenu`
   - 两份视图共用同一个 `filter` 与弹窗状态,不重复业务逻辑。
3. **状态筛选 Tab 横向滚动**:`TabsList` 为 `w-fit` 且触发器 `whitespace-nowrap`,7 个状态在小屏会被裁切。外层包 `<div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">` 并给 `TabsList` 加 `w-max`,实现可横滑。
4. **表单弹窗高度**:`DialogContent` 默认无 `max-height`,字段多时会超出视口。两个表单弹窗统一加 `className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl"`(用 `dvh` 兼容移动端地址栏收缩)。地图选点区域高度改为 `h-[240px] sm:h-[320px]`。
5. **表单栅格**:字段容器统一 `grid grid-cols-1 gap-4 sm:grid-cols-2`;`description` 等长字段用 `sm:col-span-2` 通栏。
6. **概览统计卡片**:`grid grid-cols-2 gap-3 lg:grid-cols-4`(手机上两列,避免单列过长滚动)。
7. **标题区 + ADMIN scope 开关**:用 `flex flex-wrap items-center justify-between gap-2`,小屏自动换行,不产生横向溢出。
8. **触控目标**:行内操作按钮不小于 `size="sm"`;操作入口统一收进 `DropdownMenu`,避免窄屏误触。
9. **长文本防溢出**:标题 / 地址用 `truncate` + `title`,或多行 `break-words`,避免撑破卡片布局。
10. **上传图片预览**:`coverImages` 缩略图用 `grid grid-cols-3 gap-2 sm:grid-cols-4`,小屏不溢出。

### 8.3 验证方式

- **手动(必做)**:Chrome DevTools 依次切 `375×667`(iPhone SE) / `390×844`(iPhone 14) / `768×1024`(iPad) / `1440`(桌面),逐项核对 §11 的响应式验收项。
- **自动化(可选)**:`tests/e2e/teacher-responsive.spec.ts` 在 `viewport: { width: 390, height: 844 }` 下打开 `/teacher/circles`,断言移动卡片视图可见、桌面表格不可见、无横向滚动。因需要完整登录态与数据库,若环境不具备可跳过,不阻塞交付。

## 9. 测试策略(TDD)

| 层级 | 文件 | 覆盖 |
|---|---|---|
| 单元 | `tests/unit/lib/circles.test.ts`(新) | `createCircleSchema` 边界、`findUnapprovedTags` 返回值 |
| 单元 | `tests/unit/lib/activities.test.ts`(新) | `toActivityDTO` 投影(含 `coverImages` 兜底空数组、时间 ISO 化) |
| 单元 | `tests/unit/auth-config.test.ts`(扩展) | `authorized` 回调:`/teacher` 未登录 / USER / TEACHER / ADMIN 四态 |
| 集成 | `tests/integration/api/teacher-circles.test.ts`(新) | 401 / 403(USER) / 400(标签非法) / 429(配额) / 201 新建;PATCH 非本人 403、ADMIN 代管 200、`pending→active` 403、`active→offline` 200 |
| 集成 | `tests/integration/api/teacher-activities.test.ts`(新) | 401 / 403 / 201;PATCH 非本人 403、ADMIN 200;DELETE 软取消 |
| 回归 | 既有 `circles-crud.test.ts` / `activities.test.ts` | 抽取重构后必须全绿 |

集成测试沿用既有范式:`vi.hoisted` + `vi.mock("@/auth")` + 直接 import route handler 调用;fetch URL 用相对路径。

**质量门**:`pnpm lint` + `pnpm test`(`pnpm build` 可能因离线拉取 Google Fonts 失败,按 `AGENTS.md` 说明豁免,另加 `tsc --noEmit`)。

## 10. 影响面与风险

- **`app/page.tsx` 行为变更**:TEACHER 不再看到「无访问权限」而是跳 `/teacher`。这是本次的目的,但需同步更新 `tests/unit/app/page.test.tsx`(若断言覆盖该分支)。
- **`auth.config.ts` 回调变更**:新增 `/teacher` 分支。既有 admin 分支逻辑不动,`tests/unit/auth-config.test.ts` 守护。
- **DRY 抽取触碰既有路由**:`POST /api/circles`、`PUT /api/circles/[id]`、`/api/activities/*` 被改为薄壳。外部契约零变更,由既有集成测试兜底。
- **ADMIN 代管引入越权面**:写权限放宽到 `role === "ADMIN"`。ADMIN 本就可通过 `/api/admin/circles/[id]` 改任意圈子,不新增实际权限等级。
- **无数据库变更**:不新增表/列,无需迁移与回滚方案。
- **CSRF**:`/api/teacher/*` 走 cookie session。Auth.js 的 session cookie 为 `SameSite=Lax`,跨站 POST 不带 cookie,风险与既有 `/api/admin/*` 同级。

## 11. 验收标准

**功能**

- [x] TEACHER 登录后从 `/` 自动进入 `/teacher`,`/teacher/*` 三页(概览 / 我的圈子 / 我的活动)可访问。
- [x] USER 访问 `/teacher/*` 被重定向到 `/`;未登录访问跳 `/login`(由 `tests/unit/auth-config.test.ts` 的四态断言覆盖)。
- [x] 老师在后台可新建圈子(落 `pending`)、编辑圈子、自主上下线;可发布活动、编辑活动、软取消活动(`tests/integration/api/teacher-*.test.ts`)。
- [x] 老师看不到、也改不了别人的数据;ADMIN 可通过 `?scope=all` 查看全部并代管(权限断言已覆盖,SSR 再次校验 `role === "ADMIN"`)。
- [x] 老师无法把 `pending` 圈子直接改成 `active`(防绕过审核,403)。
- [x] `/admin/*` 行为完全不变(既有 `circles-crud` / `activities` 集成测试与 `auth-config` 回归断言全绿;`lib/circle-status.ts` 抽取仅为消重复)。

**响应式(375 / 390 / 768 / 1440 四个宽度)** —— 待人工在浏览器核对

- [ ] 页面无横向滚动条(`document.documentElement.scrollWidth <= clientWidth`)。
- [ ] `<768px` 时侧边栏以抽屉形式打开,`SidebarTrigger` 可正常开合。
- [ ] `<768px` 时两个列表页显示卡片视图、隐藏表格;`≥768px` 反之,两者可操作项一致。
- [ ] 状态筛选 Tab 在窄屏可横向滑动,不裁切、不换行错位。
- [ ] 两个表单弹窗在 390×844 下不超出视口,内容可滚动,底部按钮整行堆叠且可点击。
- [ ] 概览统计卡片在窄屏两列排列;标题区与 ADMIN scope 开关自动换行不溢出。
- [ ] 表单在窄屏单列、`≥640px` 双列;地图选点区域在窄屏可正常拖动与搜索。

> 说明:上述响应式实现已按 §8.2 全部落地(双视图、Tab 横滑、弹窗限高、栅格、触控目标、长文本截断等),
> 但布局类断言无法由 vitest 覆盖,需人工按 §8.3 的方法在 DevTools 中切换四档宽度核对。
> 本地无 `.env` 与 Postgres,故未执行运行时冒烟。

**质量门**

- [x] `pnpm lint`(新增/修改文件零告警;仓库既有 `lib/amap.ts`、mbti managers 等报错与本次无关)、`pnpm test`(59 文件 698 测试全绿)、`tsc --noEmit`(仅既有 notification 测试报错)、`next build` 成功。
