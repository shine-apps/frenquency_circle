# AGENTS.md

Guidance for AI coding agents working in this repository. All paths are relative to the **project root** (the directory containing this file).

## Project overview

A full-stack Next.js 16 application providing:

- Admin dashboard UI under `/admin/*` (login-gated)
- REST API under `/api/*` (mixed public + admin-gated)
- Drizzle ORM + PostgreSQL data layer
- Auth.js (NextAuth v5) multi-provider authentication:
  - **Credentials** — email + password
  - **Phone** — SMS verification code (Aliyun SMS or console fallback)
  - Future extension point for OAuth providers (Google/GitHub/etc.)
- shadcn/ui (base-nova style on `@base-ui/react`) + Tailwind v4 interface

## Quick reference

| Task | Command |
|---|---|
| Dev server | `pnpm dev` |
| Production build | `pnpm build` |
| Lint | `pnpm lint` |
| Unit + integration tests | `pnpm test` |
| E2E tests | `pnpm test:e2e` |
| Start Postgres (Docker) | `pnpm db:up` |
| Generate migration | `pnpm db:generate` |
| Apply migration | `pnpm db:migrate` |
| Reset DB + seed | `pnpm db:reset` |
| Drizzle Studio | `pnpm db:studio` |

All commands run from the project root with no `cd` needed.

> **pnpm gotcha:** if `pnpm <script>` exits non-zero before reaching the script (e.g. `[ERR_PNPM_IGNORED_BUILDS]` for `@alicloud/openapi-core`), bypass the wrapper and run the binary directly:
> ```powershell
> node node_modules/drizzle-kit/bin.cjs generate
> node node_modules/eslint/bin/eslint.js .
> node node_modules/vitest/vitest.mjs run
> node node_modules/next/dist/bin/next build
> ```

## Tech stack

- **Next.js 16.2.9** (App Router, Turbopack). `middleware.ts` is deprecated — use `proxy.ts`.
- **React 19.2.4** with strict `react-hooks/set-state-in-effect` lint rule.
- **Auth.js 5.0.0-beta.31** with multiple Credentials Providers + JWT sessions.
- **Drizzle ORM 0.45.2** with `postgres` driver; schema lives in `db/schema.ts`.
- **shadcn/ui 4.11.0** on **Tailwind v4** (CSS variables in `app/globals.css`). Uses **`@base-ui/react`** primitives (not Radix).
- **Zod 4.x** for request validation and form input.
- **bcryptjs 3.x** for password hashing and SMS code hashing.
- **Aliyun SMS** via `@alicloud/dysmsapi20170525` + `@alicloud/openapi-client` (lazy fallback to console logger when `ALIYUN_SMS_ACCESS_KEY_ID` is empty).
- **Vitest 4.1.9** + Testing Library + happy-dom + **MSW 2** for unit/integration.
- **Playwright 1.61** for end-to-end tests.

## Project structure

```
.
├── app/                              # Next.js App Router
│   ├── (auth)/login/                 # Public login route
│   │   ├── page.tsx                  # Server shell wrapping Suspense
│   │   ├── login-tabs.tsx            # Tabs container (email / phone)
│   │   ├── login-form.tsx            # Email+password client form
│   │   └── phone-login-form.tsx      # Phone+code client form (60s countdown)
│   ├── admin/                        # Protected area (see proxy.ts)
│   │   ├── layout.tsx                # Sidebar + top bar
│   │   ├── page.tsx                  # Dashboard
│   │   └── users/                    # User list
│   │       ├── page.tsx              # Server: fetch → DTO
│   │       └── _components/users-table.tsx
│   ├── api/                          # Route handlers
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── auth/sms/send/route.ts    # POST: issue+send SMS code (rate-limited)
│   │   ├── users/route.ts            # GET (paged) / POST
│   │   └── users/[id]/route.ts       # GET / PATCH / DELETE
│   ├── layout.tsx                    # Root layout, mounts <Toaster />
│   └── page.tsx                      # Redirects to /admin or /login
├── components/
│   ├── ui/                           # shadcn primitives (do not edit semantics)
│   ├── app-sidebar.tsx               # Admin sidebar
│   ├── sign-out-button.tsx           # signOut() trigger
│   └── stat-card.tsx                 # Dashboard card
├── db/
│   ├── schema.ts                     # Drizzle tables (users, accounts, smsVerificationCodes)
│   └── seed.ts                       # Seed script
├── lib/
│   ├── db.ts                         # Drizzle singleton (dev globalThis cache)
│   ├── api.ts                        # ok() / fail() / parsePagination()
│   ├── auth-utils.ts                 # requireAdmin() / requireSession()
│   ├── logger.ts                     # Structured logger (info/warn/error + LOG_PREFIX)
│   ├── utils.ts                      # cn() and other shadcn helpers
│   ├── auth/
│   │   └── account-service.ts        # findUserByAccount / linkAccount / findOrCreateUserAndLinkAccount
│   ├── sms/
│   │   ├── phone.ts                  # PHONE_RE / normalizePhone / isValidPhone / phoneToEmail / generateCode
│   │   ├── phone-code-service.ts     # issueCode / verifyCode (bcrypt-hashed, TTL, attempt cap)
│   │   ├── rate-limit.ts             # In-memory Map limiter (phone cooldown+hourly, IP hourly)
│   │   ├── sms-sender.ts             # SmsSender interface + ConsoleSmsSender fallback + factory
│   │   └── aliyun-sms.ts             # AliyunSmsSender (lazy client)
│   │   └── wechat/
│   │       └── miniprogram.ts            # 微信小程序 code2Session / access_token / getPhoneNumber
│   └── storage/
│       ├── types.ts                      # StorageDriver 抽象接口
│       └── local.ts                      # 本地文件系统驱动(public/uploads/<yyyy>/<mm>/<uuid>.<ext>)
├── types/
│   ├── api.ts                        # DTOs and Paginated<T>
│   └── next-auth.d.ts                # Session/User/JWT augmentation (id, role, provider)
├── hooks/use-mobile.ts               # shadcn hook (do not edit)
├── proxy.ts                          # Auth.js route guard
├── auth.config.ts                    # NextAuth shared config (callbacks transfer id/role/provider)
├── auth.ts                           # NextAuth + 3 Credentials providers (credentials/phone/wechat-miniprogram) + OAuth extension point
├── drizzle.config.ts
├── docker-compose.yml                # Postgres 16
├── vitest.config.ts
├── playwright.config.ts
└── tests/
    ├── setup.ts                      # jest-dom + MSW lifecycle
    ├── msw/{handlers.ts,server.ts}   # MSW fixtures (incl. /api/auth/sms/send)
    ├── unit/
    │   ├── db/schema.test.ts
    │   ├── auth-config.test.ts       # jwt/session callbacks
    │   └── lib/
    │       ├── api.test.ts
    │       ├── logger.test.ts
    │       ├── auth/account-service.test.ts
    │       ├── sms/{phone.test.ts, rate-limit.test.ts}
    │       └── wechat/miniprogram.test.ts
    ├── integration/
    │   ├── api/auth/sms-send.test.ts              # MSW-backed, relative URLs
    │   └── api/auth/wechat-miniprogram-login.test.ts  # vi.mock @/auth, direct POST invocation
    └── e2e/auth.spec.ts
```

## Code style

- **TypeScript strict mode.** No `any`; use `unknown` + narrowing. No `enum`; use `as const` literal unions. Prefer `import type` for type-only imports.
- **Server components by default.** Add `"use client"` only when the component uses:
  - React hooks (`useState`, `useEffect`, `useTransition`, etc.)
  - Browser APIs (`window`, `document`)
  - `next/navigation` client APIs (`useRouter`, `usePathname`, `useSearchParams`)
  - `next-auth/react` (`signIn`, `signOut`)
- **File names:** kebab-case. Component subdirectories that are route-private start with `_` (e.g. `_components/`).
- **Route groups:** use `(name)/` to group routes without affecting URLs.
- **Styling:** Tailwind v4 utilities; use CSS variable colors (`bg-primary`, `text-muted-foreground`); no hardcoded colors. Use `cn()` to merge classes; `className` is the last prop on shadcn components.
- **Do not import `db` in client components.** All database access must be in server components, route handlers, or seed scripts.
- **Comments in source files use Chinese** to match the rest of the codebase.

## Data layer

- **Schema** lives only in `db/schema.ts`. Column names are `snake_case`; field names are `camelCase`. Primary keys are `uuid().defaultRandom()`. Timestamps use `timestamp({ withTimezone: true }).notNull().defaultNow()`.
- **Tables:**
  - `users` — id, email (unique), name, passwordHash, role, avatarUrl, createdAt, updatedAt
  - `accounts` — id, userId (FK → users, cascade delete), provider, providerAccountId, type, createdAt, updatedAt. Unique index on `(provider, providerAccountId)`; index on `userId`.
  - `smsVerificationCodes` — id, phone, codeHash (bcrypt), attempts, expiresAt, consumedAt, createdAt. Index on `phone`.
- **Client:** always import from `@/lib/db`. Run independent queries in parallel with `Promise.all`.
- **Migrations:** after editing schema, run `pnpm db:generate`, review the generated SQL in `drizzle/`, then `pnpm db:migrate`. Use `pnpm db:push` only for throwaway debugging.
- **DTOs:** never return raw rows from API handlers. Convert via a local `toDTO()` function and strip sensitive fields (e.g. `passwordHash`).

## API conventions

- **Response helpers** from `@/lib/api`: `ok(data, init?)` for success, `fail(status, message, details?)` for errors. Both produce `IResponse<T>` envelopes with `code` / `data` / `message` / optional `details`.
- **Auth:** every mutating handler must call `requireAdmin()` first; return `guard.response` on failure. Reads under `/api/users` require admin.
- **Validation:** parse request bodies with zod's `safeParse`. On failure return `fail(400, "Invalid request body", parsed.error.flatten())`.
- **Pagination:** use `parsePagination(req.nextUrl.searchParams)` from `@/lib/api`. Defaults to `{ page: 1, pageSize: 20 }`; `pageSize` capped at 100.
- **Route params:** in Next.js 16, `params` is a `Promise`. Always `await context.params`:

  ```ts
  type RouteContext = { params: Promise<{ id: string }> }
  export async function GET(_req: Request, context: RouteContext) {
    const { id } = await context.params
    // ...
  }
  ```

- **SMS send endpoint** (`POST /api/auth/sms/send`): public, rate-limited. Response body is `IResponse<null>` with `message: "验证码已发送"` and HTTP 201. Does **not** leak whether the phone is registered (anti-enumeration). Failure responses: 400 (invalid phone), 429 (rate limit, Chinese message), 500 (issue failed), 502 (SMS provider failed — no rollback of issued code).
- **WeChat mini-program login endpoint** (`POST /api/auth/wechat-miniprogram/login`): public (微信小程序客户端调用),body `{ code, phoneCode }`(对应 `wx.login()` 的 js_code 与 getPhoneNumber 按钮的 phone_code)。内部调用 `signIn("wechat-miniprogram", { ..., redirect: false })`,Auth.js 自动写 session cookie。成功响应 `IResponse<{ provider: "wechat-miniprogram" }>` HTTP 200;失败 400 (参数缺失) / 401 (登录失败) / 500 (内部异常)。
- **File upload endpoint** (`POST /api/upload`): 登录用户可调,接收 `multipart/form-data`,字段 `file` (必填) 与 `purpose` (可选,`'avatar' | 'generic'`,默认 `generic`)。鉴权用 `readUserFromToken`(同 `/api/auth/me`)。MIME 与大小限制走 env:`UPLOAD_MAX_BYTES`(默认 5 MiB) / `UPLOAD_ALLOWED_MIME`(默认 `image/jpeg,image/png,image/webp,image/gif`)。文件落到 `public/uploads/<yyyy>/<mm>/<uuid>.<ext>`,Next.js 自动以 `/uploads/...` 暴露,公开 URL 用 env `NEXT_PUBLIC_APP_URL` 拼接。失败 400 (无 file / purpose 非法) / 401 (未登录) / 413 (超限) / 415 (MIME 非法) / 500 (落盘失败)。响应体 `IResponse<UploadResult>`,其中 `key` 为相对路径(用于将来切换 OSS 驱动时做删除)。

## Authentication

- **`auth.config.ts`** holds the framework-agnostic config (pages, `authorized` callback, `jwt` / `session` callbacks). The `jwt` callback transfers `id`, `role`, and `provider` from `user`/`account` into the token; the `session` callback copies them onto `session.user`.
- **`auth.ts`** registers three Credentials providers plus an OAuth extension point (commented):
  - `id: "credentials"` — email + password. Looks up user via `findUserByAccount` first, falls back to `users` table by email (backward compat for seed users without an `accounts` row). On success, calls `linkAccount` to backfill the binding.
  - `id: "phone"` — phone + 6-digit code. Calls `verifyCode`, resets phone rate limit, then `findOrCreateUserAndLinkAccount` (auto-creates user with unusable `passwordHash` so phone users can never log in via email/password).
  - `id: "wechat-miniprogram"` — 微信小程序手机号登录。`authorize` 接收 `{ code, phoneCode }`,调用 `code2Session` + `getPhoneNumber` 拿真实手机号,按手机号绑定到 user。客户端必须经由 `POST /api/auth/wechat-miniprogram/login` 路由(服务端调用 `signIn`),不能从 admin Web 走 `signIn`。
  - OAuth extension point: documented inline. Future OAuth providers will need to handle `events.createUser` / `events.linkAccount` manually since this project does **not** use `@auth/drizzle-adapter` (kept minimal — only `accounts` table, no `sessions` / `verificationTokens`).
- **`lib/auth/account-service.ts`** centralizes user/account lifecycle: `findUserByAccount`, `linkAccount` (idempotent upsert), `findOrCreateUserAndLinkAccount`. All providers should go through these helpers — do not write raw `db.insert(users)` / `db.insert(accounts)` in `authorize`.
- **`proxy.ts`** exports `auth as proxy`. Do not create a `middleware.ts` — it is removed in Next.js 16. The `authorized` callback in `auth.config.ts` gates `/admin/:path*`.
- **Type augmentations** live in `types/next-auth.d.ts`. When adding a new session field, update the `jwt` and `session` callbacks in `auth.config.ts` in the same change.
- **`PROVIDER_CREDENTIALS` / `PROVIDER_PHONE` / `PROVIDER_WECHAT_MP`** constants live in `auth.ts`. Use these instead of string literals when calling `signIn("phone", ...)` etc.

### SMS subsystem

- **`lib/sms/phone.ts`** — pure helpers. `PHONE_RE = /^1[3-9]\d{9}$/`, `normalizePhone` (strips `+86` / `0086` / `86` / whitespace), `isValidPhone`, `phoneToEmail` (`${phone}@${PHONE_DOMAIN ?? "phonedomain.com"}`), `generateCode` (6-digit via `crypto.randomInt`).
- **`lib/sms/phone-code-service.ts`** — `issueCode(phone)` generates + bcrypt-hashes + persists a code with TTL (default 300s). `verifyCode(phone, code)` returns a `VerifyResult` union: `ok | not_found | expired | max_attempts | mismatch`. Successful verify marks `consumedAt = now`; mismatch increments `attempts`; `attempts >= 5` blocks further tries.
- **`lib/sms/rate-limit.ts`** — in-memory `Map`-based limiter. `checkAndConsumePhone` (60s cooldown + 5/hr cap), `checkAndConsumeIp` (10/hr cap). Env-tunable via `SMS_RATE_PHONE_COOLDOWN_SECONDS` / `SMS_RATE_PHONE_HOURLY` / `SMS_RATE_IP_HOURLY`. **Not multi-instance safe** — swap for Redis if scaling horizontally.
- **`lib/sms/sms-sender.ts`** — `SmsSender` interface + `ConsoleSmsSender` (dev fallback) + `createSmsSender()` factory. Cached singleton.
- **`lib/sms/aliyun-sms.ts`** — `AliyunSmsSender` with lazy client init. Sends via `client.sendSms(req)` with `templateParam: JSON.stringify({ code })`.

### Storage subsystem

- **`lib/storage/types.ts`** — `StorageDriver` 抽象接口(未来可加 `AliyunOssDriver`、`S3Driver`),`UploadInput` / `UploadResult` DTO。本地实现见 `lib/storage/local.ts`。
- **`lib/storage/local.ts`** — `LocalDriver`(`__setRootDirForTest` 暴露给测试切到 `mkdtempSync` 临时目录)。文件落 `<rootDir>/<yyyy>/<mm>/<uuid>.<ext>`,`<rootDir>` 默认 `<cwd>/public/uploads`,可由 env `UPLOAD_ROOT_DIR` 覆盖(绝对路径直接用,相对路径以 `process.cwd()` 为基准),Next.js 自动以 `/uploads/...` 暴露。公开 URL 通过 env `NEXT_PUBLIC_APP_URL` 拼接,缺省 `http://localhost:${PORT ?? 3000}`。`remove(key)` 用 `path.relative(rootDir, target)` 防越权,绝对路径与含 `..` 的相对路径都拒绝。
- **`getUploadLimits(purpose?)`** — 按 `purpose` 分级解析上传限制:
  - `purpose=avatar`(默认 5 MiB / 仅图片 4 种 MIME)→ env `UPLOAD_MAX_BYTES_AVATAR` / `UPLOAD_ALLOWED_MIME_AVATAR` 可覆盖
  - `purpose=generic`(默认 100 MiB / 20 种 MIME:图片 + 文档 + 压缩包 + 视频 + 音频)→ env `UPLOAD_MAX_BYTES` / `UPLOAD_ALLOWED_MIME` 可覆盖
  - **env 优先级**:`UPLOAD_MAX_BYTES_<PURPOSE>` > `UPLOAD_MAX_BYTES` > 内置默认
  - env 缺失/非法时回退到内置默认值,不抛错
- **不要**在路由处理器里直接 `fs.writeFile`,全部走 `localDriver.put`;后续切到 OSS 时无需改路由。

### WeChat Mini-Program provider

- **适用场景**: 微信小程序端通过 `getPhoneNumber` 按钮拿到手机号登录。**仅支持 2022+ 新接口**(`phone_code` + `getuserphonenumber`),不支持旧的 `encryptedData`/`iv` 解密流程。
- **登录入口**: 只能从服务端调用,不能从 admin Web `signIn` 调用。`app/api/auth/wechat-miniprogram/login/route.ts` 接收 `{ code, phoneCode }`,内部调用 `signIn("wechat-miniprogram", { code, phoneCode, redirect: false })`,成功后 Auth.js 自动写 session cookie。
- **三方调用链**:
  1. `wx.login()` 拿 `js_code` → `code2Session` 换 `openid` / `session_key`(用于排障日志)
  2. `<button open-type="getPhoneNumber">` 拿 `phone_code` → `getPhoneNumber` 用服务端 `access_token` 换真实手机号
  3. `findOrCreateUserAndLinkAccount` 完成 user / account 绑定
- **`lib/wechat/miniprogram.ts`** — 微信服务端 API 客户端。导出 `code2Session` / `getAccessToken`(进程内缓存,提前 5 分钟视为过期)/ `getPhoneNumber` / `readWechatMpConfig` / `WechatMpError`。所有调用走原生 `fetch` + `AbortController`(默认 8 秒超时),不引入新 HTTP 客户端依赖。
- **绑定策略**: `provider = "wechat-miniprogram"`,`providerAccountId = phone`(按手机号绑定)。与现有 `phone` provider 共用同一索引,首登时若同号 SMS 用户已存在则自动 link 到同一 user。
- **默认 role**: `USER`。微信登录用户访问 `/admin/*` 会被 `app/admin/layout.tsx` 的 `role === "ADMIN"` 守卫重定向到 `/`,与 SMS 用户行为一致。
- **环境变量**: `WECHAT_MP_APP_ID` / `WECHAT_MP_APP_SECRET` / `WECHAT_MP_API_BASE`(默认 `https://api.weixin.qq.com`)。任一必填空时登录返回 401 + 日志 `missing app config`。
- **不持久化 openid**: 仅在 `code2Session ok` 日志中记录,便于排障;不加 `wechatOpenid` 列。
- **CORS 不需要**: 微信小程序 `wx.request` 不强制 CORS,服务端不返回额外 CORS 头。

### Login UI flow

- `app/(auth)/login/page.tsx` renders `<LoginTabs />` inside `<Suspense>` (required by `useSearchParams` in client forms).
- `login-tabs.tsx` owns the `<Card>` + `<Tabs>` with two tabs (邮箱密码 / 手机验证码).
- `phone-login-form.tsx` calls `fetch("/api/auth/sms/send", ...)` then starts a 60s countdown; on submit calls `signIn("phone", { phone, code, redirect: false })`.

## Logging

- **`lib/logger.ts`** — structured single-line logger. Three levels (`info` / `warn` / `error`), each takes `(prefix, message, context?)`. Output format: `[ISO_TS] [PREFIX] message {json-context}`.
- **`LOG_PREFIX`** constants: `AUTH` / `SMS` / `ACCOUNT` / `WECHAT` / `UPLOAD`. Import from `@/lib/logger` and reuse — do not scatter string literals.
- Use `logger` (not `console.*`) in all auth and SMS code paths. Critical events to log:
  - Login success / failure (with reason: invalid input, user not found, password mismatch, code verify failed)
  - User auto-creation, account link / link refresh
  - SMS send rejected (invalid body / phone format / rate limited) and send failed (provider error)
- Future migration to pino/winston is a drop-in replacement of `emit()`.

## Testing

- **Unit/integration tests** live under `tests/unit/**` and `tests/integration/**`. Run with `pnpm test`; watch mode is `pnpm test:watch`; coverage is `pnpm test:coverage`.
- **MSW handlers** are defined in `tests/msw/handlers.ts`. Override per-test with `server.use(http.post(...))`; handlers reset automatically in `afterEach`.
- **Integration tests must use relative URLs** (e.g. `fetch("/api/auth/sms/send")`). Absolute `http://localhost/...` URLs are blocked by happy-dom's CORS handling.
- **`vi.mock` with referenced variables:** if the mock factory references outer-scope objects (e.g. a chainable mock db), wrap the construction in `vi.hoisted(() => { ... })` — otherwise vitest hoists `vi.mock` above the variable declaration and throws `ReferenceError: Cannot access 'X' before initialization`.
- **Fake timers for rate-limit tests:** use `vi.useFakeTimers()` + `vi.setSystemTime()`; call `rateLimiter.__resetForTest()` in `beforeEach`.
- **E2E tests** live in `tests/e2e/*.spec.ts`. Playwright auto-starts `pnpm dev` via `webServer` in `playwright.config.ts`. First run: `pnpm exec playwright install --with-deps chromium`.

## Common tasks

### Add a new Credentials-style provider (e.g. email magic link)

1. Add the provider to `auth.ts` `providers` array with a unique `id`.
2. If the provider issues codes, add a sibling module under `lib/<provider>/` mirroring `lib/sms/` (code service + sender + rate limit).
3. Add a `POST /api/auth/<provider>/send` route mirroring `app/api/auth/sms/send/route.ts`.
4. In `authorize`, call `findOrCreateUserAndLinkAccount` from `@/lib/auth/account-service` — do not write raw `db.insert(users)`.
5. Add a tab to `login-tabs.tsx` and a corresponding client form.
6. Add MSW handlers + integration tests under `tests/integration/api/auth/<provider>-send.test.ts`.

### Add a protected resource (e.g. comments)

1. Add the table to `db/schema.ts`; export `Comment` / `NewComment` types.
2. Run `pnpm db:generate && pnpm db:migrate`.
3. Add `CommentDTO` to `types/api.ts`.
4. Create `app/api/comments/route.ts` and `app/api/comments/[id]/route.ts`, mirroring the users pattern (use `requireAdmin()` for mutating routes).
5. Create `app/admin/comments/page.tsx` + `_components/comments-table.tsx`.
6. Register the nav item in `components/app-sidebar.tsx`.
7. Add MSW fixtures in `tests/msw/handlers.ts`.

### Add a new admin page

1. Create `app/admin/<feature>/page.tsx` (server component).
2. If interactivity is needed, extract it to `_components/<feature>-client.tsx`.
3. For statistics, reuse `components/stat-card.tsx`.
4. Add a nav entry in `components/app-sidebar.tsx`.

### Modify a schema

1. Edit `db/schema.ts`.
2. `pnpm db:generate` and **manually review** the generated SQL.
3. `pnpm db:migrate`.
4. If you touched auth-related fields, update `types/next-auth.d.ts` and `auth.config.ts` accordingly.

## Gotchas

- **`middleware.ts` is gone.** Use `proxy.ts` exporting `auth as proxy`. See `auth.config.ts` for `authorized` callback to gate `/admin/:path*`.
- **`next lint` is removed.** `pnpm lint` runs `eslint .` directly.
- **`useSearchParams()` requires a Suspense boundary** in a server-component parent (see `app/(auth)/login/page.tsx`) or build will fail during static analysis.
- **Route handler `params` are Promises.** Always `await context.params`.
- **Do not edit `hooks/use-mobile.ts`.** It intentionally violates the new React 19 hook rule and is silenced with a line-level `eslint-disable-next-line` — removing the disable will fail lint.
- **Do not return raw database rows from API routes.** Always go through a DTO function to drop `passwordHash` and stringify timestamps.
- **MSW + happy-dom:** integration tests need relative fetch URLs.
- **PowerShell does not support `&&`.** When chaining commands in agent shells, use `;` or call them sequentially.
- **shadcn/ui is on `@base-ui/react`, not Radix.** When adding components via `pnpm dlx shadcn@latest add <name>`, the project uses the `base-nova` style. The `Tabs` primitive uses `@base-ui/react/tabs`.
- **`next build` may fail offline** if Google Fonts (Geist / Geist Mono) cannot be fetched. This is an environment issue, not a code issue — `tsc --noEmit` + `vitest run` + `eslint .` are the offline-verifiable quality gates.
- **`accounts` table is manually managed.** This project does not use `@auth/drizzle-adapter`. User creation and account linking go through `lib/auth/account-service.ts`. Future OAuth providers will need manual handling in NextAuth `events` callbacks.

## Quality gate

Before considering a change done, all of these must pass:

```bash
pnpm lint
pnpm build
pnpm test
```

When touching E2E behavior:

```bash
pnpm exec playwright install --with-deps chromium   # first run only
pnpm test:e2e
```

When offline and `pnpm build` fails only due to Google Fonts, substitute `node node_modules/typescript/bin/tsc --noEmit` for type verification.
