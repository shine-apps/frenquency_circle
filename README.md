# 项目介绍

本仓库包含两个**完全独立**的子项目,各自维护自己的依赖、构建与部署流程:

| 子项目 | 技术栈 | 说明 |
| --- | --- | --- |
| [`backend/`](./backend) | Next.js 16 · React 19 · Drizzle ORM · PostgreSQL · Auth.js v5 | 后端 API + 管理后台(邮箱/密码、手机短信验证码、微信小程序登录) |
| [`frontend_uniapp/`](./frontend_uniapp) | uni-app · Vue 3 · TypeScript · wot-ui · UnoCSS | 跨端客户端(微信小程序 / H5 / 抖音小程序),对接 `backend/` 提供的 REST API |

> 两个子项目之间**不共享** `node_modules` / lockfile / pnpm workspace,需要分别安装、运行、构建与测试。

## 快速开始

```bash
# 1. 启动后端依赖的数据库(PostgreSQL 16,走 Docker)
cd backend && pnpm db:up

# 2. 安装后端依赖并初始化数据库
cd backend
pnpm install
pnpm db:generate && pnpm db:migrate && pnpm db:seed

# 3. 启动后端(默认 :3000)
pnpm dev

# 4. 另开终端,安装并启动客户端(微信小程序 / H5 / 抖音)
cd ../frontend_uniapp
pnpm install
pnpm dev:mp    # 或 dev:h5 / dev:mp-toutiao
```

> **pnpm 10+ 提示:** 首次安装若出现 `[ERR_PNPM_IGNORED_BUILDS]`,可在各自子项目内运行 `pnpm approve-builds` 放行 `@alicloud/openapi-core`、`@wot-ui/ui` 等构建依赖。

## 仓库结构

```
root/
├── backend/                # Next.js 后端 + 管理后台(独立项目)
├── frontend_uniapp/      # uni-app 跨端客户端(独立项目)
├── docs/                 # 产品 PRD 与功能设计文档(共用)
├── nginx.conf            # 生产环境反向代理参考配置(共用)
├── .gitignore            # 覆盖两个子项目的忽略规则
└── README.md             # 本文件
```

> 已移除的内容:根 `pnpm-workspace.yaml` / 共享 `pnpm-lock.yaml` / `.github/workflows/`。两个子项目独立维护各自的部署脚本。

## 子项目文档

- 后端 / 管理后台 → [backend/README.md](./backend/README.md) · [backend/AGENTS.md](./backend/AGENTS.md)
- 客户端 → [frontend_uniapp/README.md](./frontend_uniapp/README.md)

## 主要特性

- **多端登录** — 邮箱+密码、手机号+短信验证码、微信小程序一键登录(基于 Auth.js v5,统一 `accounts` 表管理用户-登录方式绑定)
- **个人资料管理** — 登录用户可改昵称/邮箱/头像(头像走 COS 直传)
- **文件上传(全链路 COS 直传)** — 客户端通过 `GET /api/upload/cos-credentials` 获取 scoped STS 临时凭证后直传腾讯云 COS,后端不接收文件字节、不落本地磁盘
- **统一 API 信封** — 后端 `IResponse<T>` + 前端 `request<T>()` 自动解析,业务码非 2xx 统一抛错
- **测试基线** — Vitest + happy-dom + MSW(单元/集成) + Playwright(E2E,后端)
- **结构化日志** — `backend/lib/logger.ts` 统一 info/warn/error 事件记录
- **统一缓存层** — `backend/lib/cache` 基于 cache-manager:默认进程内内存缓存(零配置),按 env 可切 Redis;已接入分类树 / 标签搜索 / 系统设置 / 微信凭据 / 短信限流,缓存异常自动 fail-open
- **样式分层** — 后端走 Tailwind v4 + shadcn/ui(`@base-ui/react` 基底);客户端走 wot-ui + UnoCSS

## 常用命令速查

| 任务 | 命令 |
| --- | --- |
| 安装后端依赖 | `cd backend && pnpm install` |
| 安装客户端依赖 | `cd frontend_uniapp && pnpm install` |
| 启动后端开发服务器 | `cd backend && pnpm dev` |
| 启动客户端(mp/h5/tt) | `cd frontend_uniapp && pnpm dev:mp` |
| 后端类型检查 | `cd backend && pnpm exec tsc --noEmit` |
| 后端单元/集成测试 | `cd backend && pnpm test` |
| 后端 E2E | `cd backend && pnpm test:e2e` |
| 数据库相关 | `cd backend && pnpm db:up / db:down / db:generate / db:migrate / db:seed / db:reset / db:studio` |
| 代码检查 | `cd backend && pnpm lint` |
| 客户端类型检查 | `cd frontend_uniapp && pnpm type-check` |

## 部署

本仓库已不再提供统一的 Docker 镜像与 CI 工作流。两个子项目需独立构建与部署:

- `backend/`:Next.js 16 standalone 产物在 `backend/.next/standalone/`,部署时复制 standalone/ + `.next/static/` + `public/` 即可启动。
- `frontend_uniapp/`:uni-app 跨端产物按目标平台走 `pnpm build:<plat>`,具体见 [frontend_uniapp/README.md](./frontend_uniapp/README.md)。

### 反向代理参考

仓库根的 [`nginx.conf`](./nginx.conf) 提供了反代参考配置(SSL 终止 + gzip + 静态资产缓存),在需要 HTTPS / 多实例负载均衡时使用。**注意:** 当前 nginx.conf 假设后端与 H5 同源部署(`/` 由 Next.js rewrite 到 H5);若前端 H5 部署在独立域名,需要按实际拓扑调整 `proxy_pass` 与 `location` 规则。

### 数据持久化

所有用户上传文件(头像 / 封面 / 认证材料 / 打卡媒体 / 课程视频)均存储在腾讯云 COS,后端进程与容器不落任何上传文件;持久化只需 PostgreSQL 数据库,无需为上传目录挂载 volume。

### 部署验证清单(同源部署场景)

| 路径 | 期望 | 校验 |
| --- | --- | --- |
| `http://<host>:3000/` | 返回 H5 `index.html`,含 `/static/js/...` | `curl -s http://<host>:3000/ \| grep '/static/js/'` |
| `http://<host>:3000/admin` | 302 → `/login` | `curl -I` |
| `http://<host>:3000/login` | 200,登录页 | `curl -I` |
| `http://<host>:3000/api/auth/sms/send` | POST 返回 `IResponse` JSON | `curl -X POST` |
| 浏览器 Network | `/api/**` 同源无 CORS preflight | DevTools |

## 许可

内部模板项目,未指定开源许可。
