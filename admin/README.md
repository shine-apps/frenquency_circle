# admin

Next.js 16 后端 + 管理后台,为 `frenqency_circle` 仓库的 `frontend/` 提供 REST API。

## 技术栈

- **Next.js 16.2.9**(App Router + Turbopack)
- **React 19.2.4**
- **Auth.js 5.0.0-beta.31**(多 Credentials Provider + JWT session)
- **Drizzle ORM 0.45.2** + PostgreSQL 16
- **shadcn/ui 4.11.0** + **Tailwind v4** + **`@base-ui/react`**
- **Zod 4.x** / **bcryptjs 3.x** / **Aliyun SMS**
- **Vitest 4** + Testing Library + happy-dom + **MSW 2**
- **Playwright 1.61**(E2E)

## 快速开始

> 本子项目是**独立项目**,依赖与 `frontend/` 不共享,`pnpm install` 仅作用于 `admin/` 目录。

```bash
# 1. 启动 PostgreSQL(走 docker-compose)
pnpm db:up

# 2. 安装依赖
pnpm install

# 3. 复制环境变量并按需修改
cp .env.example .env

# 4. 初始化数据库(生成迁移 / 执行迁移 / 种子)
pnpm db:generate && pnpm db:migrate && pnpm db:seed

# 5. 启动开发服务器
pnpm dev
# 访问 http://localhost:3000
```

## 常用脚本

| 脚本 | 说明 |
| --- | --- |
| `pnpm dev` | 启动开发服务器(Turbopack) |
| `pnpm build` | 生产构建,产物在 `.next/standalone/` |
| `pnpm start` | 启动生产服务器 |
| `pnpm lint` | 运行 ESLint |
| `pnpm test` | 跑 Vitest 单元 + 集成测试 |
| `pnpm test:watch` | Vitest watch 模式 |
| `pnpm test:coverage` | 生成覆盖率报告 |
| `pnpm test:e2e` | 跑 Playwright E2E |
| `pnpm db:up` / `db:down` | 启停 PostgreSQL 容器 |
| `pnpm db:generate` | 由 schema 生成 Drizzle 迁移 |
| `pnpm db:migrate` | 应用迁移 |
| `pnpm db:push` | 直推 schema 到 DB(仅调试) |
| `pnpm db:studio` | 启动 Drizzle Studio |
| `pnpm db:seed` | 跑种子脚本 |
| `pnpm db:reset` | 强制重置 + 重新种子 |

## 目录结构

```
admin/
├── app/                  # Next.js App Router
│   ├── (auth)/login/     # 公共登录页
│   ├── admin/            # 受保护的后台(由 proxy.ts 守卫)
│   └── api/              # REST API 路由
├── components/           # UI 组件(shadcn + 业务组件)
├── db/                   # Drizzle schema + 种子 + 迁移脚本
├── lib/                  # 业务工具 / Auth.js / SMS / Storage
├── tests/                # Vitest 单元/集成 + Playwright E2E
├── types/                # DTO / NextAuth 类型增强
├── auth.config.ts        # Auth.js 共享配置
├── auth.ts               # Auth.js Providers 注册
├── proxy.ts              # Next.js 16 路由守卫(替代 middleware.ts)
├── drizzle.config.ts
├── docker-compose.yml    # 仅含 PostgreSQL 服务
├── next.config.ts
└── package.json
```

## 更多文档

- [AGENTS.md](./AGENTS.md) — 给 AI 编码代理的详细规约(数据层 / API / Auth / SMS / Storage 等)
- 仓库根 [README.md](../README.md) — 总览与两个子项目的协作
