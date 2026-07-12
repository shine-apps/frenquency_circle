# syntax=docker/dockerfile:1.7
# =============================================================================
# frenqency_circle 全量镜像:admin (Next.js standalone) + frontend H5 + Drizzle 迁移
# 多阶段构建:frontend-builder → admin-builder → runtime
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: 构建 frontend H5 端静态文件
# 使用 slim (Debian/glibc) 而非 alpine (musl):Taro/swc/esbuild 等原生模块
# 的 lockfile 只含 glibc 变体,alpine 需要 musl 变体但 lockfile 未包含。
# -----------------------------------------------------------------------------
FROM node:24-slim AS frontend-builder

# 启用 corepack(pnpm);slim 已自带 glibc,无需 libc6-compat
RUN corepack enable \
    && corepack prepare pnpm@11.5.1 --activate

WORKDIR /build

# 先复制依赖清单,利用 Docker 层缓存(源码变更不会触发重装)
# pnpm-workspace.yaml 含 allowBuilds 配置,缺少它会触发 ERR_PNPM_IGNORED_BUILDS
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# 复制源码并构建 H5 产物(输出到 dist/)
COPY frontend/ ./
# 直接调用 taro 二进制,避免 pnpm 11 的 ERR_PNPM_IGNORED_BUILDS 拦截
#
# 高德地图 key 通过 BuildKit secret 注入(--mount=type=secret):
#   - 密钥以 .env 文件形式挂载到 /build/.env,仅在此 RUN 步骤可见
#   - config/env.ts 读取 .env → process.env → config/prod.ts defineConstants 内联到 webpack 产物
#   - 密钥不会写入任何镜像层,docker history 不可见
#
# 本地构建:  docker build --secret id=amap_env,src=frontend/.env .
# CI 构建:   通过 build-push-action 的 secrets 输入传递(见 .github/workflows/docker-image.yml)
# 未提供密钥时: 构建仍成功,仅 H5 地图功能不可用(key 为空串)
RUN --mount=type=secret,id=amap_env,target=/build/.env \
    ./node_modules/.bin/taro build --type h5

# -----------------------------------------------------------------------------
# Stage 2: 构建 admin Next.js standalone 产物
# 使用 slim (Debian/glibc),原因同 Stage 1
# -----------------------------------------------------------------------------
FROM node:24-slim AS admin-builder

RUN corepack enable \
    && corepack prepare pnpm@11.5.1 --activate

WORKDIR /build

COPY admin/package.json admin/pnpm-lock.yaml admin/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY admin/ ./

# 直接调用 next 二进制,绕过 pnpm 11 的 ERR_PNPM_IGNORED_BUILDS deps 检查
# (next.config.ts 已配置 output: "standalone",产物在 .next/standalone/)
RUN ./node_modules/.bin/next build

# -----------------------------------------------------------------------------
# Stage 3: 运行时镜像(精简,仅含运行所需文件)
# 必须与 builder 同基础镜像:standalone 里的原生模块(sharp 等)是 glibc 编译的,
# 放到 alpine (musl) 上会无法加载。
# -----------------------------------------------------------------------------
FROM node:24-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

# 创建非 root 用户(Debian 方式);安装 wget 供 healthcheck 使用
RUN groupadd -r nodejs && useradd -r -g nodejs nodejs \
    && apt-get update && apt-get install -y --no-install-recommends wget \
    && rm -rf /var/lib/apt/lists/*

# ---- 1) Next.js standalone 运行时(server.js + 精简 node_modules) ----
COPY --from=admin-builder /build/.next/standalone ./
# standalone 不含 .next/static 与 public,需手动补齐
COPY --from=admin-builder /build/.next/static ./.next/static

# ---- 2) admin public 静态资源(图标 / svg 等) ----
COPY --from=admin-builder /build/public ./public

# ---- 3) frontend H5 静态文件 ----
# 复制到 public/h5/:Next.js 会把 public/ 下的文件映射到 URL 根路径,
# 因此 public/h5/index.html → URL /h5/(Taro prod publicPath 已设为 /h5/)
COPY --from=frontend-builder /build/dist/ ./public/h5/

# ---- 4) Drizzle 迁移文件 + 迁移脚本(容器启动时执行) ----
COPY --from=admin-builder /build/drizzle ./drizzle
COPY --from=admin-builder /build/db/migrate.mjs ./db/migrate.mjs

# ---- 5) 确保 drizzle-orm migrator 子路径可用 ----
# Next.js standalone 追踪可能未包含 drizzle-orm/postgres-js/migrator,
# 从 builder 完整复制 drizzle-orm 与 postgres 两个包(COPY 会解析 pnpm 符号链接)
COPY --from=admin-builder /build/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=admin-builder /build/node_modules/postgres ./node_modules/postgres

# ---- 6) 上传目录(可写,供 LocalDriver 落盘) + 权限 ----
RUN mkdir -p ./public/uploads \
    && chown -R nodejs:nodejs /app

# ---- 7) 启动入口脚本:先迁移,再启动 Next.js ----
RUN printf '%s\n' \
      '#!/bin/sh' \
      'set -e' \
      'echo "[entrypoint] running drizzle migrations..."' \
      'node db/migrate.mjs' \
      'echo "[entrypoint] migrations done, starting Next.js server..."' \
      'exec node server.js' \
    > /entrypoint.sh && chmod +x /entrypoint.sh

# 切换到非 root 用户
USER nodejs

EXPOSE 3000

# 健康检查:探测 /api/health(无需鉴权,返回 200 表示进程存活)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:3000/api/health || exit 1

ENTRYPOINT ["/entrypoint.sh"]
