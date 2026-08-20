<p align="center">
  <img width="160" src="./src/static/images/logo_256_circle.png">
</p>

<h1 align="center">
  趣邻圈 - 前端小程序 / H5
</h1>

<div align="center">

基于 `uniapp` + `Vue3` + `TypeScript` + `Vite` + `UnoCSS` + `wot-ui` + `z-paging` 构建的兴趣圈子匹配平台跨端前端。

![node version](https://img.shields.io/badge/node-%3E%3D20-green)
![pnpm version](https://img.shields.io/badge/pnpm-%3E%3D9-green)

</div>

## 📱 项目简介

**趣邻圈** 是一款基于地理位置的兴趣圈子匹配平台。无论你热爱运动、艺术、手工、音乐、阅读、美食还是其他任何兴趣爱好，都能通过兴趣标签与定位匹配，在 `1km / 5km / 10km / 30km` 范围内发现同趣的人与圈子，让"同趣"的人在城市中相遇。

本目录 `frontend_uniapp` 为趣邻圈的移动端前端，使用 [unibest](https://github.com/feige996/unibest) 框架模板搭建，无需依靠 `HBuilderX`，通过命令行方式运行 `H5` 与各类小程序。

## ⚙️ 技术栈与环境

- `uniapp` (uni-app 3.x)
- `Vue 3` + `TypeScript`
- `Vite 5`
- `UnoCSS`（`@unocss/preset-legacy-compat`）
- `wot-ui v2` 组件库
- `z-paging` 分页
- 自研 HTTP 封装（`src/http/http.ts`，基于 `uni.request` + 全局拦截器 + 双 token 刷新队列）
- `pinia` 状态管理（含 `pinia-plugin-persistedstate` 持久化）
- `vue-i18n` 多语言
- 约定式路由（`vite-plugin-uni-pages`）、`layout` 布局（`vite-plugin-uni-layouts`）、登录拦截

### 环境要求

- node >= 20
- pnpm >= 9
- 编辑器推荐 `VSCode`

## 🖥️ 平台支持

项目实际构建并支持以下平台（详见 `package.json` 中 `unibest.platforms`）：

| H5 | 微信小程序 | 抖音小程序 |
| -- | ---------- | ---------- |
| √  | √          | √          |

## 📦 快速开始

```bash
# 安装依赖（项目强制使用 pnpm）
pnpm i

# 本地开发
pnpm dev:h5    # 运行 H5，打开 http://localhost:9000/
pnpm dev:mp    # 运行微信小程序，导入 dist/dev/mp-weixin 到微信开发者工具
pnpm dev:mp-toutiao  # 运行抖音小程序

# 类型检查 / 代码规范
pnpm type-check   # vue-tsc 类型检查
pnpm lint         # eslint
```

## 🚀 发布构建

```bash
pnpm build:h5   # 构建 H5，产物在 dist/build/h5
pnpm build:mp   # 构建微信小程序，产物在 dist/build/mp-weixin
```

## 📁 目录结构（核心）

```
src/
├── pages/          # 约定式路由页面（自动注册）
│   ├── index/      # 首页（圈子/推荐）
│   ├── auth/       # 登录、注册
│   ├── circle/     # 圈子详情
│   ├── me/         # 我的
│   ├── privacy/    # 隐私设置
│   └── about/      # 关于我们
├── layouts/        # 布局
├── router/         # 路由与登录拦截配置
├── components/     # 公共组件
├── store/          # pinia 状态
├── http/           # 自研 HTTP 封装（uni.request + 拦截器 + 双 token 刷新）
├── api/            # 业务接口（基于 @/http/http）
├── service/        # openapi 生成适配层（底层走 @/http/http）
├── utils/          # 工具方法
└── static/         # 静态资源（含 logo 等）
```

## 🔐 登录策略

采用**白名单策略**（默认需要登录才能访问，见 `src/router/config.ts` 的 `LOGIN_STRATEGY`）。
在 `definePage` 中配置 `excludeLoginPath: true` 的页面（如登录、注册、关于页）可免登录访问。

## 📄 License

MIT

Copyright (c) 2026 趣邻圈 / 上海祥和一文化科技有限公司
