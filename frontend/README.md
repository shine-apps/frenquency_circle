# 项目名 (Taro 小程序 / H5 / 抖音)

基于 **Taro 4.x + React 18 + TypeScript** 构建的跨端客户端,使用 **NutUI React Taro** 作为跨端 UI 组件库,目标平台为微信小程序(主)、H5、抖音小程序(可扩展支付宝/QQ/京东/百度/快应用等)。

它配合同仓库 `admin/` Next.js 后端(提供 `IResponse<T>` 信封的 REST API、JWT 鉴权与 SMS 登录),共同构成完整的多端登录与用户中心示例。

> 本子项目是**独立项目**,依赖与 `admin/` 不共享,`pnpm install` 仅作用于 `frontend/` 目录。

***

## 一、项目概述

| 维度   | 内容                                                          |
| ---- | ----------------------------------------------------------- |
| 项目名  | `taro_template` (替换为实际业务名)                   |
| 框架   | Taro 4.1.9 + React 18 + TypeScript 5                        |
| UI 库 | `@nutui/nutui-react-taro` 3.x(自动按需引入)                       |
| 状态管理 | Zustand 4.x(仅 `user` 域)                                     |
| 样式   | SCSS Modules + 全局 SCSS 变量(`@use '@/styles/variables.scss'`) |
| 端    | 微信小程序 / H5 / 抖音小程序(`weapp`/`h5`/`tt` 为当前目标)                 |
| 后端   | 同仓库 `admin/`(Next.js 16),通过 `API_BASE_URL` 常量注入运行时          |
| 鉴权   | 邮箱+密码 / 手机号+短信验证码 / 微信一键登录                                  |

设计稿基准 **750rpx**,页面内 `rpx` 经 Taro `pxtransform` 转换,H5 端基于 `37.5px` 基准 rem 适配。

***

## 二、安装指南

### 环境要求

- **Node.js** ≥ 18(推荐 LTS 20.x)
- **pnpm** ≥ 8
- 微信开发者工具(用于 `weapp` 端调试)
- H5 端可选任意现代浏览器

### 安装步骤

在 `frontend/` 目录内执行(整个子项目独立安装):

```bash
# 1. 安装 frontend 依赖(不需要先在仓库根执行 pnpm install)
cd frontend
pnpm install

# 2. 如首次使用 Taro CLI(可选,dev/build 脚本会自动调用 npx taro)
pnpm add -g @tarojs/cli
```

> **pnpm 10+ 提示:** 首次安装若出现 `[ERR_PNPM_IGNORED_BUILDS]`,可运行 `pnpm approve-builds` 交互式放行 `@nutui/nutui-react-taro`、`@tarojs/cli`、`esbuild` 等构建依赖。

### 验证安装

```bash
cd frontend
pnpm exec taro --version
# 期望输出: Taro 版本为 4.1.9
```

***

## 三、启动说明

所有命令均在 **`frontend/`** **目录** 下执行。脚本对应关系见 `package.json`(`scripts.build:<plat>` / `scripts.dev:<plat>`)。

### 微信小程序(主目标)

```bash
# 开发模式:监听文件变化,产物输出到 dist/
pnpm dev:weapp
# 等价于:npm run build:weapp -- --watch

# 生产构建:压缩混淆
pnpm build:weapp
```

构建完成后:

1. 打开**微信开发者工具**
2. 选择"导入项目",目录指向 `frontend/`
3. AppID 选择测试号或自有 AppID(`project.config.json` 当前为 `touristappid`)
4. 项目根自动识别 `dist/`(`miniprogramRoot`)

### H5

```bash
pnpm dev:h5       # 开发服务器,默认不自动打开浏览器
pnpm build:h5     # 生产构建
```

### 抖音小程序

```bash
pnpm dev:tt
pnpm build:tt
```

### 其它端

`package.json` 同时提供 `alipay / swan / rn / qq / jd / quickapp` 的 `dev:*/build:*` 脚本,但当前未在 CI 中验证,按需启用。

### 后端联调

`config/dev.ts` 中默认 `API_BASE_URL = http://localhost:3000`。本地需先启动 `admin/` 子项目:

```bash
cd ../admin
pnpm dev
```

若需在真机/局域网调试 H5,把 `config/dev.ts` 中的 `API_BASE_URL` 改为你后端机器的局域网 IP(如 `http://192.168.x.x:3000`)。

***

## 四、目录结构

```
frontend/
├── config/                            # Taro 构建配置
│   ├── index.ts                       # 入口(defineConfig,merge dev/prod)
│   ├── dev.ts                         # 开发配置(API_BASE_URL=http://localhost:3000)
│   └── prod.ts                        # 生产配置(API_BASE_URL 占位域名)
├── src/
│   ├── app.tsx                        # 应用入口(用户态 hydrate + fetchCurrentUser)
│   ├── app.config.ts                  # 全局 app.json(页面列表/窗口样式/permission.scope.userLocation)
│   ├── app.scss                       # 全局样式入口
│   ├── index.html                     # H5 入口模板(锁定 html fontSize=18px)
│   ├── components/
│   │   ├── CustomTabBar/             # 自定义底部 TabBar(3 项:首页 / 发布[凸起] / 我的)
│   │   │   ├── index.tsx
│   │   │   └── index.module.scss
│   │   ├── Icons/                     # 内联 SVG 图标
│   │   │   ├── HomeIcon.tsx
│   │   │   ├── ProfileIcon.tsx
│   │   │   ├── PublishIcon.tsx        # 发布按钮凸起圆形渐变图标
│   │   │   └── index.ts
│   │   └── TagSelector/              # 通用兴趣标签选择器(搜索 + 联想 + 已选 + 六大类 + 自定义添加)
│   │       ├── index.tsx
│   │       └── index.module.scss
│   ├── pages/
│   │   ├── index/                     # 首页(搜索栏 + 定位卡片 + 范围 Tab + 推荐列表 + 发布按钮)
│   │   ├── login/                     # 登录页(Tabs: 手机验证码 / 账号密码 + 微信一键)
│   │   ├── mine/                      # 我的页(用户卡片 + 兴趣 + 圈子 + 隐私 + 退出)
│   │   ├── profile/                   # 个人资料页(昵称 / 邮箱 / 头像 URL 编辑)
│   │   ├── search/                    # 兴趣选择页(复用 TagSelector,完成按钮持久化)
│   │   ├── publish/                   # 发布定位页(地图选点 + 兴趣卡片 + 范围 Tab)
│   │   ├── match/                     # 匹配结果页(双 Tab:同频的人 / 圈子 + 范围筛选)
│   │   ├── circle/                    # 圈子详情页(标题 + 创建者 + 联系老师 Popup)
│   │   ├── create-circle/            # 创建/编辑圈子页(表单 + 标签 + 选点 + 实时校验)
│   │   ├── my-circles/               # 我的圈子(展示 matchStore.circles 缓存)
│   │   ├── my-published/             # 我发布的圈子(TEACHER 专属,编辑/下线)
│   │   └── privacy/                  # 隐私设置(公开联系方式 / 允许被匹配 / 位置精度)
│   ├── services/
│   │   ├── request.ts                 # 统一请求封装(IResponse 解析/401 处理)
│   │   ├── auth.ts                    # 鉴权 + 用户扩展 API(login/sendSmsCode/updateMyTags/updatePrivacy/updateProfile/getMyProfile)
│   │   ├── tags.ts                    # 标签 API(searchTags/getCategories/createCustomTag)
│   │   ├── locations.ts              # 定位 API(publishLocation/matchPeople/matchCircles)
│   │   ├── circles.ts                # 圈子 API(createCircle/getCircle/updateCircle/deleteCircle/getMyCircles/contactCircle)
│   │   ├── upload.ts                  # 文件上传(weapp/tt 走 Taro.uploadFile,H5 走 fetch + FormData)
│   │   └── cloud.ts                   # 微信云开发(预留,当前未被引用)
│   ├── store/
│   │   ├── user.ts                    # Zustand 用户态(token + userInfo + tags/privacySettings/role)
│   │   ├── match.ts                  # 匹配结果缓存(people / circles / rangeKm / location)
│   │   └── location.ts              # 当前发布位置缓存(latitude / longitude / address)
│   └── styles/
│       ├── theme.scss                 # 品牌色/功能色/背景/文本/边框色变量
│       ├── variables.scss             # 间距/圆角/字号/行高/字重/阴影/mixin
│       └── compat.scss                # 多端兼容(盒模型/H5 TabBar 修复)
├── types/
│   └── global.d.ts                    # 全局类型(模块声明 + API_BASE_URL + ProcessEnv)
├── babel.config.js                    # babel-preset-taro + nutui 按需
├── project.config.json                # 微信小程序项目配置
├── project.tt.json                    # 抖音小程序项目配置
├── tsconfig.json                      # TS 配置(jsx: react-jsx, paths: @/* → src/*)
└── package.json
```

***

## 五、主要功能模块

### 1. 全局用户态 `src/store/user.ts`

基于 **Zustand** 的全局用户 store,持久化到 Taro 同步存储(`auth_token` + `user_info` 两个 key)。

导出动作:

- `login({ token, user })` — 持久化并更新 store
- `logout()` — 清存储并重置
- `updateUser(patch)` — 局部更新用户信息(同时写回存储)
- `hydrate()` — 从存储重新恢复(应用启动或 `useDidShow` 时调用)

`UserInfo` 字段:`id` / `name` / `email` / `role` / `phone?`(从 email 解析) / `avatar?` / `avatarUrl?`(后端原字段,profile 页回填用)。

### 2. 请求层 `src/services/request.ts`

统一封装 `Taro.request`:

- 自动拼接 `API_BASE_URL`
- 自动注入 `Authorization: Bearer <token>`(`skipAuth: true` 时跳过)
- 解析后端 `IResponse<T>` 信封,直接返回 `data`
- **HTTP 401** 自动 `clearToken()` + `Taro.reLaunch` 到登录页并抛错
- 业务码非 2xx 抛错(`body.message`)
- 响应格式异常抛"服务器响应格式异常"
- 网络异常抛"网络异常,请稍后重试"

### 3. 鉴权服务 `src/services/auth.ts`

对外暴露的鉴权 API:

| 函数                                    | 接口                                        | 是否鉴权 |
| ------------------------------------- | ----------------------------------------- | ---- |
| `sendSmsCode(phone)`                  | `POST /api/auth/sms/send`                 | 否    |
| `loginByCredentials(email, password)` | `POST /api/auth/login/credentials`        | 否    |
| `loginByPhone(phone, code)`           | `POST /api/auth/login/phone`              | 否    |
| `loginByWechat(code, phoneCode)`      | `POST /api/auth/wechat-miniprogram/login` | 否    |
| `fetchCurrentUser()`                  | `GET /api/auth/me`                        | 是    |

`toUserInfo(auth)` 把后端 `AuthUser` 映射为前端 `UserInfo`,并从 email 提取手机号(`/^(\d{11})@/` 形式)。

### 3.1 上传服务 `src/services/upload.ts`

通用文件上传(不依赖 `request<T>`,因为 multipart 与 JSON 序列化冲突):

| 函数 | 底层 | 适用端 |
| --- | --- | --- |
| `uploadFile({ file, name?, purpose? })` | `Taro.uploadFile` | weapp / tt(传 `tempFilePath` 字符串) |
| 同上 | `fetch + FormData` | H5(传 `File` 对象,即 `chooseMedia.originalFileObj`) |

后端对应 `POST /api/upload`,5 MiB / 4 种图片 MIME(`image/jpeg|png|webp|gif`)默认限制,可通过后端 env 调整。`purpose: 'avatar'` 标识头像场景(便于将来按场景做清理)。

### 4. 入口与生命周期 `src/app.tsx`

`useDidShow` 钩子:

1. 先调用 `useUserStore.getState().hydrate()` 同步恢复登录态
2. 若 `token` 存在,异步 `fetchCurrentUser()` 校验并刷新 `user`
3. 失败一律吞掉 — 401 已在 `request.ts` 拦截,其它错误保留登录态供离线浏览

### 5. 登录页 `src/pages/login/index.tsx`

- 两个 Tab: **手机验证码** / **账号密码**
- 顶部**微信一键登录**按钮(仅 `TARO_ENV === 'weapp'` 渲染,`openType="getPhoneNumber"`)
- 60 秒倒计时(`setInterval` + `useRef`,卸载时清理)
- 协议勾选(Checkbox)
- 已登录用户进入此页会自动 `reLaunch` 到首页

### 6. 首页 `src/pages/index/index.tsx`

脚手架示例页:展示框架信息 + NutUI `Cell` / `Button` 组件示例 + `CustomTabBar`。

### 7. 我的页 `src/pages/mine/index.tsx`

- 用户卡片(头像 + 昵称 + 副标题,登录态显示手机号)
- 4 个设置入口(个人资料 / 账号与安全 / 消息通知 / 关于我们)
- 已登录态显示"退出登录"按钮(调用 `useUserStore().logout()`)
- 未登录态显示"登录"按钮(导航到登录页)
- 点击 **个人资料** Cell → `Taro.navigateTo({ url: '/pages/profile/index' })`

### 8. 个人资料页 `src/pages/profile/index.tsx`

- 顶部头像区:`<Avatar>` 实时预览 + "选择图片" / "更换头像" 按钮 + "清除" 按钮
- 头像流程:`Taro.chooseMedia` 选图(weapp/tt 走 `tempFilePath`,H5 走 `originalFileObj`)→ `uploadFile({ file, purpose: 'avatar' })` → 拿到 `{ url }` → 自动回填头像预览
- 表单:昵称(1-100 字符)+ 邮箱(可空,需合法格式)
- 底部固定"保存"按钮:`Taro.navigateBack()` 返回"我的"页
- 提交流程:调用 `updateMyProfile(patch)` → 后端 `PATCH /api/auth/me` 落库 → `useUserStore().updateUser(fromUserDTO(dto))` 同步本地
- 未登录守卫:进入页面时若 `!isLoggedIn` 则 `reLaunch` 回登录页

### 9. 自定义 TabBar `src/components/CustomTabBar/index.tsx`

跨 weapp / h5 / tt 三端一致的底部 TabBar,使用 `Taro.reLaunch` 切 tab 避免栈累积。**注:path 比较时已做归一化,`useRouter().path`** **与** **`pagePath`** **在前导斜杠上的差异已被处理。**

### 10. 主题与样式系统 `src/styles/`

- `theme.scss` — 品牌色(可改)、功能色、背景/文本/边框色
- `variables.scss` — 间距/圆角/字号/行高/字重/阴影/过渡 + 8 个 mixin(`text-ellipsis` / `flex-center` / `button-reset` 等)
- `compat.scss` — 多端盒模型统一 + H5 端 TabBar 异常修复

样式使用规则:

- 页面级样式统一用 **SCSS Modules**(`*.module.scss`),`namingPattern: 'module'`
- 全局变量通过 `@use '@/styles/variables.scss' as *;` 引入
- H5 端 `selectorBlackList: ['body']`,避免 `pxtransform` 误伤
- 小程序端 `selectorBlackList: ['nut-']`,避免 NutUI 内部样式被转换

### 11. 兴趣标签体系 `src/components/TagSelector/` + `src/pages/search/`

「同频圈」核心模块之一,围绕六大类兴趣标签(太极 / 书法 / 古琴 / 茶道 / 国画 / 民乐)实现标签选择、搜索、自定义添加。

- **TagSelector 通用组件** `src/components/TagSelector/index.tsx`
  - props:`{ selectedIds: string[], onChange: (ids: string[]) => void, max?: number }`(默认 max=10)
  - 顶部搜索框 + 300ms 防抖联想列表(调 `searchTags(q)`)
  - 已选标签 chip 区(可删除)
  - 六大类分类树骨架(后端无按 category 浏览接口,仅作展开/收起提示)
  - 自定义添加入口:输入框 + 提交按钮调 `createCustomTag(name)`,成功后自动加入已选
- **兴趣选择页** `src/pages/search/index.tsx`
  - 复用 TagSelector,顶部"完成(N)"按钮
  - 进入时若已有 tags 则预填
  - 完成后调 `updateMyTags(tagIds)` 持久化,`useUserStore().updateUser({ tags })` 同步 store,`Taro.navigateBack()`
- **服务层** `src/services/tags.ts`:`searchTags(q)` / `getCategories()` / `createCustomTag(name)`
- **类型**:`TagDTO` / `Category` 定义在 `types/global.d.ts`,与后端 DTO 对齐

### 12. 同频匹配 `src/pages/publish/` + `src/pages/match/`

基于地理位置 + 兴趣重合度 + 活跃度的多维度匹配。

- **发布定位页** `src/pages/publish/index.tsx`
  - 地图组件 + 重新定位按钮(weapp 用 `Taro.chooseLocation`,H5 退化用 `Taro.getLocation`)
  - 当前位置卡片 + 我的兴趣卡片(点击跳 search)+ 范围选择 Tab + "发布并匹配"按钮
  - 未选兴趣时禁用按钮
  - 发布调 `publishLocation(input)`,成功后跳 `pages/match/index` 并携带参数
- **匹配结果页** `src/pages/match/index.tsx`
  - 双 Tab(同频的人 / 同频的圈子)+ 范围筛选(全部/≤1km/≤5km/≤10km)
  - 进入时并发调 `matchPeople + matchCircles`,缓存到 `store/match`
  - 人列表项:头像 + 昵称 + 距离 + 标签 + 活跃度 + 练习时长;点击 Toast 提示(spec 设计缺陷:`MatchPersonDTO` 无 `phone`/`publicContact` 字段)
  - 圈子列表项:标题 + 距离 + 标签 + 活动时间 + 成员数;点击跳 `pages/circle/index?id=xxx`
  - 空状态 + 下拉刷新(上拉加载更多留 TODO)
- **服务层** `src/services/locations.ts`:`publishLocation(input)` / `matchPeople(params)` / `matchCircles(params)`
- **状态层** `src/store/match.ts`(缓存匹配结果)+ `src/store/location.ts`(缓存发布位置)

### 13. 圈子管理 `src/pages/circle/` + `src/pages/create-circle/` + `src/pages/my-published/`

TEACHER 角色专属(普通 USER 提交创建圈子时自动升级 role)。

- **圈子详情页** `src/pages/circle/index.tsx`
  - 标题 + 标签 + 创建者卡片 + 介绍 + 活动时间 + 活动地点(文字展示)+ 成员人数 + 底部按钮
  - 非创建者:底部"联系老师"按钮 → 调 `contactCircle(id, type)` → 弹 NutUI `Popup`(优先 phone,phone 为 null 改用 wechat)
  - 创建者:底部"编辑圈子信息"按钮 → 跳 `pages/create-circle?id=xxx`;额外展示"被联系次数"
  - 边界:圈子不存在展示"该圈子已不存在"
- **创建/编辑圈子页** `src/pages/create-circle/index.tsx`
  - 表单(标题 / 标签搜索选择[最多 5 个] / 描述[NutUI `TextArea`] / 活动地点 / 联系电话 / 微信号 / 活动时间 / 人数上限)
  - 实时校验:必填项未填禁用按钮;联系电话与微信号至少填一项
  - 提交:非 TEACHER 时先调 `updateProfile({ role: 'TEACHER' })` 升级;成功跳 `pages/circle/index?id=xxx`(`Taro.redirectTo` 避免栈累积)
  - 编辑模式:预填现有数据,提交调 `updateCircle`(排除 lat/lng/address,因 `UpdateCircleInput` 不含这三字段)
- **我发布的圈子** `src/pages/my-published/index.tsx`:TEACHER 用户展示自己创建的圈子列表,支持编辑/下线
- **我加入的圈子** `src/pages/my-circles/index.tsx`:展示 `useMatchStore.circles` 缓存(最近匹配的圈子)
- **服务层** `src/services/circles.ts`:`createCircle` / `getCircle` / `updateCircle` / `deleteCircle` / `getMyCircles` / `contactCircle`

### 14. 隐私设置 `src/pages/privacy/`

- 三个开关:公开联系方式 / 允许被匹配 / 位置精度(`community` / `region`)
- 位置精度用 NutUI `Radio.Group` 单选
- 300ms 防抖保存(调 `updatePrivacy(settings)`)
- `initialized` 标记避免首次 mount 触发保存
- 后端集成:people-matcher 过滤 `privacySettings.allowMatch=false` 用户;`locationPrecision='community'` 时 `distanceKm` 四舍五入到 0.5km,`'region'` 时 5km

### 15. 自定义 TabBar(3 项凸起) `src/components/CustomTabBar/index.tsx`

「同频圈」MVP 改版后的 TabBar:

- 3 项:**首页** / **发布[中间凸起]** / **我的**
- 中间"发布"按钮:`transform: translateY(-20rpx)` 实现凸起 + 圆形渐变背景 + 阴影(`PublishIcon` SVG)
- 点击逻辑:`role === 'TEACHER'` 时 `showActionSheet`(发布定位 / 创建圈子);其他角色直接跳 `pages/publish`
- 左右两项用 `Taro.reLaunch` 切换避免栈累积

***

## 六、开发规范

### 命名与文件

- **文件:** 页面/组件使用 `kebab-case`,如 `phone-login-form.tsx`
- **组件:** `PascalCase` 命名,默认导出函数组件
- **样式类:** 通过 `styles.xxx` 访问(`*.module.scss`)
- **路径别名:** `@/*` → `src/*`(TS 与 Webpack 均已配置 `tsconfig-paths-webpack-plugin`)

### TypeScript

- 启用 `strictNullChecks` / `noUnusedLocals` / `noUnusedParameters`
- 优先 `import type` 引入纯类型
- 避免 `any`;`unknown` + 收窄
- 不使用 `enum`,改用 `as const` 字面量联合
- 全局类型扩展在 `types/global.d.ts`

### React 组件

- 默认函数组件 + `React.FC` 显式标注(对 `children` 推断更友好)
- 副作用钩子 `useEffect` / `useDidShow` / `useDidHide` 选择依据:
  - 普通 React Hooks 用 `useEffect`
  - 与 Taro 页面生命周期对齐的副作用优先 `useDidShow` / `useDidHide`
- `setInterval` / `setTimeout` 必须用 `useRef` 保存句柄,并在 `useEffect` 清理函数里 `clearXxx`

### 注释与文案

- **源码注释使用中文**(与 `admin/` 子项目保持一致)
- UI 文案使用中文,英文标点统一为半角,中文标点按需使用全角(如「、」)

### 请求与错误处理

- 所有 HTTP 调用走 `services/request.ts` 封装的 `request<T>()`,**禁止直接调** **`Taro.request`**
- 业务码错误处理: 直接 `throw new Error((e as Error).message)`,UI 层用 `Taro.showToast({ icon: 'none' })` 提示
- 401 由 `request.ts` 统一拦截并跳转登录,业务代码无需重复处理

### 样式

- 颜色: 一律引用 `theme.scss` 的 `$color-*` 变量,**禁止硬编码色值**
- 间距: 使用 `$spacing-xs/sm/md/lg/xl` 网格
- 圆角: 使用 `$radius-xs/sm/md/lg/xl/button/round` 语义化变量
- 字号/行高/字重/阴影: 全部走 `variables.scss`
- 按钮重置: `@include button-reset;`

### 提交流程

提交前本地最低验证(任一可用):

```bash
# 1. 微信开发者工具预览(完整链路)
pnpm dev:weapp

# 2. 离线类型检查
pnpm exec tsc --noEmit
```

> 当前 `package.json` 未配置 `lint` / `test` 脚本;ESLint 配置随 `eslint-config-taro` 提供,按需运行 `pnpm exec eslint src`。

***

## 七、贡献指南

### 提交规范

- 一次提交只做一件事(修一个 bug / 加一个功能 / 改一处重构)
- Commit 信息建议遵循 `type(scope): subject` 格式,例如:
  - `feat(login): 增加 60s 倒计时锁与可关闭 tooltip`
  - `fix(tabbar): 修正 path 比较时前导斜杠导致的 active 态丢失`
  - `refactor(store): 拆分 hydrate 与 login 副作用`
- Subject 中文或英文皆可,保持团队一致

### Pull Request 检查清单

- [ ] 在 `weapp` 端实际跑过受影响页面
- [ ] H5 端关键交互(登录/Tab 切换)目视检查
- [ ] 改动若涉及请求 URL/参数,同步更新 `services/*.ts` 类型
- [ ] 改动若新增样式,确认 NutUI 组件 class 不被 `pxtransform` 误伤
- [ ] 改动若新增全局类型,集中放 `types/global.d.ts`
- [ ] 改动若涉及配置(构建常量、API 地址、依赖),更新本文档相应章节

### 新增页面/模块的推荐步骤

1. **页面:** 在 `src/pages/<name>/` 下创建 `index.tsx` + `index.config.ts` + `index.module.scss`
2. **注册:** 在 `src/app.config.ts` 的 `pages` 数组中按需前置(默认 Tab 首页放第一个)
3. **TabBar:** 若作为 Tab 页,在 `src/components/CustomTabBar/index.tsx` 的 `TABS` 数组追加一项
4. **服务:** 业务接口放 `src/services/<domain>.ts`,走 `request<T>()` 统一封装
5. **状态:** 跨页面共享状态放 `src/store/`,否则用组件本地 `useState`

### 常见踩坑

- **`useRouter().path`** **带前导** **`/`** — 在 `CustomTabBar` 中比较前必须 `replace(/^\/+/, '')`
- **H5 端 rem 基准被动态修改** — `index.html` 已用 `Object.defineProperty` 锁定 `html.style.fontSize = '18px'`,H5 编译会注入 `htmlWebpackPlugin.options.script`
- **NutUI 主题变量冲突** — `config/index.ts` 已显式关闭 `sass.resource` 自动注入,避免与 `variables.scss` 的同名变量冲突
- **Taro** **`useDidShow`** **与** **`useEffect`** **混用** — 登录态恢复等需"页面切回前台就触发"的逻辑用 `useDidShow`,普通副作用用 `useEffect`

***

## 八、相关资源

- [Taro 官方文档](https://taro-docs.jd.com/)
- [NutUI React Taro](https://nutui.jd.com/react-taro/)
- [Zustand](https://github.com/pmndrs/zustand)
- 同仓库后端 `admin/` 子项目:见 [`../admin/AGENTS.md`](../admin/AGENTS.md)

