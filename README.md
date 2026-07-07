# 项目介绍

跨端登录与用户中心模板项目,采用 pnpm workspace 管理两个子项目:

| 子项目 | 技术栈 | 说明 |
| --- | --- | --- |
| [`admin/`](./admin) | Next.js 16 · React 19 · Drizzle ORM · PostgreSQL · Auth.js v5 | 后端 API + 管理后台(邮箱/密码、手机短信验证码、微信小程序登录) |
| [`frontend/`](./frontend) | Taro 4 · React 18 · NutUI React Taro · Zustand | 跨端客户端(微信小程序 / H5 / 抖音小程序),对接 `admin/` 提供的 REST API |

## 快速开始

```bash
# 1. 安装根级与所有 workspace 依赖
pnpm install

# 2. 启动数据库(PostgreSQL 16,走 Docker)
cd admin && pnpm db:up

# 3. 数据库迁移 + 种子
pnpm db:generate && pnpm db:migrate && pnpm db:seed

# 4. 启动后端(默认 :3000)
pnpm dev

# 5. 另开终端,启动客户端(微信小程序 / H5 / 抖音)
cd ../frontend && pnpm dev:weapp    # 或 dev:h5 / dev:tt
```

> **pnpm 10+ 提示:** 首次安装若出现 `[ERR_PNPM_IGNORED_BUILDS]`,可运行 `pnpm approve-builds`,或参考根级 `pnpm-workspace.yaml` 的 `allowBuilds` 块手动放行 `@alicloud/openapi-core`、`@nutui/nutui-react-taro`、`@tarojs/cli` 等。

## 仓库结构

```
root_project/
├── admin/                # Next.js 后端 + 管理后台
├── frontend/             # Taro 跨端客户端
├── pnpm-workspace.yaml   # workspace 声明与构建依赖放行
└── README.md             # 本文件
```

## 子项目文档

- 后端 / 管理后台 → [admin/README.md](./admin/README.md) · [admin/AGENTS.md](./admin/AGENTS.md)
- 客户端 → [frontend/README.md](./frontend/README.md) · [frontend/AGENTS.md](./frontend/AGENTS.md)

## 主要特性

- **多端登录** — 邮箱+密码、手机号+短信验证码、微信小程序一键登录(基于 Auth.js v5,统一 `accounts` 表管理用户-登录方式绑定)
- **个人资料管理** — 登录用户可改昵称/邮箱/头像(头像走本地文件上传,落 `public/uploads/<yyyy>/<mm>/<uuid>.<ext>`)
- **通用文件上传** — `POST /api/upload`(本地存储,可换 OSS 驱动),支持 MIME/大小限制
- **统一 API 信封** — 后端 `IResponse<T>` + 前端 `request<T>()` 自动解析,业务码非 2xx 统一抛错
- **测试基线** — Vitest + happy-dom + MSW(单元/集成) + Playwright(E2E)
- **结构化日志** — `lib/logger.ts` 统一 info/warn/error 事件记录
- **样式分层** — 后端走 Tailwind v4 + shadcn/ui(`@base-ui/react` 基底);客户端走 SCSS Modules + 全局主题变量

## 常用命令速查

| 任务 | 命令 |
| --- | --- |
| 安装所有依赖 | `pnpm install` |
| 启动后端开发服务器 | `cd admin && pnpm dev` |
| 启动客户端(weapp/h5/tt) | `cd frontend && pnpm dev:weapp` |
| 后端类型检查 | `cd admin && pnpm exec tsc --noEmit` |
| 后端单元/集成测试 | `cd admin && pnpm test` |
| 后端 E2E | `cd admin && pnpm test:e2e` |
| 数据库相关 | `cd admin && pnpm db:up / db:down / db:generate / db:migrate / db:seed / db:reset / db:studio` |
| 代码检查 | `cd admin && pnpm lint` |

## 部署(Docker)

采用单 Docker 镜像同时托管 `admin` 后端与 `frontend` H5,对外只暴露一个端口,通过路径前缀区分:

| 路径 | 服务 | 说明 |
| --- | --- | --- |
| `/` | H5 | Taro H5 静态产物,生产环境由 `next.config.ts` 的 rewrites 重写到 `public/index.html` |
| `/admin/*` | 后台 | Next.js App Router,`proxy.ts` 鉴权 |
| `/login` | 登录页 | 邮箱密码 / 手机验证码 / 微信小程序登录 |
| `/api/*` | REST API | Auth.js + Drizzle + Postgres |
| `/uploads/*` | 上传文件 | 本地存储,落 `public/uploads/<yyyy>/<mm>/` |
| `/_next/static/*` | Next.js 静态资产 | 带 hash,长缓存 |
| `/static/*` | H5 静态资产 | Taro 编译产物(js/css) |

### 1. 准备环境变量

复制 `admin/.env.example` 为 `admin/.env`,按需修改(见下文「环境变量清单」)。

### 2. 构建镜像

```bash
docker build -t frenqency-circle .
```

多阶段构建:`deps`(装依赖)→ `builder-h5`(Taro 编译 H5)→ `builder-admin`(H5 产物平铺到 `admin/public/` 后 `next build`)→ `runner`(standalone 运行时,约 200-300 MB)。

### 3. 启动数据库

沿用 `admin/docker-compose.yml`(仅含 Postgres):

```bash
cd admin && pnpm db:up && pnpm db:migrate && pnpm db:seed && cd ..
```

### 4. 启动容器

```bash
docker run -d --name frenqency-circle \
  -p 3000:3000 \
  --env-file admin/.env \
  -e DATABASE_URL="postgresql://frenqency:frenqency@host.docker.internal:5432/frenqency_circle" \
  -v frenqency_uploads:/app/public/uploads \
  frenqency-circle
```

> **Linux 注意:** `host.docker.internal` 在 Linux Docker 默认不可用,需加 `--add-host=host.docker.internal:host-gateway`,或直接用宿主机内网 IP / Docker 网络别名。

### 环境变量清单

下表基于 `admin/.env.example`,**必改** 项不填会导致启动失败或功能异常,**可选** 项有合理默认值。

#### 核心配置(必改)

| 变量 | 说明 | 示例 |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串。容器内连宿主机数据库用 `host.docker.internal`,或把 app 与 postgres 放同一 Docker 网络 | `postgresql://frenqency:frenqency@host.docker.internal:5432/frenqency_circle` |
| `AUTH_SECRET` | Auth.js JWT 签名密钥。**必须**用 `openssl rand -base64 32` 生成新值,不能用占位符 | `openssl rand -base64 32` 的输出 |
| `NEXT_PUBLIC_APP_URL` | 上传文件的公开 URL 前缀。生产环境填实际访问域名(含协议) | `https://your-domain.com` |

#### 认证与登录(按需配置)

| 变量 | 说明 | 默认 / 说明 |
| --- | --- | --- |
| `AUTH_TRUST_HOST` | 非 HTTPS 环境信任 Host 头。生产走 HTTPS 可设为 `false` | `true` |
| `PHONE_DOMAIN` | 手机登录用户自动生成邮箱的域名(不影响真实手机号) | `phonedomain.com` |
| `ALIYUN_SMS_ACCESS_KEY_ID` | 阿里云短信 AccessKey。**留空**则走控制台日志输出验证码(开发模式) | 空 = dev fallback |
| `ALIYUN_SMS_ACCESS_KEY_SECRET` | 阿里云短信 Secret | 空 = dev fallback |
| `ALIYUN_SMS_SIGN_NAME` | 短信签名 | 空 = dev fallback |
| `ALIYUN_SMS_TEMPLATE_CODE` | 短信模板 Code | 空 = dev fallback |
| `ALIYUN_SMS_ENDPOINT` | 阿里云短信 API 端点,一般不用改 | `dysmsapi.aliyuncs.com` |
| `WECHAT_MP_APP_ID` | 微信小程序 AppID。如需小程序登录则填 | 空 = 不可用 |
| `WECHAT_MP_APP_SECRET` | 微信小程序 AppSecret | 空 = 不可用 |
| `WECHAT_MP_API_BASE` | 微信 API 基址,一般不用改 | `https://api.weixin.qq.com` |

#### 跨域(可选)

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `CORS_ALLOW_ORIGIN` | `/api/*` 允许的跨域来源。**同源部署**(H5 与 admin 同域)时无需配置;拆分域名时填 H5 域名 | `http://localhost:9000` |

#### 文件上传(可选)

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `UPLOAD_ROOT_DIR` | 上传落盘根目录。容器内建议挂载 volume 后指向(如 `/app/public/uploads`)。绝对路径直接用,相对路径以 `process.cwd()` 为基准 | `<cwd>/public/uploads` |
| `UPLOAD_MAX_BYTES` | 通用场景大小上限(字节) | `104857600`(100 MiB) |
| `UPLOAD_MAX_BYTES_AVATAR` | 头像场景大小上限 | `5242880`(5 MiB) |
| `UPLOAD_ALLOWED_MIME` | 通用场景允许的 MIME 列表(逗号分隔) | 图片 + 文档 + 压缩包 + 视频 + 音频(20 种) |

#### SMS 频率限制(可选)

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `SMS_CODE_TTL_SECONDS` | `300` | 验证码有效期 |
| `SMS_CODE_MAX_ATTEMPTS` | `5` | 单码最大尝试次数 |
| `SMS_RATE_PHONE_COOLDOWN_SECONDS` | `60` | 同手机号发送冷却 |
| `SMS_RATE_PHONE_HOURLY` | `5` | 同手机号每小时上限 |
| `SMS_RATE_IP_HOURLY` | `10` | 同 IP 每小时上限 |

> **注意:** SMS 频率限制基于内存 Map,**非多实例安全**。水平扩展时需替换为 Redis 实现。

### 生产反向代理(可选)

仓库根的 [`nginx.conf`](./nginx.conf) 提供了反代参考配置(SSL 终止 + gzip + 静态资产缓存),不进 Docker 镜像。在需要 HTTPS / 多实例负载均衡时使用:

```nginx
# nginx.conf 关键片段
upstream frenqency_app {
    server app:3000;   # app 容器或 k8s service
    keepalive 16;
}

server {
    listen 443 ssl http2;
    # ssl_certificate     /path/to/cert.pem;
    # ssl_certificate_key /path/to/key.pem;
    client_max_body_size 100m;   # 对齐 UPLOAD_MAX_BYTES

    location /              { proxy_pass http://frenqency_app; }
    location /admin/        { proxy_pass http://frenqency_app; }
    location /api/          { proxy_pass http://frenqency_app; }
    location /_next/static/ { proxy_pass http://frenqency_app; expires 365d; }
    location /uploads/      { proxy_pass http://frenqency_app; expires 7d; }
}
```

### 数据持久化

容器内 `/app/public/uploads` 声明为 Docker volume,上传文件不会随容器销毁丢失。建议挂载 named volume 或宿主机目录:

```bash
# named volume(推荐)
-v frenqency_uploads:/app/public/uploads

# 或宿主机目录绑定
-v /var/data/frenqency/uploads:/app/public/uploads
```

### 部署验证清单

| 路径 | 期望 | 校验 |
| --- | --- | --- |
| `http://<host>:3000/` | 返回 H5 `index.html`,含 `/static/js/...` | `curl -s http://<host>:3000/ \| grep '/static/js/'` |
| `http://<host>:3000/admin` | 302 → `/login` | `curl -I` |
| `http://<host>:3000/login` | 200,登录页 | `curl -I` |
| `http://<host>:3000/api/auth/sms/send` | POST 返回 `IResponse` JSON | `curl -X POST` |
| 浏览器 Network | `/api/**` 同源无 CORS preflight | DevTools |

## 许可

内部模板项目,未指定开源许可。
