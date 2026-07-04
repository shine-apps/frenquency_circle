# 项目介绍

跨端登录与用户中心模板项目,采用 pnpm workspace 管理两个子项目:

| 子项目 | 技术栈 | 说明 |
| --- | --- | --- |
| [`admin/`](./admin) | Next.js 16 · React 19 · Drizzle ORM · PostgreSQL · Auth.js v5 | 后端 API + 管理后台(邮箱/密码、手机短信验证码、微信小程序登录) |
| [`frontend/`](./frontend) | Taro 4 · React 18 · NutUI React Taro · Zustand | 跨端客户端(微信小程序 / H5 / 抖音小程序),对接 `admin/` 提供的 REST API |

## 快速开始

```bash
# 1. 安装根级与所有 workspace 依赖
pnpm install

# 2. 启动数据库(PostgreSQL 16,走 Docker)
cd admin && pnpm db:up

# 3. 数据库迁移 + 种子
pnpm db:generate && pnpm db:migrate && pnpm db:seed

# 4. 启动后端(默认 :3000)
pnpm dev

# 5. 另开终端,启动客户端(微信小程序 / H5 / 抖音)
cd ../frontend && pnpm dev:weapp    # 或 dev:h5 / dev:tt
```

> **pnpm 10+ 提示:** 首次安装若出现 `[ERR_PNPM_IGNORED_BUILDS]`,可运行 `pnpm approve-builds`,或参考根级 `pnpm-workspace.yaml` 的 `allowBuilds` 块手动放行 `@alicloud/openapi-core`、`@nutui/nutui-react-taro`、`@tarojs/cli` 等。

## 仓库结构

```
root_project/
├── admin/                # Next.js 后端 + 管理后台
├── frontend/             # Taro 跨端客户端
├── pnpm-workspace.yaml   # workspace 声明与构建依赖放行
└── README.md             # 本文件
```

## 子项目文档

- 后端 / 管理后台 → [admin/README.md](./admin/README.md) · [admin/AGENTS.md](./admin/AGENTS.md)
- 客户端 → [frontend/README.md](./frontend/README.md) · [frontend/AGENTS.md](./frontend/AGENTS.md)

## 主要特性

- **多端登录** — 邮箱+密码、手机号+短信验证码、微信小程序一键登录(基于 Auth.js v5,统一 `accounts` 表管理用户-登录方式绑定)
- **个人资料管理** — 登录用户可改昵称/邮箱/头像(头像走本地文件上传,落 `public/uploads/<yyyy>/<mm>/<uuid>.<ext>`)
- **通用文件上传** — `POST /api/upload`(本地存储,可换 OSS 驱动),支持 MIME/大小限制
- **统一 API 信封** — 后端 `IResponse<T>` + 前端 `request<T>()` 自动解析,业务码非 2xx 统一抛错
- **测试基线** — Vitest + happy-dom + MSW(单元/集成) + Playwright(E2E)
- **结构化日志** — `lib/logger.ts` 统一 info/warn/error 事件记录
- **样式分层** — 后端走 Tailwind v4 + shadcn/ui(`@base-ui/react` 基底);客户端走 SCSS Modules + 全局主题变量

## 常用命令速查

| 任务 | 命令 |
| --- | --- |
| 安装所有依赖 | `pnpm install` |
| 启动后端开发服务器 | `cd admin && pnpm dev` |
| 启动客户端(weapp/h5/tt) | `cd frontend && pnpm dev:weapp` |
| 后端类型检查 | `cd admin && pnpm exec tsc --noEmit` |
| 后端单元/集成测试 | `cd admin && pnpm test` |
| 后端 E2E | `cd admin && pnpm test:e2e` |
| 数据库相关 | `cd admin && pnpm db:up / db:down / db:generate / db:migrate / db:seed / db:reset / db:studio` |
| 代码检查 | `cd admin && pnpm lint` |

## 许可

内部模板项目,未指定开源许可。
