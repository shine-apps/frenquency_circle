# AGENTS.md

`frontend/` 子项目的 AI 代理协作规约。所有路径相对 **`frontend/` 目录**(非仓库根)。

本文档面向在该子项目内工作的 AI 编码代理(下称"代理"),明确**角色定义、功能职责、交互流程、输入输出规范及使用示例**。请代理在执行任务前完整阅读本文档,执行后按"质量门"章节自检。

---

## 一、范围与边界

**范围:** 本文档仅约束 `frontend/` 目录内的修改。

> `frontend/` 是**独立项目**:依赖与 `admin/` 不共享,`pnpm install` 仅作用于 `frontend/` 目录。

**不在范围:**

- `admin/` 后端子项目(请阅读 [`../admin/AGENTS.md`](../admin/AGENTS.md))
- 仓库根 `README.md` / `nginx.conf` / `docs/` 等横切资源
- 微信开发者工具侧的 IDE 配置文件(`project.config.json` 的 `appid` 字段除外)

如任务跨越前后端,代理应**先在 `admin/` 与 `frontend/` 之间建立明确的接口契约**(URL/方法/请求体/响应体),再分别落地,避免双向重复实现。

---

## 二、代理角色定义

本项目协作至少涉及以下 5 类代理角色。每类代理只承担其职责范围内的任务,跨边界任务需明确交接。

### 1. `code-implementer`(代码实现者)

- **职责:** 根据需求文档或 issue,实现页面/组件/服务/状态变更。
- **输出:** 可在 `weapp` 端运行的 TypeScript + SCSS 代码。
- **不做:** 架构选型、依赖升级、与后端协议无关的大范围重构。

### 2. `ui-stylist`(UI/样式实现者)

- **职责:** 实现页面视觉、SCSS Modules 样式、动画、响应式适配。
- **输入:** 设计稿(若有)+ 已有 `theme.scss` / `variables.scss` 变量。
- **不做:** 业务逻辑、状态管理、请求层修改。

### 3. `bug-fixer`(缺陷修复者)

- **职责:** 复现、定位、修复生产/开发中的 Bug,补充最小回归用例。
- **输入:** Bug 复现步骤、相关日志、相关代码。
- **不做:** 与 Bug 无关的"顺手优化"。

### 4. `doc-writer`(文档维护者)

- **职责:** 维护 `README.md` / `AGENTS.md` / 关键文件头注释,确保与代码一致。
- **不做:** 任何代码逻辑修改。

### 5. `integration-tester`(集成验证者)

- **职责:** 在 `weapp` 开发者工具中端到端验证登录流程、Tab 切换、页面跳转。
- **输出:** 验证清单(通过/未通过项 + 截图说明)。
- **不做:** 直接修改业务代码(只反馈给 `bug-fixer`)。

> 单一代理在一次会话中可扮演多个角色,但应**显式说明当前在哪个角色**,以避免越权修改。

---

## 三、文件级功能职责表

| 文件/目录 | 主要代理 | 修改注意 |
| --- | --- | --- |
| `src/app.tsx` | `code-implementer` | 修改 `useDidShow` 副作用会影响所有页面,需手动回归首页/登录/我的 |
| `src/app.config.ts` | `code-implementer` | `pages` 数组的第一项是**默认首页**,顺序敏感 |
| `src/app.scss` | `ui-stylist` | 改 `page { ... }` 全局规则会污染所有页面 |
| `src/store/user.ts` | `code-implementer` | 任何写入 `localStorage` 字段都需在 `README.md` 同步说明 |
| `src/services/request.ts` | `code-implementer` | 401 处理逻辑改动影响**所有**鉴权调用,需谨慎 |
| `src/services/auth.ts` | `code-implementer` | 接口签名变更需同步通知后端 |
| `src/services/upload.ts` | `code-implementer` | 跨端分支(weapp/tt 走 `Taro.uploadFile`,H5 走 `fetch + FormData`),改动需在两端回归;**不**复用 `request<T>`(multipart 与 JSON 序列化冲突) |
| `src/pages/login/index.tsx` | `code-implementer` + `ui-stylist` | 含三方登录逻辑,改动需在 weapp 端回归 |
| `src/pages/profile/index.tsx` | `code-implementer` + `ui-stylist` | 修改表单字段需同步后端 `PATCH /api/auth/me` 的 zod schema;头像走 `chooseMedia → uploadFile → PATCH /api/auth/me`,改动需在 weapp / H5 双端跑通 |
| `src/components/CustomTabBar/index.tsx` | `code-implementer` | 修改 `TABS` 数组需同步检查 `app.config.ts` 的 `pages` |
| `src/styles/variables.scss` | `ui-stylist` | 删除变量需全局 grep,使用频率高 |
| `src/styles/theme.scss` | `ui-stylist` | 品牌色变更前需与产品/品牌侧确认 |
| `config/dev.ts` / `config/prod.ts` | `code-implementer` | `API_BASE_URL` 改动需团队同步 |
| `babel.config.js` | `code-implementer` | 修改 NutUI 按需配置需重新 `pnpm install` |
| `tsconfig.json` | `code-implementer` | 路径别名修改需同步 `config/index.ts` 的 `tsconfig-paths-webpack-plugin` |
| `types/global.d.ts` | `code-implementer` | 新增全局类型前确认是否真的全局 |

---

## 四、输入输出规范

### 4.1 任务输入(交给代理)

代理期望收到的任务应至少包含:

1. **目标:** 一句话描述要达成什么(如"为登录页增加"记住我"复选框")
2. **触发上下文:** issue 链接 / 截图 / 用户原话 / 相关代码片段
3. **约束:** 不可触碰的模块、需要兼容的旧行为、性能/包体积要求
4. **验收标准:** 可见的功能行为或可执行的检查命令

**反例(信息不足,代理应主动追问):**

- "优化一下登录页" — 优化什么?性能?UI?可访问性?
- "修一下那个 bug" — 哪个 bug?复现步骤?

### 4.2 代理输出

代理完成任务后应给出:

1. **变更摘要:** 1-3 条 bullet,说明改了什么、为什么
2. **影响范围:** 列出修改的文件、可能影响的下游调用方
3. **自检结果:** `tsc --noEmit` 输出、weapp 端运行截图/日志
4. **未做事项:** 受限于本会话范围而推迟的工作

### 4.3 代码 I/O 契约

代理修改代码时,应保证:

- **入参校验:** 表单处理函数先校验格式(手机号正则 `PHONE_RE`、验证码长度 `CODE_LEN`),再发起请求
- **错误传播:** 业务异常一律 `throw new Error(message)`,由调用方决定如何提示(Toast / Modal)
- **状态写入:** Zustand 的 `set` 应尽量保持不可变更新,避免直接 mutate `state.user`
- **副作用清理:** `setInterval` / `setTimeout` 必须在 `useEffect` 返回函数里 `clearXxx`
- **平台分支:** 仅 weapp 可用的能力必须先用 `process.env.TARO_ENV === 'weapp'` 守卫(如 `openType="getPhoneNumber"`、云开发)

---

## 五、交互流程

### 5.1 标准开发流

```
[user] → [code-implementer] → [ui-stylist] → [integration-tester] → [user]
              ↑                                    |
              └──── bug-fixer (若失败) ────────────┘
```

1. `code-implementer` 实现页面骨架(组件树 + 状态 + 请求)
2. `ui-stylist` 补齐样式与响应式
3. `integration-tester` 在 weapp 端走通核心交互
4. 失败时回到 `bug-fixer` 修复,再回到第 3 步

### 5.2 缺陷修复流

```
[bug report] → [bug-fixer] → [integration-tester] → [done]
                  ↑                  |
                  └──── 仍失败 ──────┘
```

`bug-fixer` 必须在修复前:

1. 用最少代码复现 Bug
2. 写明根因(避免"猜测性修复")
3. 列出可能的回归点

### 5.3 文档维护流

```
[code change merged] → [doc-writer] → [PR review] → [done]
```

代码合并后,`doc-writer` 应在 1 个工作日内同步 `README.md` / `AGENTS.md`。

---

## 六、使用示例

### 示例 1: `code-implementer` 新增"退出登录"二次确认

**输入任务:**

> 在 `src/pages/mine/index.tsx` 的"退出登录"按钮上增加二次确认。点击后弹出 `Taro.showModal`,用户确认后才调用 `useUserStore().logout()`。

**期望代理产出:**

1. 修改 `src/pages/mine/index.tsx`:
   - 提取 `handleLogout` 函数,先 `await Taro.showModal({ ... })`,确认后再 `logout()`
   - 保持其它逻辑不变
2. 给出变更摘要与影响范围
3. 自检:`pnpm exec tsc --noEmit` 通过 + weapp 端手动验证

**常见错误:**

- 直接同步 `logout()` 而忘了 `await` showModal
- 引入新的 Modal 组件库,与项目约定(`Taro.showModal`)不一致

### 示例 2: `ui-stylist` 调整登录页 Logo 大小

**输入任务:**

> 把登录页 Logo 从 `120rpx` 调整为 `144rpx`,保持其它视觉属性不变。

**期望代理产出:**

1. 修改 `src/pages/login/index.module.scss` 的 `.logo { width/height: 120rpx → 144rpx }`
2. **只改这两个值**,不重排布局
3. 在 weapp 与 H5 端目视确认

**常见错误:**

- 顺手"美化"标题、按钮、渐变色等
- 引入新的色值(必须用 `$color-primary` 变量)

### 示例 3: `bug-fixer` 修复"我的"页手机号副标题文案

**输入任务(历史 Bug):**

> 已登录但未绑定手机号时,副标题错误地显示"已绑定手机号"。

**期望代理产出:**

1. 在 `src/pages/mine/index.tsx` 找到三元表达式
2. 把 `'已绑定手机号'` 改为 `'未绑定手机号'`
3. 在 weapp 端构造测试数据(去掉 user.phone)验证文案
4. 给出根因说明(原本 `?? '已绑定手机号'` 反向逻辑)

### 示例 4: `integration-tester` 验证登录流程

**期望产出:** 一份验证清单,格式如下:

```markdown
## 登录流程集成验证

- [x] 输入 11 位手机号 + 同意协议 + 发送验证码 → Toast 提示"验证码已发送",60s 倒计时正常
- [x] 输入 6 位错误验证码 → 提示"验证码错误",无跳转
- [x] 输入正确验证码 → 自动跳转"我的"页,顶部显示手机号
- [x] 退出登录后回到登录页
- [ ] 微信一键登录按钮未在 H5 端渲染(预期)
- [x] H5 端 TabBar 高亮态正确
```

---

## 七、严禁清单(代理必读)

代理**不得**在 `frontend/` 内执行以下操作,除非用户明确要求并写明风险:

1. 升级 Taro / React / NutUI / 任何核心依赖的主版本号(可能引发大量 breaking change)
2. 移除 `useDidShow` 钩子中的 `hydrate()`(会导致登录态恢复失效)
3. 删改 `services/request.ts` 的 401 处理逻辑(影响所有鉴权调用)
4. 把 `setToken` / `clearToken` / `getToken` 散落到组件内部(必须集中在 store 或 service)
5. 直接 `Taro.request` 绕开 `request<T>()` 封装
6. 修改 `app.scss` 中的 `page { ... }` 全局规则而不评估影响
7. 改 `variables.scss` 中**已存在**的变量值(只能新增或扩展,不能改语义)
8. 删除 `CustomTabBar` 或将 `TABS` 数组的第一个元素(默认首页)位置对调
9. 在 `types/global.d.ts` 中 export 与项目无关的第三方类型
10. 把 API 地址硬编码到组件(必须走 `config/{dev,prod}.ts`)

---

## 八、关键模式参考

### 8.1 添加一个新 Tab 页

1. 在 `src/pages/<name>/` 创建 `index.tsx` / `index.config.ts` / `index.module.scss`
2. 在 `src/app.config.ts` 的 `pages` 数组中注册(若为默认 Tab,放第一个)
3. 在 `src/components/CustomTabBar/index.tsx` 的 `TABS` 数组追加 `{ key, pagePath, text, icon, activeIcon }`
4. 在 `src/components/Icons/` 新建对应 SVG 图标(若无可用)
5. 文档同步:在 `README.md` 目录结构与功能模块章节补充

### 8.2 添加一个新 API 调用

1. 在 `src/services/<domain>.ts` 导出 `xxxRequest()` 函数,内部走 `request<T>()`
2. 在 `types/global.d.ts` 或就近定义响应 DTO 类型
3. 在 store 中按需新增切片(避免 store 膨胀)
4. UI 组件只 `import` 函数,不知道 `Taro.request` 存在

### 8.3 添加一个文件上传调用

1. **不**复用 `request<T>`(其强制 `Content-Type: application/json` 会破坏 multipart boundary)
2. 在 `src/services/upload.ts` 已有 `uploadFile(input: UploadInput): Promise<UploadResult>`
3. 三端差异(由封装内部处理,业务侧无感):
   - **weapp/tt**:`file` 传 `Taro.chooseMedia` 返回的 `tempFilePath` 字符串;底层 `Taro.uploadFile`(`SuccessCallbackResult.data` 是 string,需手动 JSON.parse)
   - **H5**:`file` 传 `originalFileObj`(`File` 对象);底层 `fetch + FormData`
4. UI 侧:`chooseMedia → uploadFile → setAvatarUrl → 调 PATCH /api/auth/me`
5. 头像场景固定传 `purpose: 'avatar'`(后端会校验 MIME/大小并按年/月分目录落盘)

### 8.4 修复样式在多端不一致

1. 先在 weapp 端复现
2. 在 `config/index.ts` 的对应端(`mini` / `h5`)调整 `pxtransform` 的 `selectorBlackList`
3. 若属 NutUI 组件样式问题,优先在组件外层包裹 View 覆盖,不要改 NutUI 内部 class
4. 同步 H5 端的 `html fontSize` 锁定(`index.html`)

---

## 九、质量门(代理自检)

提交前,**至少**完成以下检查并保留证据(命令输出/截图):

| 项 | 命令/方式 | 通过条件 |
| --- | --- | --- |
| 类型检查 | `pnpm exec tsc --noEmit` | 0 error |
| weapp 端构建 | `pnpm build:weapp` | 产物输出 `dist/`,无致命警告 |
| weapp 端运行 | 微信开发者工具导入 `frontend/` | 首页可正常进入,无白屏 |
| 登录链路 | 手动:输入手机号 → 收码 → 登录 → 我的页 | 全流程通过 |
| Tab 切换 | 点击"首页"→"我的"→"首页" | 高亮态正确,无重新加载闪烁 |
| 退出登录 | 我的页 → 退出 → 回到登录页 | 二次确认(若实现) + 跳转 |
| 文档同步 | `README.md` 与代码一致 | 章节无过期描述 |

> **H5 端校验**仅在改动可能影响 H5 时进行(TabBar、布局、安全区、`pxtransform`)。

---

## 十、上下文与依赖

- **后端协议:** `admin/` 子项目提供 `IResponse<T>` 信封 + `/api/auth/*` 接口,详见 [`../admin/AGENTS.md`](../admin/AGENTS.md) §API Conventions / §Authentication / §SMS subsystem
- **设计稿基准:** 750rpx(`config/index.ts` 中 `designWidth: 375`,Taro 默认换算)
- **后端 API 基址:** 由 `config/{dev,prod}.ts` 的 `defineConstants.API_BASE_URL` 注入到运行时
- **常见跨端差异:**
  - weapp — `wx.login` / `getPhoneNumber` 可用,TabBar 原生支持
  - h5 — 必须用 `CustomTabBar`,且 `index.html` 锁定了 html fontSize
  - tt — 类似 weapp,但 API 名称与 wx 不同(本项目当前未用 tt 特有 API)
