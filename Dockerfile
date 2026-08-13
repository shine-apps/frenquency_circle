# syntax=docker/dockerfile:1.7
# =============================================================================
# frenqency_circle 镜像:admin (Next.js standalone) + Drizzle 迁移 + frontend_uniapp H5
# 三阶段构建:admin-builder → frontend-builder → runtime
# - admin-builder:构建 Next.js standalone 产物
# - frontend-builder:构建 frontend_uniapp H5 产物(uni build),落入 runtime 的 /public/ui
# - runtime:聚合两者,使 H5 与 admin 同源部署(资源 base 为 /ui/)
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
# Stage 2: 构建 frontend_uniapp H5 产物(uni build)
# 独立项目(独立 lockfile / node_modules),单独安装依赖并构建,避免污染 admin 阶段。
# 构建前将 VITE_APP_PUBLIC_BASE 强制写为 /ui/:
#   - vite.config.ts 的 base 以 /ui/ 为根加载静态资源(/ui/static/...)
#   - manifest.config.ts 的 h5.router.base 同样设为 /ui/,路由 base 与部署目录一致
# 产物落在 dist/build/h5,后续由 runtime 阶段复制到 /public/ui 实现同源部署。
# -----------------------------------------------------------------------------
FROM node:24-slim AS frontend-builder

# 与 admin-builder 统一 pnpm(脚本 preinstall 强制 only-allow pnpm)
RUN corepack enable \
    && corepack prepare pnpm@11.5.1 --activate

WORKDIR /build

# 仅先复制依赖清单,最大化 Docker 层缓存
COPY frontend_uniapp/package.json frontend_uniapp/pnpm-lock.yaml ./

# CI=true:跳过 husky 初始化,但保留 prepare 中的 init-baseFiles
# (该脚本生成 src/manifest.json / src/pages.json,构建所必需)
ENV CI=true
RUN pnpm install --frozen-lockfile

# 复制源码(含 env/ 目录,见 .dockerignore 中对前端 env 的例外)
COPY frontend_uniapp/ ./

# 生产 API 地址:默认空串 = 同源部署(H5 请求相对路径 /api/* 直达本容器)
# 如需独立 API 域名,构建时传 --build-arg VITE_SERVER_BASEURL=https://api.example.com
ARG VITE_SERVER_BASEURL=

# 构建前强制注入构建期环境变量(.env.production 优先级高于 .env):
#   VITE_APP_PUBLIC_BASE=/ui/   静态资源与路由 base
#   VITE_SERVER_BASEURL=        生产 API 地址(默认同源)
RUN grep -q '^VITE_APP_PUBLIC_BASE=' env/.env.production \
    && sed -i 's|^VITE_APP_PUBLIC_BASE=.*|VITE_APP_PUBLIC_BASE=/ui/|' env/.env.production \
    || printf 'VITE_APP_PUBLIC_BASE=/ui/\n' >> env/.env.production \
 && (grep -q '^VITE_SERVER_BASEURL=' env/.env.production \
     && sed -i "s|^VITE_SERVER_BASEURL=.*|VITE_SERVER_BASEURL=$VITE_SERVER_BASEURL|" env/.env.production \
     || printf 'VITE_SERVER_BASEURL=%s\n' "$VITE_SERVER_BASEURL" >> env/.env.production)

RUN pnpm build:h5

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

# ---- 2.5) H5 前端产物(frontend_uniapp build:h5),同源部署在 /ui ----
# 资源 base 为 /ui/(见 frontend-builder 阶段 VITE_APP_PUBLIC_BASE),
# 故静态文件经 /ui/static/... 由本容器同源提供。
COPY --from=frontend-builder /build/dist/build/h5 ./public/ui

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
