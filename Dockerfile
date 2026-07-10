# syntax=docker/dockerfile:1.7
# =============================================================================
# frenqency_circle 全量镜像:admin (Next.js standalone) + frontend H5 + Drizzle 迁移
# 多阶段构建:frontend-builder → admin-builder → runtime
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: 构建 frontend H5 端静态文件
# -----------------------------------------------------------------------------
FROM node:24-alpine AS frontend-builder

# musl 兼容 + 启用 corepack(pnpm)
RUN apk add --no-cache libc6-compat \
    && corepack enable \
    && corepack prepare pnpm@11.5.1 --activate

WORKDIR /build

# 先复制依赖清单,利用 Docker 层缓存(源码变更不会触发重装)
# pnpm-workspace.yaml 含 allowBuilds 配置,缺少它会触发 ERR_PNPM_IGNORED_BUILDS
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# 复制源码并构建 H5 产物(输出到 dist/)
COPY frontend/ ./
# 直接调用 taro 二进制,避免 pnpm 11 的 ERR_PNPM_IGNORED_BUILDS 拦截
RUN ./node_modules/.bin/taro build --type h5

# -----------------------------------------------------------------------------
# Stage 2: 构建 admin Next.js standalone 产物
# -----------------------------------------------------------------------------
FROM node:24-alpine AS admin-builder

RUN apk add --no-cache libc6-compat \
    && corepack enable \
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
# -----------------------------------------------------------------------------
FROM node:24-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

WORKDIR /app

# 创建非 root 用户(最佳实践:不以 root 运行应用)
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

# ---- 1) Next.js standalone 运行时(server.js + 精简 node_modules) ----
COPY --from=admin-builder /build/.next/standalone ./
# standalone 不含 .next/static 与 public,需手动补齐
COPY --from=admin-builder /build/.next/static ./.next/static

# ---- 2) admin public 静态资源(图标 / svg 等) ----
COPY --from=admin-builder /build/public ./public

# ---- 3) frontend H5 静态文件 ----
# 需求要求:存放于容器内 /h5/ 路径下
COPY --from=frontend-builder /build/dist /h5
# 同时合并到 Next.js public/,由 next.config.ts 的 rewrite(/ → /index.html)同源托管
COPY --from=frontend-builder /build/dist/ ./public/

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
    && chown -R nodejs:nodejs /app /h5

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

# 健康检查:Next.js 在 / 提供 H5 index.html(200)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:3000/ || exit 1

ENTRYPOINT ["/entrypoint.sh"]
