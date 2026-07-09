# syntax=docker/dockerfile:1.7
# ==============================================================================
# 多阶段构建:admin (Next.js 16) + frontend (Taro 4 H5) 单进程部署
# 输出:H5 静态产物平铺到 admin/public/,由 Next.js standalone 统一对外服务
# 路由:/ -> H5 (rewrite 到 /index.html),/admin/* -> 后台,/api/* -> API
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: 依赖准备
# 安装 admin + frontend 全部依赖(含 devDependencies,用于后续构建)
# 注意:使用 slim (Debian/glibc) 而非 alpine (musl),因为 @tarojs/binding
#       4.1.9 未发布 linux-x64-musl 原生包,只有 linux-x64-gnu。
# ------------------------------------------------------------------------------
FROM node:24-slim AS deps
WORKDIR /app

# corepack 启用 pnpm,锁定到与本地一致的具体版本(避免不同时间构建拿到不同 10.x)
RUN corepack enable && corepack prepare pnpm@11.5.1 --activate

# 先只复制 lockfile 与 package.json,最大限度利用 Docker 缓存
COPY pnpm-workspace.yaml pnpm-lock.yaml ./
COPY admin/package.json ./admin/
COPY frontend/package.json ./frontend/

# 预取依赖到 pnpm 离线缓存,再离线安装
RUN pnpm fetch
RUN pnpm install --offline --frozen-lockfile

# ------------------------------------------------------------------------------
# Stage 2: 构建 Taro H5 静态产物
# ------------------------------------------------------------------------------
FROM deps AS builder-h5
WORKDIR /app/frontend

# 利用缓存:仅当 frontend/ 源码变更才重跑此层
COPY frontend/ ./
RUN pnpm -C /app/frontend exec taro build --type h5

# 把产物收集到 /tmp/h5-build/(避免与后续 stage 的工作目录冲突)
RUN mkdir -p /tmp/h5-build && cp -r dist/. /tmp/h5-build/

# ------------------------------------------------------------------------------
# Stage 3: 构建 Next.js admin (standalone 输出)
# 关键:H5 产物必须平铺到 admin/public/,这样 H5 index.html 引用的
#      /static/... 资源才能命中 Next.js 的 public/static/...
# ------------------------------------------------------------------------------
FROM deps AS builder-admin
WORKDIR /app/admin

# 先复制源码(在 H5 复制之前,这样改源码不会触发 H5 重 build)
COPY admin/ ./
# 再覆盖 public/:H5 平铺
COPY --from=builder-h5 /tmp/h5-build/ ./public/

# 构建
# 注意:app/layout.tsx 使用 next/font/google(Geist / Geist_Mono),
#       next build 时会从 Google 下载字体文件,构建机必须能访问外网。
#       离线环境请改用 next/font/local 加载本地字体后再构建。
ENV NEXT_TELEMETRY_DISABLED=1
# 直接调用 next 二进制,绕过 pnpm exec 的依赖状态检查
# (pnpm 11 的 deps check 会因 ERR_PNPM_IGNORED_BUILDS 报错退出)
RUN ./node_modules/.bin/next build

# 显式将迁移脚本依赖的 drizzle-orm / postgres 真实文件(解引用 pnpm 符号链接)
# 放入 standalone/node_modules。
# 原因:next.config.ts 已移除 serverExternalPackages,drizzle-orm / postgres 现在
#   被 Next.js 直接打包进 server chunks(不作为外部依赖保留在 standalone node_modules)。
#   但独立的 db/migrate.mjs 迁移脚本(容器启动时由 entrypoint.sh 调用)仍需从
#   node_modules 中 import 这两个包,因此在此显式复制。
# drizzle-orm 与 postgres 均无运行时 dependencies,复制这两个包即自洽。
RUN mkdir -p .next/standalone/node_modules && \
    cp -rL node_modules/drizzle-orm .next/standalone/node_modules/ && \
    cp -rL node_modules/postgres .next/standalone/node_modules/

# ------------------------------------------------------------------------------
# Stage 4:Runner - 最小化运行时镜像
# 仅保留 standalone 输出 + 静态资源 + 入口脚本
# ------------------------------------------------------------------------------
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# 非 root 用户 + gosu(用于 entrypoint 中降权);wget 用于 healthcheck
RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -s /bin/sh nextjs \
    && apt-get update && apt-get install -y --no-install-recommends gosu wget \
    && rm -rf /var/lib/apt/lists/*

# 复制 standalone 产物(已含 package.json、.next/server、public 快照、traced node_modules)
COPY --from=builder-admin --chown=nextjs:nodejs /app/admin/.next/standalone/ ./
# 复制客户端静态资源(standalone 不含)
COPY --from=builder-admin --chown=nextjs:nodejs /app/admin/.next/static/ ./.next/static/
# 显式覆盖 public(确保 H5 一定在)
COPY --from=builder-admin --chown=nextjs:nodejs /app/admin/public/ ./public/

# 复制数据库迁移脚本与迁移 SQL
# 迁移由 entrypoint.sh 在容器启动时执行,而非构建阶段
# drizzle-orm / postgres 已在 builder-admin 阶段被显式解引用复制进
# standalone/node_modules(见上方 cp -rL 步骤),随 standalone COPY 一起落到 /app/node_modules
COPY --from=builder-admin --chown=nextjs:nodejs /app/admin/db/migrate.mjs ./db/migrate.mjs
COPY --from=builder-admin --chown=nextjs:nodejs /app/admin/drizzle ./drizzle

# 入口脚本
COPY --chown=nextjs:nodejs entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# 上传目录(volume 挂载点,容器销毁不丢文件)
RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public/uploads
VOLUME /app/public/uploads

# 不在此处设 USER nextjs — entrypoint.sh 以 root 启动,chown 挂载卷后用 gosu 降权
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/auth/me || exit 1

CMD ["sh", "/app/entrypoint.sh"]
