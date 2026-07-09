# 项目介绍

本仓库包含两个**完全独立**的子项目,各自维护自己的依赖、构建与部署流程:

| 子项目 | 技术栈 | 说明 |
| --- | --- | --- |
| [`admin/`](./admin) | Next.js 16 · React 19 · Drizzle ORM · PostgreSQL · Auth.js v5 | 后端 API + 管理后台(邮箱/密码、手机短信验证码、微信小程序登录) |
| [`frontend/`](./frontend) | Taro 4 · React 18 · NutUI React Taro · Zustand | 跨端客户端(微信小程序 / H5 / 抖音小程序),对接 `admin/` 提供的 REST API |

> 两个子项目之间**不共享** `node_modules` / lockfile / pnpm workspace,需要分别安装、运行、构建与测试。

## 快速开始

```bash
# 1. 启动后端依赖的数据库(PostgreSQL 16,走 Docker)
cd admin && pnpm db:up

# 2. 安装后端依赖并初始化数据库
cd admin
pnpm install
pnpm db:generate && pnpm db:migrate && pnpm db:seed

# 3. 启动后端(默认 :3000)
pnpm dev

# 4. 另开终端,安装并启动客户端(微信小程序 / H5 / 抖音)
cd ../frontend
pnpm install
pnpm dev:weapp    # 或 dev:h5 / dev:tt
```

> **pnpm 10+ 提示:** 首次安装若出现 `[ERR_PNPM_IGNORED_BUILDS]`,可在各自子项目内运行 `pnpm approve-builds` 放行 `@alicloud/openapi-core`、`@nutui/nutui-react-taro`、`@tarojs/cli` 等构建依赖。

## 仓库结构

```
root/
├── admin/                # Next.js 后端 + 管理后台(独立项目)
├── frontend/             # Taro 跨端客户端(独立项目)
├── docs/                 # 产品 PRD 与功能设计文档(共用)
├── nginx.conf            # 生产环境反向代理参考配置(共用)
├── .gitignore            # 覆盖两个子项目的忽略规则
└── README.md             # 本文件
```

> 已移除的内容:根 `pnpm-workspace.yaml` / 共享 `pnpm-lock.yaml` / `Dockerfile` / `.dockerignore` / `.github/workflows/`。两个子项目独立维护各自的部署脚本。

## 子项目文档

- 后端 / 管理后台 → [admin/README.md](./admin/README.md) · [admin/AGENTS.md](./admin/AGENTS.md)
- 客户端 → [frontend/README.md](./frontend/README.md) · [frontend/AGENTS.md](./frontend/AGENTS.md)

## 主要特性

- **多端登录** — 邮箱+密码、手机号+短信验证码、微信小程序一键登录(基于 Auth.js v5,统一 `accounts` 表管理用户-登录方式绑定)
- **个人资料管理** — 登录用户可改昵称/邮箱/头像(头像走本地文件上传,落 `admin/public/uploads/<yyyy>/<mm>/<uuid>.<ext>`)
- **通用文件上传** — `POST /api/upload`(本地存储,可换 OSS 驱动),支持 MIME/大小限制
- **统一 API 信封** — 后端 `IResponse<T>` + 前端 `request<T>()` 自动解析,业务码非 2xx 统一抛错
- **测试基线** — Vitest + happy-dom + MSW(单元/集成) + Playwright(E2E,后端)
- **结构化日志** — `admin/lib/logger.ts` 统一 info/warn/error 事件记录
- **样式分层** — 后端走 Tailwind v4 + shadcn/ui(`@base-ui/react` 基底);客户端走 SCSS Modules + 全局主题变量

## 常用命令速查

| 任务 | 命令 |
| --- | --- |
| 安装后端依赖 | `cd admin && pnpm install` |
| 安装客户端依赖 | `cd frontend && pnpm install` |
| 启动后端开发服务器 | `cd admin && pnpm dev` |
| 启动客户端(weapp/h5/tt) | `cd frontend && pnpm dev:weapp` |
| 后端类型检查 | `cd admin && pnpm exec tsc --noEmit` |
| 后端单元/集成测试 | `cd admin && pnpm test` |
| 后端 E2E | `cd admin && pnpm test:e2e` |
| 数据库相关 | `cd admin && pnpm db:up / db:down / db:generate / db:migrate / db:seed / db:reset / db:studio` |
| 代码检查 | `cd admin && pnpm lint` |
| 客户端类型检查 | `cd frontend && pnpm exec tsc --noEmit` |

## 部署

本仓库已不再提供统一的 Docker 镜像与 CI 工作流。两个子项目需独立构建与部署:

- `admin/`:Next.js 16 standalone 产物在 `admin/.next/standalone/`,部署时复制 standalone/ + `.next/static/` + `public/` 即可启动。
- `frontend/`:Taro 跨端产物按目标平台走 `pnpm build:<plat>`,具体见 [frontend/README.md](./frontend/README.md)。

### 反向代理参考

仓库根的 [`nginx.conf`](./nginx.conf) 提供了反代参考配置(SSL 终止 + gzip + 静态资产缓存),在需要 HTTPS / 多实例负载均衡时使用。**注意:** 当前 nginx.conf 假设后端与 H5 同源部署(`/` 由 Next.js rewrite 到 H5);若前端 H5 部署在独立域名,需要按实际拓扑调整 `proxy_pass` 与 `location` 规则。

### 数据持久化

`admin/public/uploads/` 目录承载用户上传文件,部署到生产时需要单独持久化(挂载 volume / 绑定宿主机目录 / 切换到 OSS 驱动)。

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
