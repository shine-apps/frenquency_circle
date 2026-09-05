# syntax=docker/dockerfile:1.7
# =============================================================================
# frenqency_circle 镜像:admin (Next.js standalone) + Drizzle 迁移 + frontend_uniapp H5
# 两阶段构建:admin-builder → runtime
# - admin-builder:构建 Next.js standalone 产物
# - runtime:聚合 admin 产物与 H5 静态资源,使 H5 与 admin 同源部署(资源 base 为 /ui/)
#
# 注意:H5 静态产物(frontend_uniapp build:h5)不在本镜像内构建,
# 而是由 GitHub CI(docker-image.yml)预先构建并复制到 frontend_uniapp/h5-dist/,
# 本文件仅将其 COPY 进镜像。本地构建前需先:
#   cd frontend_uniapp && pnpm install --frozen-lockfile --no-scripts && pnpm build:h5
#   cp -r dist/build/h5 h5-dist
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: 构建 admin Next.js standalone 产物
# 使用 slim (Debian/glibc),原因:Next.js standalone 里的原生模块(sharp 等)
# 是 glibc 编译的,放到 alpine (musl) 上会无法加载。
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
# Stage 2: 运行时镜像(精简,仅含运行所需文件)
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

# ---- 2.5) H5 前端产物(frontend_uniapp build:h5),同源部署在 /ui ----
# 产物由 GitHub CI 预先构建并复制到 frontend_uniapp/h5-dist/(见文件头部说明),
# 资源 base 为 /ui/(CI 构建时注入 VITE_APP_PUBLIC_BASE),
# 故静态文件经 /ui/static/... 由本容器同源提供。
COPY frontend_uniapp/h5-dist ./public/ui

# ---- 3) Drizzle 迁移文件 + 迁移脚本(容器启动时执行) ----
COPY --from=admin-builder /build/drizzle ./drizzle
COPY --from=admin-builder /build/db/migrate.mjs ./db/migrate.mjs

# ---- 4) 确保 drizzle-orm migrator 子路径可用 ----
# Next.js standalone 追踪可能未包含 drizzle-orm/postgres-js/migrator,
# 从 builder 完整复制 drizzle-orm 与 postgres 两个包(COPY 会解析 pnpm 符号链接)
COPY --from=admin-builder /build/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=admin-builder /build/node_modules/postgres ./node_modules/postgres

# ---- 5) 上传目录(可写,供 LocalDriver 落盘) + 权限 ----
RUN mkdir -p ./public/uploads \
    && chown -R nodejs:nodejs /app

# ---- 6) 启动入口脚本:先迁移,再启动 Next.js ----
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
