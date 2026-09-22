# admin

Next.js 16 后端 + 管理后台,为 `frenqency_circle` 仓库的 `frontend_uniapp/` 提供 REST API。

## 技术栈

- **Next.js 16.2.9**(App Router + Turbopack)
- **React 19.2.4**
- **Auth.js 5.0.0-beta.31**(多 Credentials Provider + JWT session)
- **Drizzle ORM 0.45.2** + PostgreSQL 16
- **shadcn/ui 4.11.0** + **Tailwind v4** + **`@base-ui/react`**
- **Zod 4.x** / **bcryptjs 3.x** / **Aliyun SMS**
- **cache-manager 7**(默认进程内内存缓存,可选 `@keyv/redis`)
- **Vitest 4** + Testing Library + happy-dom + **MSW 2**
- **Playwright 1.61**(E2E)

## 快速开始

> 本子项目是**独立项目**,依赖与 `frontend_uniapp/` 不共享,`pnpm install` 仅作用于 `backend/` 目录。

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

## 缓存

后端内置统一缓存层(`lib/cache/`),基于 **cache-manager 7**,业务代码只依赖 `CacheStore` 抽象,不直接依赖具体驱动。

- **默认使用进程内内存缓存**:**无需任何配置、无需额外服务**,`pnpm dev` 即可生效;
- **可选切换 Redis**:设置 `CACHE_DRIVER=redis` + `REDIS_URL` 即切换到 `@keyv/redis`;未配置 / 未安装 / 初始化失败时自动回退内存并输出 `[CACHE]` 告警,业务无感;
- **fail-open**:缓存读写异常仅告警并回源数据库 / 外部接口,不影响接口可用性。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `CACHE_DRIVER` | 按 `REDIS_URL` 自动推断,否则 `memory` | `memory` = 进程内内存;`redis` = 共享 Redis |
| `REDIS_URL` | 空 | Redis 连接串,如 `redis://localhost:6379` |
| `CACHE_KEY_PREFIX` | `qlq` | 缓存 key 统一前缀(多应用 / 多环境共用 Redis 时用于隔离) |
| `CACHE_KEY_SALT` | 回退 `AUTH_SECRET` | 限流 key 中手机号 / IP 的加盐哈希(避免明文 PII 落入 Redis) |

### 已接入的缓存点

| 数据 | TTL | 失效策略 |
| --- | --- | --- |
| 分类树(`category:tree`) | 10 分钟 | 分类增删改后立即失效 |
| 公开分类树(`category:public`,分类 + approved 标签) | 10 分钟 | 分类 / 标签增删改后立即失效 |
| 标签搜索(`tagsearch:{query}:{limit}`) | 60 秒 | 短 TTL 自然过期(不做前缀删除) |
| 系统设置全量(`settings:all`) | 60 秒 | 管理员 `PATCH /api/admin/settings` 后立即失效 |
| 微信小程序 `access_token` / 公众号 `jsapi_ticket` | 微信返回有效期 − 5 分钟 | 到期自动过期 |
| 短信验证码限流(`ratelimit:*`,内存原子原语 / Redis Lua) | 冷却 60s、小时窗口 1h | 到期自动 / 验证成功后清除 |

> **注意**
>
> - 内存缓存是**进程本地**的:多实例部署时各实例各自缓存、各自限流;需要全局一致时把 `CACHE_DRIVER` 切到 `redis`。
> - 内容审核开关(`contentModerationEnabled`)**故意不走缓存**,每次送审直读数据库,保证合规门禁立即生效。
> - Redis 不可用时读 / 写走 30 秒降级窗口(跳过网络直接回源),失效操作仍会尝试,避免写后的旧数据滞留到 TTL 过期。

## 目录结构

```
backend/
├── app/                  # Next.js App Router
│   ├── (auth)/login/     # 公共登录页
│   ├── admin/            # 受保护的后台(由 proxy.ts 守卫)
│   └── api/              # REST API 路由
├── components/           # UI 组件(shadcn + 业务组件)
├── db/                   # Drizzle schema + 种子 + 迁移脚本
├── lib/                  # 业务工具 / Auth.js / SMS / 缓存(lib/cache)
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
