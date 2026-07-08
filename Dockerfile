# syntax=docker/dockerfile:1.7
# ==============================================================================
# 多阶段构建:admin (Next.js 16) + frontend (Taro 4 H5) 单进程部署
# 输出:H5 静态产物平铺到 admin/public/,由 Next.js standalone 统一对外服务
# 路由:/ -> H5 (rewrite 到 /index.html),/admin/* -> 后台,/api/* -> API
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: 依赖准备
# 安装 admin + frontend 全部依赖(含 devDependencies,用于后续构建)
# ------------------------------------------------------------------------------
FROM node:24-alpine AS deps
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
RUN pnpm run build:h5

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
RUN pnpm exec next build

# ------------------------------------------------------------------------------
# Stage 4: Runner - 最小化运行时镜像
# 仅保留 standalone 输出 + 静态资源 + 入口脚本
# ------------------------------------------------------------------------------
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# 非 root 用户 + su-exec(用于 entrypoint 中降权)
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001 \
    && apk add --no-cache su-exec

# 复制 standalone 产物(已含 package.json、.next/server、public 快照、traced node_modules)
COPY --from=builder-admin --chown=nextjs:nodejs /app/admin/.next/standalone/ ./
# 复制客户端静态资源(standalone 不含)
COPY --from=builder-admin --chown=nextjs:nodejs /app/admin/.next/static/ ./.next/static/
# 显式覆盖 public(确保 H5 一定在)
COPY --from=builder-admin --chown=nextjs:nodejs /app/admin/public/ ./public/

# 入口脚本
COPY --chown=nextjs:nodejs entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# 上传目录(volume 挂载点,容器销毁不丢文件)
RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public/uploads
VOLUME /app/public/uploads

# 不在此处设 USER nextjs — entrypoint.sh 以 root 启动,chown 挂载卷后用 su-exec 降权
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/auth/me || exit 1

CMD ["sh", "/app/entrypoint.sh"]
