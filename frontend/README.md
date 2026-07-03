# Frontend (Taro 小程序)

`frontend/` 是 该项目的客户端子项目,基于 **Taro 4.x + React 18 + TypeScript** 构建,使用 **NutUI React Taro** 作为跨端 UI 组件库,目标平台为微信小程序(主)、H5、抖音小程序(可扩展支付宝/QQ/京东/百度/快应用等)。

它配合同仓库的 `admin/` Next.js 后端(提供 `IResponse<T>` 信封的 REST API、JWT 鉴权与 SMS 登录),共同构成完整的多端登录与用户中心示例。

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
- **pnpm** ≥ 8(本仓库使用 pnpm 工作区,根目录已有 `pnpm-workspace.yaml`)
- 微信开发者工具(用于 `weapp` 端调试)
- H5 端可选任意现代浏览器

### 安装步骤

在仓库根目录执行(整个 monorepo 统一安装):

```bash
# 1. 安装根级依赖与所有 workspace 成员
pnpm install

# 2. 如首次使用 Taro CLI(可选,dev/build 脚本会自动调用 npx taro)
pnpm add -g @tarojs/cli
```

> **pnpm 10+ 提示:** 首次安装若出现 `[ERR_PNPM_IGNORED_BUILDS]`,可在 `pnpm-workspace.yaml` 的 `allowBuilds` 块显式放行 `@nutui/nutui-react-taro`、`@tarojs/cli`、`esbuild` 等构建依赖,或运行 `pnpm approve-builds` 交互式放行。

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
│   ├── app.config.ts                  # 全局 app.json(页面列表/窗口样式)
│   ├── app.scss                       # 全局样式入口
│   ├── index.html                     # H5 入口模板(锁定 html fontSize=18px)
│   ├── components/
│   │   ├── CustomTabBar/             # 自定义底部 TabBar(跨端一致)
│   │   │   ├── index.tsx
│   │   │   └── index.module.scss
│   │   └── Icons/                     # 内联 SVG 图标
│   │       ├── HomeIcon.tsx
│   │       ├── ProfileIcon.tsx
│   │       └── index.ts
│   ├── pages/
│   │   ├── index/                     # 首页
│   │   ├── login/                     # 登录页(Tabs: 手机验证码 / 账号密码 + 微信一键)
│   │   └── mine/                      # 我的页(用户卡片 + 设置入口 + 退出)
│   ├── services/
│   │   ├── request.ts                 # 统一请求封装(IResponse 解析/401 处理)
│   │   ├── auth.ts                    # 鉴权 API(sendSmsCode/loginByCredentials/...)
│   │   └── cloud.ts                   # 微信云开发(预留,当前未被引用)
│   ├── store/
│   │   └── user.ts                    # Zustand 用户态(token + userInfo)
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

`UserInfo` 字段:`id` / `name` / `email` / `role` / `phone?`(从 email 解析) / `avatar?`。

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

### 8. 自定义 TabBar `src/components/CustomTabBar/index.tsx`

跨 weapp / h5 / tt 三端一致的底部 TabBar,使用 `Taro.reLaunch` 切 tab 避免栈累积。**注:path 比较时已做归一化,`useRouter().path`** **与** **`pagePath`** **在前导斜杠上的差异已被处理。**

### 9. 主题与样式系统 `src/styles/`

- `theme.scss` — 品牌色(可改)、功能色、背景/文本/边框色
- `variables.scss` — 间距/圆角/字号/行高/字重/阴影/过渡 + 8 个 mixin(`text-ellipsis` / `flex-center` / `button-reset` 等)
- `compat.scss` — 多端盒模型统一 + H5 端 TabBar 异常修复

样式使用规则:

- 页面级样式统一用 **SCSS Modules**(`*.module.scss`),`namingPattern: 'module'`
- 全局变量通过 `@use '@/styles/variables.scss' as *;` 引入
- H5 端 `selectorBlackList: ['body']`,避免 `pxtransform` 误伤
- 小程序端 `selectorBlackList: ['nut-']`,避免 NutUI 内部样式被转换

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

