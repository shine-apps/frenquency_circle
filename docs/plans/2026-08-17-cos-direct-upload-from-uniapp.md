# uniapp 客户端直传腾讯云 COS 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 uniapp 客户端(`frontend_uniapp/`)新增一条「直传腾讯云 COS」的上传通道,文件不再经后端中转;后端 `POST /api/upload`(本地上传)与 `lib/storage/local.ts` **保持不动**,仅新增一个 `GET /api/upload/cos-credentials` 端点签发 STS 临时凭证(按用户隔离 scope)。

**Architecture:** 客户端先向后端请求「按当前用户隔离的 STS 临时凭证」(`qcloud-cos-sts` 在服务端签发,scope=`uploads/<userId>/*`),再用 `cos-js-sdk-v5` SDK 直传文件到 COS Bucket。客户端侧的 `uploadFileToCos(input)` 返回与现有 `uploadFile` 完全相同的 `UploadResult` 形状(`url`/`key`/`size`/`mimeType`/`originalName`),所以 3 个调用方(create-circle / profile / teacher-certification)只改 import 名。现有 `uploadFile`(走后端)保留为回退通道。STS 凭证带 30 分钟 TTL,客户端做内存级缓存(到期前 5 分钟视为失效)。

**Tech Stack:** Next.js 16 App Router · `qcloud-cos-sts`(服务端签 STS) · uniapp 3 + Vue 3 · `cos-js-sdk-v5`(客户端 SDK,Web + 微信小程序通用) · Vitest 4

---

## File Structure

```
admin/                                         # 后端:本地上传不动,新增 STS 签发
├── lib/cos/                                  # NEW: COS 子系统(STS 签发)
│   ├── config.ts                              # NEW: 读 env(COS_SECRET_ID/KEY/BUCKET/REGION/PUBLIC_BASE_URL/KEY_PREFIX/STS_DURATION_SECONDS)
│   └── sts.ts                                 # NEW: issueScopedCredentials(userId) → STS 凭证 + bucket/region/prefix/publicBaseUrl
├── app/api/upload/cos-credentials/            # NEW: STS 签发路由(GET)
│   └── route.ts                               # NEW: readUserFromToken 鉴权 → 调 issueScopedCredentials → 返回 IResponse<CosCredentials>
├── tests/unit/lib/cos/                        # NEW: 单测
│   ├── config.test.ts
│   └── sts.test.ts
├── tests/integration/api/upload/             # NEW: 集成
│   └── cos-credentials.test.ts
├── .env.example                              # MODIFY: 追加 COS_* 段
├── AGENTS.md                                  # MODIFY: 文档同步(lib/cos/ + 新端点)
└── package.json                              # MODIFY: 加 qcloud-cos-sts

frontend_uniapp/                              # 前端:新增直传,保留旧 uploadFile
├── package.json                              # MODIFY: 加 cos-js-sdk-v5
├── src/api/upload.ts                         # MODIFY: 新增 uploadFileToCos(input)
├── src/api/cos-credentials.ts                # NEW: fetchCosCredentials() — GET /api/upload/cos-credentials
├── src/api/cos-credentials.test.ts           # NEW: 单测(与 cos-credentials.ts 同目录,符合 vitest include 规则)
├── src/utils/cos-client.ts                   # NEW: getCosClient() — 惰性构造 cos-js-sdk-v5 单例,凭证过期自动刷新
├── src/utils/cos-client.test.ts              # NEW: 单测(凭证缓存 + 重建)
├── src/utils/cos-key.ts                      # NEW: buildObjectKey(userId, mimeType, originalName) — yyyy/mm/uuid.<ext> 路径生成
├── src/utils/cos-key.test.ts                 # NEW: 单测(纯函数)
└── src/api/upload-cos.test.ts                # NEW: uploadFileToCos 单测(mock cos-js-sdk-v5 + cos-credentials)

迁移调用方(改成 uploadFileToCos):
├── src/pages/create-circle/create-circle.vue       # MODIFY: import uploadFileToCos
├── src/pages/profile/profile.vue                   # MODIFY: import uploadFileToCos
└── src/pages/teacher-certification/teacher-certification.vue  # MODIFY: import uploadFileToCos
```

**职责边界:**

- `admin/lib/cos/config.ts` — 仅读+校验 env,纯函数,不调 Tencent API
- `admin/lib/cos/sts.ts` — 仅负责调 `qcloud-cos-sts` 签发 scoped 凭证,返回客户端需要的所有信息(凭证 + bucket/region/prefix/publicBaseUrl)
- `admin/app/api/upload/cos-credentials/route.ts` — 鉴权 + 调 sts,仅此一层对外
- `frontend_uniapp/src/api/cos-credentials.ts` — 仅负责调后端拿凭证(走 alova/fetch + token)
- `frontend_uniapp/src/utils/cos-client.ts` — 仅负责管理 COS SDK 单例(凭证缓存 + 过期刷新)
- `frontend_uniapp/src/utils/cos-key.ts` — 仅负责构造对象 key(纯函数,可单测)
- `frontend_uniapp/src/api/upload.ts` — 对外门面:`uploadFile`(走后端,保留) + `uploadFileToCos`(直传 COS,新增)

---

## Task 1: 后端安装 `qcloud-cos-sts`

**Files:**

- Modify: `admin/package.json`
- Modify: `admin/pnpm-lock.yaml` (自动)

- [ ] **Step 1: 安装 `qcloud-cos-sts`**

Run(在 `admin/`):

```bash
pnpm add qcloud-cos-sts
```

Expected: `package.json` 的 `dependencies` 增加 `"qcloud-cos-sts": "^3.x.x"`,`pnpm-lock.yaml` 更新。

- [ ] **Step 2: 验证模块可加载**

Run:

```bash
node -e "const s = require('qcloud-cos-sts'); console.log(typeof s, typeof s.getCredential)"
```

Expected: 输出 `function function`(模块可加载,导出函数形式)。若为 `object` 形式,后续 `new STS(...)` 改为直接调 `getCredential(opts)`。

- [ ] **Step 3: 若 TypeScript 缺声明文件,创建最小 d.ts**

Run:

```bash
node node_modules/typescript/bin/tsc --noEmit
```

若报 `Could not find a declaration file for 'qcloud-cos-sts'`,创建 `admin/types/qcloud-cos-sts.d.ts`:

```ts
declare module "qcloud-cos-sts" {
    interface StsCredential {
        credentials: {
            tmpSecretId: string;
            tmpSecretKey: string;
            sessionToken: string;
        };
        startTime: number;
        expiredTime: number;
    }
    interface GetCredentialOptions {
        SecretId: string;
        SecretKey: string;
        Method?: "get" | "post";
        DurationSeconds?: number;
        Policy?: object;
        Scope?: Array<{
            action: string;
            bucket: string;
            region: string;
            prefix: string;
        }>;
    }
    export default class STS {
        constructor(opts: { SecretId: string; SecretKey: string; proxy?: string });
        getCredential(options: GetCredentialOptions): Promise<StsCredential>;
    }
    export function getCredential(options: GetCredentialOptions): Promise<StsCredential>;
}
```

若 `tsc --noEmit` 已通过(SDK 自带类型),跳过本步。

- [ ] **Step 4: Commit**

```bash
cd admin
git add package.json pnpm-lock.yaml types/qcloud-cos-sts.d.ts
git commit -m "chore: add qcloud-cos-sts for issuing scoped tencent cos credentials"
```

---

## Task 2: 后端 `lib/cos/config.ts`(读 + 校验 COS env)

**Files:**

- Create: `admin/lib/cos/config.ts`
- Create: `admin/tests/unit/lib/cos/config.test.ts`

- [ ] **Step 1: 写失败测试**

Create `admin/tests/unit/lib/cos/config.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveCosConfig } from "@/lib/cos/config";

beforeEach(() => {
    // 默认提供完整合法 env
    process.env.COS_SECRET_ID = "sid";
    process.env.COS_SECRET_KEY = "skey";
    process.env.COS_BUCKET = "frenqency-1234567890";
    process.env.COS_REGION = "ap-shanghai";
    process.env.COS_PUBLIC_BASE_URL = "https://cdn.example.com";
    process.env.COS_KEY_PREFIX = "uploads";
    process.env.COS_STS_DURATION_SECONDS = "1800";
});

afterEach(() => {
    delete process.env.COS_SECRET_ID;
    delete process.env.COS_SECRET_KEY;
    delete process.env.COS_BUCKET;
    delete process.env.COS_REGION;
    delete process.env.COS_PUBLIC_BASE_URL;
    delete process.env.COS_KEY_PREFIX;
    delete process.env.COS_STS_DURATION_SECONDS;
});

describe("lib/cos/config", () => {
    it("returns full config when all env present", () => {
        const cfg = resolveCosConfig();
        expect(cfg.secretId).toBe("sid");
        expect(cfg.secretKey).toBe("skey");
        expect(cfg.bucket).toBe("frenqency-1234567890");
        expect(cfg.region).toBe("ap-shanghai");
        expect(cfg.publicBaseUrl).toBe("https://cdn.example.com");
        expect(cfg.keyPrefix).toBe("uploads");
        expect(cfg.stsDurationSeconds).toBe(1800);
    });

    it("throws when COS_SECRET_ID missing", () => {
        delete process.env.COS_SECRET_ID;
        expect(() => resolveCosConfig()).toThrow(/COS_SECRET_ID/);
    });

    it("throws when COS_SECRET_KEY missing", () => {
        delete process.env.COS_SECRET_KEY;
        expect(() => resolveCosConfig()).toThrow(/COS_SECRET_KEY/);
    });

    it("throws when COS_BUCKET missing", () => {
        delete process.env.COS_BUCKET;
        expect(() => resolveCosConfig()).toThrow(/COS_BUCKET/);
    });

    it("throws when COS_PUBLIC_BASE_URL missing", () => {
        delete process.env.COS_PUBLIC_BASE_URL;
        expect(() => resolveCosConfig()).toThrow(/COS_PUBLIC_BASE_URL/);
    });

    it("defaults keyPrefix to 'uploads' when env empty", () => {
        delete process.env.COS_KEY_PREFIX;
        expect(resolveCosConfig().keyPrefix).toBe("uploads");
    });

    it("defaults stsDurationSeconds to 1800 when env missing", () => {
        delete process.env.COS_STS_DURATION_SECONDS;
        expect(resolveCosConfig().stsDurationSeconds).toBe(1800);
    });

    it("falls back to 1800 when env is not a positive integer", () => {
        process.env.COS_STS_DURATION_SECONDS = "abc";
        expect(resolveCosConfig().stsDurationSeconds).toBe(1800);
    });

    it("clamps stsDurationSeconds to [60, 7200]", () => {
        process.env.COS_STS_DURATION_SECONDS = "10";
        expect(resolveCosConfig().stsDurationSeconds).toBe(60);
        process.env.COS_STS_DURATION_SECONDS = "99999";
        expect(resolveCosConfig().stsDurationSeconds).toBe(7200);
    });

    it("strips trailing slash from publicBaseUrl and keyPrefix", () => {
        process.env.COS_PUBLIC_BASE_URL = "https://cdn.example.com/";
        process.env.COS_KEY_PREFIX = "uploads/";
        const cfg = resolveCosConfig();
        expect(cfg.publicBaseUrl).toBe("https://cdn.example.com");
        expect(cfg.keyPrefix).toBe("uploads");
    });

    it("allows empty keyPrefix (root of bucket)", () => {
        process.env.COS_KEY_PREFIX = "";
        const cfg = resolveCosConfig();
        expect(cfg.keyPrefix).toBe("");
    });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run(在 `admin/`):

```bash
node node_modules/vitest/vitest.mjs run tests/unit/lib/cos/config.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/cos/config"`。

- [ ] **Step 3: 实现 `lib/cos/config.ts`**

Create `admin/lib/cos/config.ts`:

```ts
/**
 * COS 配置(从 env 读取,启动期/首次调用时校验)。
 *
 * 必填 env:
 * - COS_SECRET_ID / COS_SECRET_KEY
 * - COS_BUCKET(如 'frenqency-1234567890',含 APPID 后缀)
 * - COS_REGION(如 'ap-shanghai')
 * - COS_PUBLIC_BASE_URL(公开访问基址,如 'https://cdn.example.com')
 *
 * 可选 env:
 * - COS_KEY_PREFIX(默认 'uploads';空字符串表示无前缀)
 * - COS_STS_DURATION_SECONDS(默认 1800,夹紧到 [60, 7200])
 */

const DEFAULT_KEY_PREFIX = "uploads";
const DEFAULT_STS_DURATION_SECONDS = 1800;
const MIN_STS_DURATION_SECONDS = 60;
const MAX_STS_DURATION_SECONDS = 7200;

export interface CosConfig {
    secretId: string;
    secretKey: string;
    bucket: string;
    region: string;
    /** 公开访问基址(CDN 或 bucket 默认域名),无尾斜杠 */
    publicBaseUrl: string;
    /** 对象 key 前缀,无尾斜杠;空字符串表示无前缀 */
    keyPrefix: string;
    /** STS 凭证有效期(秒),夹紧到 [60, 7200] */
    stsDurationSeconds: number;
}

/** strip 首尾斜杠 */
function stripSlashes(s: string): string {
    return s.replace(/^\/+|\/+$/g, "");
}

function resolveDurationSeconds(raw: string | undefined): number {
    if (!raw) return DEFAULT_STS_DURATION_SECONDS;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_STS_DURATION_SECONDS;
    return Math.min(Math.max(Math.floor(n), MIN_STS_DURATION_SECONDS), MAX_STS_DURATION_SECONDS);
}

/**
 * 从 env 解析 COS 配置。任一必填项缺失抛错(便于启动期/首次调用暴露配置错误)。
 * 不缓存;调用方按需调用(高频处可自行缓存)。
 */
export function resolveCosConfig(): CosConfig {
    const secretId = process.env.COS_SECRET_ID?.trim();
    const secretKey = process.env.COS_SECRET_KEY?.trim();
    const bucket = process.env.COS_BUCKET?.trim();
    const region = process.env.COS_REGION?.trim();
    const publicBaseUrlRaw = process.env.COS_PUBLIC_BASE_URL?.trim();

    if (!secretId) throw new Error("COS_SECRET_ID is required");
    if (!secretKey) throw new Error("COS_SECRET_KEY is required");
    if (!bucket) throw new Error("COS_BUCKET is required");
    if (!region) throw new Error("COS_REGION is required");
    if (!publicBaseUrlRaw) throw new Error("COS_PUBLIC_BASE_URL is required");

    // keyPrefix 允许空字符串(不设前缀,直接挂 bucket 根)
    const keyPrefixRaw = (process.env.COS_KEY_PREFIX ?? DEFAULT_KEY_PREFIX).trim();

    return {
        secretId,
        secretKey,
        bucket,
        region,
        publicBaseUrl: stripSlashes(publicBaseUrlRaw),
        keyPrefix: stripSlashes(keyPrefixRaw),
        stsDurationSeconds: resolveDurationSeconds(process.env.COS_STS_DURATION_SECONDS),
    };
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run:

```bash
node node_modules/vitest/vitest.mjs run tests/unit/lib/cos/config.test.ts
```

Expected: PASS(11 个用例)。

- [ ] **Step 5: Lint + 类型检查**

Run:

```bash
node node_modules/eslint/bin/eslint.js lib/cos/config.ts tests/unit/lib/cos/config.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
cd admin
git add lib/cos/config.ts tests/unit/lib/cos/config.test.ts types/qcloud-cos-sts.d.ts
git commit -m "feat(cos): add config reader with env validation"
```

---

## Task 3: 后端 `lib/cos/sts.ts`(签发 scoped STS 凭证)

**Files:**

- Create: `admin/lib/cos/sts.ts`
- Create: `admin/tests/unit/lib/cos/sts.test.ts`

- [ ] **Step 1: 写失败测试**

Create `admin/tests/unit/lib/cos/sts.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * sts.ts 单测:mock `qcloud-cos-sts` 的 getCredential,
 * 验证 scope 前缀按 userId 隔离,duration 透传,返回字段映射正确。
 */

const { getCredentialMock } = vi.hoisted(() => ({
    getCredentialMock: vi.fn(),
}));

vi.mock("qcloud-cos-sts", () => ({
    __esModule: true,
    // qcloud-cos-sts 导出对象 { getCredential, getPolicy, getRoleCredential }
    // 真正实现用 callback,这里用 mock 函数 + 内部包成 Promise
    getCredential: (opts: unknown, cb: (err: unknown, data: unknown) => void) => {
        getCredentialMock(opts)
            .then((data: unknown) => cb(null, data))
            .catch((e: unknown) => cb(e, null));
    },
    getPolicy: (scope: unknown) => scope,
}));

vi.mock("@/lib/cos/config", () => ({
    resolveCosConfig: () => ({
        secretId: "sid",
        secretKey: "skey",
        bucket: "frenqency-1234567890",
        region: "ap-shanghai",
        publicBaseUrl: "https://cdn.example.com",
        keyPrefix: "uploads",
        stsDurationSeconds: 1800,
    }),
}));

import { issueScopedCredentials } from "@/lib/cos/sts";

beforeEach(() => {
    getCredentialMock.mockReset();
    // 默认返回一个合法凭证
    getCredentialMock.mockResolvedValue({
        credentials: {
            tmpSecretId: "tmpSid",
            tmpSecretKey: "tmpSkey",
            sessionToken: "tok-xyz",
        },
        startTime: 1699999000,
        expiredTime: 1700000800,
    });
});

describe("lib/cos/sts", () => {
    it("calls getCredential with scoped prefix uploads/<userId>/*", async () => {
        await issueScopedCredentials("u-abc");
        expect(getCredentialMock).toHaveBeenCalledTimes(1);
        const opts = getCredentialMock.mock.calls[0]?.[0];
        // qcloud-cos-sts getPolicy 返回的 policy 对象需含 Statement 含 scope
        const policy = opts.policy as { statement: Array<{ action: string; resource: string }> };
        expect(policy.statement[0].action).toBe("name/cos:PutObject");
        // resource 应含 userId scope(形如 qcs::cos:ap-shanghai:uid/...bucket/uploads/u-abc/*)
        expect(policy.statement[0].resource).toMatch(/uploads\/u-abc\/\*/);
        expect(opts.durationSeconds).toBe(1800);
        expect(opts.secretId).toBe("sid");
        expect(opts.secretKey).toBe("skey");
    });

    it("returns mapped CosCredentials with userId/bucket/region/prefix/publicBaseUrl for client", async () => {
        const result = await issueScopedCredentials("u-abc");
        expect(result).toEqual({
            userId: "u-abc",
            secretId: "tmpSid",
            secretKey: "tmpSkey",
            sessionToken: "tok-xyz",
            startTime: 1699999000,
            expiredTime: 1700000800,
            bucket: "frenqency-1234567890",
            region: "ap-shanghai",
            keyPrefix: "uploads",
            publicBaseUrl: "https://cdn.example.com",
        });
    });

    it("escapes special chars in userId to prevent scope injection", async () => {
        // 恶意 userId 尝试扩大 scope(如 "u-x/../u-other")
        // 我们的实现选择拒绝(userId 必须匹配 [A-Za-z0-9_-]+)
        await expect(issueScopedCredentials("u-x/../u-other")).rejects.toThrow(/Invalid userId/);
        expect(getCredentialMock).not.toHaveBeenCalled();
    });

    it("rejects empty userId", async () => {
        await expect(issueScopedCredentials("")).rejects.toThrow(/userId/);
        await expect(issueScopedCredentials("   ")).rejects.toThrow(/userId/);
    });

    it("propagates getCredential errors", async () => {
        getCredentialMock.mockRejectedValue(new Error("sts unavailable"));
        await expect(issueScopedCredentials("u-1")).rejects.toThrow(/sts unavailable/);
    });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run:

```bash
node node_modules/vitest/vitest.mjs run tests/unit/lib/cos/sts.test.ts
```

Expected: FAIL — `Failed to resolve import "@/lib/cos/sts"`。

- [ ] **Step 3: 实现 `lib/cos/sts.ts`**

Create `admin/lib/cos/sts.ts`:

```ts
import { getCredential, getPolicy } from "qcloud-cos-sts";

import { resolveCosConfig } from "./config";

/** 对外签发的凭证(客户端拿到后可直接构造 cos-js-sdk-v5) */
export interface CosCredentials {
    /** 当前用户 ID(客户端用于构造 scope 内的 key) */
    userId: string;
    /** 临时 SecretId */
    secretId: string;
    /** 临时 SecretKey */
    secretKey: string;
    /** STS session token */
    sessionToken: string;
    /** 凭证生效时间(Unix 秒) */
    startTime: number;
    /** 凭证失效时间(Unix 秒) */
    expiredTime: number;
    /** bucket 名(含 APPID 后缀) */
    bucket: string;
    /** 地域 */
    region: string;
    /** 对象 key 前缀(无尾斜杠) */
    keyPrefix: string;
    /** 公开访问基址(CDN 或 bucket 默认域名) */
    publicBaseUrl: string;
}

/** userId 安全校验:非空、不含斜杠/.. 等路径分隔符(防 scope 注入) */
const USER_ID_RE = /^[A-Za-z0-9_-]+$/;

/**
 * 为指定用户签发 scoped STS 临时凭证。
 *
 * - scope:`<keyPrefix>/<userId>/*`,仅允许 PutObject 到该前缀下
 * - duration:由 `COS_STS_DURATION_SECONDS` 控制(已在 config 夹紧到 [60, 7200])
 * - userId 必须匹配 `[A-Za-z0-9_-]+`,否则抛错(防 `../` 注入扩大 scope)
 *
 * @param userId 当前登录用户 ID(来自 readUserFromToken)
 */
export async function issueScopedCredentials(userId: string): Promise<CosCredentials> {
    const trimmed = userId.trim();
    if (!trimmed || !USER_ID_RE.test(trimmed)) {
        throw new Error(`Invalid userId for STS scope: ${JSON.stringify(userId)}`);
    }

    const cfg = resolveCosConfig();
    const prefix = cfg.keyPrefix ? `${cfg.keyPrefix}/${trimmed}` : trimmed;
    const scopePrefix = `${prefix}/*`;

    // qcloud-cos-sts 实际 API:callback 形式,不是 Promise/PascalCase keys
    // 参考官方 demo demo/sts-server-scope.js
    const policy = STS.getPolicy([
        {
            action: "name/cos:PutObject",
            bucket: cfg.bucket,
            region: cfg.region,
            prefix: scopePrefix,
        },
    ]);

    const result = await new Promise<{
        credentials: { tmpSecretId: string; tmpSecretKey: string; sessionToken: string };
        startTime: number;
        expiredTime: number;
    }>((resolve, reject) => {
        STS.getCredential(
            {
                secretId: cfg.secretId,
                secretKey: cfg.secretKey,
                durationSeconds: cfg.stsDurationSeconds,
                policy,
            },
            (err: unknown, data: unknown) => {
                if (err) reject(err instanceof Error ? err : new Error(String(err)));
                else resolve(data as Parameters<typeof resolve>[0]);
            },
        );
    });

    return {
        userId: trimmed,
        secretId: result.credentials.tmpSecretId,
        secretKey: result.credentials.tmpSecretKey,
        sessionToken: result.credentials.sessionToken,
        startTime: result.startTime,
        expiredTime: result.expiredTime,
        bucket: cfg.bucket,
        region: cfg.region,
        keyPrefix: cfg.keyPrefix,
        publicBaseUrl: cfg.publicBaseUrl,
    };
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run:

```bash
node node_modules/vitest/vitest.mjs run tests/unit/lib/cos/sts.test.ts
```

Expected: PASS(5 个用例)。

- [ ] **Step 5: Lint + 类型检查**

Run:

```bash
node node_modules/eslint/bin/eslint.js lib/cos/sts.ts tests/unit/lib/cos/sts.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
cd admin
git add lib/cos/sts.ts tests/unit/lib/cos/sts.test.ts
git commit -m "feat(cos): issue scoped STS credentials per user"
```

---

## Task 4: 后端 `GET /api/upload/cos-credentials` 路由

**Files:**

- Create: `admin/app/api/upload/cos-credentials/route.ts`
- Create: `admin/tests/integration/api/upload/cos-credentials.test.ts`

- [ ] **Step 1: 写失败测试**

Create `admin/tests/integration/api/upload/cos-credentials.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * GET /api/upload/cos-credentials 集成测试。
 *
 * mock 层级:
 * - @/lib/auth/session-token:控制 readUserFromToken 返回
 * - @/lib/cos/sts:fakeIssueScopedCredentials 替代真实 STS 调用
 * - @/lib/logger:避免输出噪音
 */

const { readUserFromTokenMock, fakeStsResult, issueMock } = vi.hoisted(() => {
    const readUserFromTokenMock = vi.fn();
    const fakeStsResult = {
        userId: "u-abc",
        secretId: "tmpSid",
        secretKey: "tmpSkey",
        sessionToken: "tok-xyz",
        startTime: 1699999000,
        expiredTime: 1700000800,
        bucket: "frenqency-1234567890",
        region: "ap-shanghai",
        keyPrefix: "uploads",
        publicBaseUrl: "https://cdn.example.com",
    };
    const issueMock = vi.fn(async (userId: string) => ({
        ...fakeStsResult,
        // 让每次返回带 userId 的不同 prefix,便于断言 scope 隔离
        keyPrefix: "uploads",
    }));
    return { readUserFromTokenMock, fakeStsResult, issueMock };
});

vi.mock("@/lib/auth/session-token", () => ({
    readUserFromToken: readUserFromTokenMock,
}));
vi.mock("@/lib/cos/sts", () => ({
    issueScopedCredentials: issueMock,
}));
vi.mock("@/lib/logger", () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    LOG_PREFIX: { AUTH: "AUTH", UPLOAD: "UPLOAD", COS: "COS" },
}));

import { GET } from "@/app/api/upload/cos-credentials/route";
import type { IResponse } from "@/types/api";
import type { CosCredentials } from "@/lib/cos/sts";

const FAKE_USER = { id: "u-abc", email: "u@example.com", name: "U", role: "USER" };

beforeEach(() => {
    readUserFromTokenMock.mockReset();
    issueMock.mockReset();
    readUserFromTokenMock.mockResolvedValue(FAKE_USER);
    issueMock.mockResolvedValue(fakeStsResult);
});

describe("GET /api/upload/cos-credentials", () => {
    it("returns 401 when no auth user", async () => {
        readUserFromTokenMock.mockResolvedValue(null);
        const req = new Request("http://localhost/api/upload/cos-credentials");
        const res = await GET(req);
        expect(res.status).toBe(401);
        expect(issueMock).not.toHaveBeenCalled();
    });

    it("returns 200 with CosCredentials for logged-in user", async () => {
        const req = new Request("http://localhost/api/upload/cos-credentials");
        const res = await GET(req);
        expect(res.status).toBe(200);
        const body = (await res.json()) as IResponse<CosCredentials>;
        expect(body.code).toBe(200);
        expect(body.data.secretId).toBe("tmpSid");
        expect(body.data.sessionToken).toBe("tok-xyz");
        expect(body.data.bucket).toBe("frenqency-1234567890");
        expect(body.data.publicBaseUrl).toBe("https://cdn.example.com");
    });

    it("passes current user id to issueScopedCredentials", async () => {
        const req = new Request("http://localhost/api/upload/cos-credentials");
        await GET(req);
        expect(issueMock).toHaveBeenCalledWith("u-abc");
    });

    it("returns 500 when issueScopedCredentials throws", async () => {
        issueMock.mockRejectedValue(new Error("sts unavailable"));
        const req = new Request("http://localhost/api/upload/cos-credentials");
        const res = await GET(req);
        expect(res.status).toBe(500);
        const body = (await res.json()) as IResponse<null>;
        expect(body.message).toBe("Failed to issue COS credentials");
    });

    it("supports OPTIONS preflight via corsOptions", async () => {
        const { OPTIONS } = await import("@/app/api/upload/cos-credentials/route");
        const req = new Request("http://localhost/api/upload/cos-credentials", {
            method: "OPTIONS",
        });
        const res = await OPTIONS(req);
        // corsOptions 返回 204 或带 CORS 头的响应,这里只验证它不抛
        expect(res.status).toBeLessThan(400);
    });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run:

```bash
node node_modules/vitest/vitest.mjs run tests/integration/api/upload/cos-credentials.test.ts
```

Expected: FAIL — `Failed to resolve import "@/app/api/upload/cos-credentials/route"`。

- [ ] **Step 3: 实现路由**

Create `admin/app/api/upload/cos-credentials/route.ts`:

```ts
import { corsOptions, fail, ok, withCors } from "@/lib/api";
import { readUserFromToken } from "@/lib/auth/session-token";
import { logger, LOG_PREFIX } from "@/lib/logger";
import { issueScopedCredentials } from "@/lib/cos/sts";

/** 安全地把 unknown 转为字符串(用于日志) */
function errMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    return String(e);
}

/**
 * 签发 scoped COS STS 凭证(供客户端直传)。
 *
 * - 鉴权:任意登录用户(`readUserFromToken`,与 /api/upload 一致)
 * - scope:`uploads/<userId>/*`(由 issueScopedCredentials 强制隔离)
 * - TTL:由 `COS_STS_DURATION_SECONDS` 控制(默认 1800s)
 * - 返回 `IResponse<CosCredentials>`,客户端拿到后构造 cos-js-sdk-v5 直传
 *
 * 本路由不参与文件传输,不消耗应用带宽,文件字节不进 Next.js 进程内存。
 */
export async function OPTIONS(req: Request) {
    return corsOptions(req);
}

export async function GET(req: Request) {
    const authUser = await readUserFromToken(req);
    if (!authUser) {
        return withCors(fail(401, "未登录或登录已过期"), req);
    }

    try {
        const credentials = await issueScopedCredentials(authUser.id);
        logger.info(LOG_PREFIX.UPLOAD, "cos sts issued", {
            userId: authUser.id,
            expiredTime: credentials.expiredTime,
        });
        return withCors(ok(credentials), req);
    } catch (e) {
        logger.error(LOG_PREFIX.UPLOAD, "cos sts failed", {
            err: errMessage(e),
            userId: authUser.id,
        });
        return withCors(fail(500, "Failed to issue COS credentials"), req);
    }
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run:

```bash
node node_modules/vitest/vitest.mjs run tests/integration/api/upload/cos-credentials.test.ts
```

Expected: PASS(5 个用例)。

- [ ] **Step 5: Lint + 类型检查**

Run:

```bash
node node_modules/eslint/bin/eslint.js app/api/upload/cos-credentials/route.ts tests/integration/api/upload/cos-credentials.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

Expected: 无错误。

- [ ] **Step 6: Commit**

```bash
cd admin
git add app/api/upload/cos-credentials/route.ts tests/integration/api/upload/cos-credentials.test.ts
git commit -m "feat(api): add GET /api/upload/cos-credentials for client-side direct cos upload"
```

---

## Task 5: 后端 `.env.example` + `AGENTS.md` 同步

**Files:**

- Modify: `admin/.env.example`
- Modify: `admin/AGENTS.md`

- [ ] **Step 1: 在 `.env.example` 追加 COS 配置段**

在 `admin/.env.example` 的 `UPLOAD_ROOT_DIR=""` 一行之后追加:

```env

# --- Tencent COS (客户端直传:后端只签发 STS,不传输文件) ---
# 客户端走 cos-js-sdk-v5 直传,后端 POST /api/upload 本地落盘保留为回退。
# 控制台:https://console.cloud.tencent.com/cam/capi → 创建 API 密钥
COS_SECRET_ID=""
COS_SECRET_KEY=""
# Bucket 名(含 APPID 后缀,如 frenqency-1234567890)
COS_BUCKET=""
# 地域(如 ap-shanghai / ap-guangzhou)
COS_REGION=""
# 公开访问基址(CDN 域名或 bucket 默认域名,无尾斜杠)
# 例如 https://cdn.example.com 或 https://frenqency-1234567890.cos.ap-shanghai.myqcloud.com
COS_PUBLIC_BASE_URL=""
# 对象 key 前缀(默认 'uploads';空字符串表示无前缀)
# scope 会自动夹到 <keyPrefix>/<userId>/* 实现按用户隔离
COS_KEY_PREFIX="uploads"
# STS 凭证有效期(秒,默认 1800,夹紧到 [60, 7200])
COS_STS_DURATION_SECONDS="1800"
```

- [ ] **Step 2: 更新 `AGENTS.md` 的 Storage 子系统章节**

在 `admin/AGENTS.md` 的 `### Storage subsystem` 段末尾追加一段:

```markdown
### Client-side direct COS upload (parallel channel)

- **`lib/cos/config.ts`** — 从 env 读 COS 配置(`COS_SECRET_ID` / `COS_SECRET_KEY` / `COS_BUCKET` / `COS_REGION` / `COS_PUBLIC_BASE_URL` / `COS_KEY_PREFIX` / `COS_STS_DURATION_SECONDS`),必填项缺失抛错,`stsDurationSeconds` 夹紧到 [60, 7200]。
- **`lib/cos/sts.ts`** — `issueScopedCredentials(userId): Promise<CosCredentials>`,调 `qcloud-cos-sts` 签发 scoped STS 凭证。scope=`<keyPrefix>/<userId>/*`(只允许 `PutObject`)。`userId` 必须匹配 `[A-Za-z0-9_-]+`(防 `../` 注入扩大 scope)。返回字段含 `bucket/region/keyPrefix/publicBaseUrl`,客户端拿到即可构造 `cos-js-sdk-v5` 直传,无需再请求其他配置。
- **`GET /api/upload/cos-credentials`** — 登录用户可调(走 `readUserFromToken`)。响应 `IResponse<CosCredentials>`,失败 401(未登录)/ 500(STS 签发失败)。**不参与文件传输**,文件字节不进 Next.js 进程内存。
- **客户端**:`frontend_uniapp` 用 `cos-js-sdk-v5` 直传到 `<Bucket>`,key 形如 `<keyPrefix>/<userId>/<yyyy>/<mm>/<uuid>.<ext>`,公开 URL 用 `COS_PUBLIC_BASE_URL` 拼接。详见 `frontend_uniapp/src/api/upload.ts` 的 `uploadFileToCos`。
- **与本地上传的关系**:`POST /api/upload`(本地上传)与本 STS 端点并存,互不影响。客户端默认走直传,本地端点保留为回退/管理后台用。
- **微信小程序域名白名单**:发布前需在 `mp.weixin.qq.com` → 开发管理 → 服务器域名,把 `COS_PUBLIC_BASE_URL` 域名 + 后端 API 域名加入 `request` / `uploadFile` 合法域名。
```

- [ ] **Step 3: 在 API conventions 段追加端点描述**

在 `admin/AGENTS.md` 的 `### Phase 2-3` 之前(或 File upload endpoint 描述之后)追加:

```markdown
- **COS STS 凭证端点** (`GET /api/upload/cos-credentials`):登录用户可调,返回 `IResponse<CosCredentials>`(含临时 SecretId/Key/Token + bucket/region/prefix/publicBaseUrl)。客户端拿到后用 `cos-js-sdk-v5` 直传 COS,文件字节不经后端。失败 401(未登录)/ 500(STS 失败)。scope 按 userId 隔离,scope prefix = `<COS_KEY_PREFIX>/<userId>/*`。
```

- [ ] **Step 4: Commit**

```bash
cd admin
git add .env.example AGENTS.md
git commit -m "docs(cos): document STS endpoint and env config for direct client upload"
```

---

## Task 6: 前端安装 `cos-js-sdk-v5`

**Files:**

- Modify: `frontend_uniapp/package.json`
- Modify: `frontend_uniapp/pnpm-lock.yaml` (自动)

- [ ] **Step 1: 安装 `cos-js-sdk-v5`**

Run(在 `frontend_uniapp/`):

```bash
pnpm add cos-js-sdk-v5
```

Expected: `package.json` 的 `dependencies` 增加 `"cos-js-sdk-v5": "^2.x.x"`。

- [ ] **Step 2: 若 TypeScript 缺声明,创建最小 d.ts**

Run:

```bash
node node_modules/typescript/bin/tsc --noEmit
```

若报 `Could not find a declaration file for 'cos-js-sdk-v5'`,创建 `frontend_uniapp/src/types/cos-js-sdk-v5.d.ts`:

```ts
declare module "cos-js-sdk-v5" {
    interface CosOptions {
        SecretId: string;
        SecretKey: string;
        SecurityToken?: string;
    }
    interface PutObjectParams {
        Bucket: string;
        Region: string;
        Key: string;
        Body: Blob | File | ArrayBuffer | string;
        ContentType?: string;
    }
    interface UploadFileParams {
        Bucket: string;
        Region: string;
        Key: string;
        FilePath: string;
        FileName?: string;
        ContentType?: string;
    }
    interface CosError {
        statusCode?: number;
        errorCode?: string;
        errorMessage?: string;
    }
    export default class COS {
        constructor(options: CosOptions);
        putObject(
            params: PutObjectParams,
            callback: (err: CosError | null, data: unknown) => void,
        ): Promise<unknown>;
        putObject(params: PutObjectParams): Promise<unknown>;
        uploadFile(
            params: UploadFileParams,
            callback: (err: CosError | null, data: unknown) => void,
        ): Promise<unknown>;
        uploadFile(params: UploadFileParams): Promise<unknown>;
    }
}
```

若 SDK 自带类型且 `tsc` 通过,跳过本步。

- [ ] **Step 3: Commit**

```bash
cd frontend_uniapp
git add package.json pnpm-lock.yaml src/types/cos-js-sdk-v5.d.ts
git commit -m "chore: add cos-js-sdk-v5 for direct cos upload from uniapp client"
```

---

## Task 7: 前端 `src/api/cos-credentials.ts`(拉 STS 凭证)

**Files:**

- Create: `frontend_uniapp/src/api/cos-credentials.ts`

- [ ] **Step 1: 写失败测试**

Create `frontend_uniapp/src/api/cos-credentials.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { tokenStoreStub, fetchMock } = vi.hoisted(() => ({
    tokenStoreStub: {
        updateNowTime: () => tokenStoreStub,
        validToken: "fake-token-123",
    },
    fetchMock: vi.fn(),
}));

vi.mock("@/store/token", () => ({
    useTokenStore: () => tokenStoreStub,
}));
vi.mock("@/utils", async () => ({
    getEnvBaseUrl: () => "http://localhost:3000",
}));

global.fetch = fetchMock as unknown as typeof fetch;

import { fetchCosCredentials } from "@/api/cos-credentials";

beforeEach(() => {
    fetchMock.mockReset();
});

describe("api/cos-credentials", () => {
    it("GETs /api/upload/cos-credentials with Bearer token", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => ({
                code: 200,
                data: {
                    userId: "u-abc",
                    secretId: "tmpSid",
                    secretKey: "tmpSkey",
                    sessionToken: "tok",
                    startTime: 1,
                    expiredTime: 2,
                    bucket: "b-1",
                    region: "ap-shanghai",
                    keyPrefix: "uploads",
                    publicBaseUrl: "https://cdn.example.com",
                },
                message: "ok",
            }),
        });
        const result = await fetchCosCredentials();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe("http://localhost:3000/api/upload/cos-credentials");
        expect(init.method).toBe("GET");
        expect(init.headers.Authorization).toBe("Bearer fake-token-123");
        expect(result.bucket).toBe("b-1");
        expect(result.sessionToken).toBe("tok");
    });

    it("throws when not logged in (no token)", async () => {
        tokenStoreStub.validToken = "";
        await expect(fetchCosCredentials()).rejects.toThrow(/未登录|token|auth/i);
        tokenStoreStub.validToken = "fake-token-123";
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("throws on HTTP error with server message", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: false,
            status: 500,
            json: async () => ({ code: 500, message: "sts down", data: null }),
        });
        await expect(fetchCosCredentials()).rejects.toThrow(/sts down/);
    });

    it("throws on non-JSON response", async () => {
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => {
                throw new Error("bad json");
            },
        });
        await expect(fetchCosCredentials()).rejects.toThrow();
    });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run(在 `frontend_uniapp/`):

```bash
node node_modules/vitest/vitest.mjs run src/api/cos-credentials.test.ts
```

Expected: FAIL — `Failed to resolve import "@/api/cos-credentials"`。

- [ ] **Step 3: 实现 `src/api/cos-credentials.ts`**

Create `frontend_uniapp/src/api/cos-credentials.ts`:

```ts
import { useTokenStore } from "@/store/token";
import { getEnvBaseUrl } from "@/utils";

/** 与后端 CosCredentials 对齐(见 admin/lib/cos/sts.ts) */
export interface CosCredentials {
    /** 当前用户 ID(用于构造 scope 内的 key) */
    userId: string;
    secretId: string;
    secretKey: string;
    sessionToken: string;
    /** Unix 秒 */
    startTime: number;
    /** Unix 秒 */
    expiredTime: number;
    bucket: string;
    region: string;
    keyPrefix: string;
    publicBaseUrl: string;
}

interface IResponse<T> {
    code: number;
    data: T;
    message: string;
}

/**
 * 向后端请求 scoped STS 凭证(供 cos-js-sdk-v5 直传)。
 *
 * - 走 `getEnvBaseUrl()` + `useTokenStore().validToken` 的标准鉴权模式
 * - 失败抛 Error(调用方决定是否重试/降级到 uploadFile)
 */
export async function fetchCosCredentials(): Promise<CosCredentials> {
    const baseUrl = getEnvBaseUrl();
    const tokenStore = useTokenStore();
    const token = tokenStore.updateNowTime().validToken;
    if (!token) {
        throw new Error("未登录或登录已过期,无法获取 COS 凭证");
    }

    let res: Response;
    try {
        res = await fetch(`${baseUrl}/api/upload/cos-credentials`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
    } catch (e) {
        throw new Error(`网络异常: ${e instanceof Error ? e.message : String(e)}`);
    }

    let body: IResponse<CosCredentials> | null = null;
    try {
        body = (await res.json()) as IResponse<CosCredentials>;
    } catch {
        throw new Error(`服务器返回非 JSON: ${res.status}`);
    }

    if (!res.ok || body.code !== 200) {
        const msg = body?.message || `HTTP ${res.status}`;
        throw new Error(msg);
    }
    if (!body.data) {
        throw new Error("COS 凭证为空");
    }
    return body.data;
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run:

```bash
node node_modules/vitest/vitest.mjs run src/api/cos-credentials.test.ts
```

Expected: PASS(4 个用例)。

- [ ] **Step 5: Commit**

```bash
cd frontend_uniapp
git add src/api/cos-credentials.ts src/api/cos-credentials.test.ts
git commit -m "feat(api): fetch scoped cos credentials from backend"
```

---

## Task 8: 前端 `src/utils/cos-key.ts`(构造对象 key)

**Files:**

- Create: `frontend_uniapp/src/utils/cos-key.ts`
- Create: `frontend_uniapp/src/utils/cos-key.test.ts`

- [ ] **Step 1: 写失败测试**

Create `frontend_uniapp/src/utils/cos-key.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { buildCosObjectKey, buildCosPublicUrl } from "@/utils/cos-key";

// 固定时间,避免测试因时间漂移失败
vi.useFakeTimers().setSystemTime(new Date("2026-08-17T03:30:00Z"));

describe("utils/cos-key", () => {
    it("buildCosObjectKey returns <prefix>/<userId>/<yyyy>/<mm>/<uuid>.<ext>", () => {
        const key = buildCosObjectKey({
            keyPrefix: "uploads",
            userId: "u-abc",
            mimeType: "image/png",
            originalName: "avatar.PNG",
        });
        expect(key).toMatch(/^uploads\/u-abc\/2026\/08\/[a-f0-9-]{36}\.png$/);
    });

    it("uses .jpg for image/jpeg regardless of originalName", () => {
        const key = buildCosObjectKey({
            keyPrefix: "uploads",
            userId: "u-1",
            mimeType: "image/jpeg",
            originalName: "photo.txt",
        });
        expect(key.endsWith(".jpg")).toBe(true);
    });

    it("falls back to .bin when MIME unknown", () => {
        const key = buildCosObjectKey({
            keyPrefix: "uploads",
            userId: "u-1",
            mimeType: "application/octet-stream",
            originalName: "x.exe",
        });
        expect(key.endsWith(".bin")).toBe(true);
    });

    it("omits prefix segment when keyPrefix is empty", () => {
        const key = buildCosObjectKey({
            keyPrefix: "",
            userId: "u-1",
            mimeType: "image/png",
            originalName: "a.png",
        });
        expect(key).toMatch(/^u-1\/2026\/08\/[a-f0-9-]{36}\.png$/);
    });

    it("buildCosPublicUrl joins publicBaseUrl + key with single slash", () => {
        const url = buildCosPublicUrl("https://cdn.example.com", "uploads/u-1/2026/08/abc.png");
        expect(url).toBe("https://cdn.example.com/uploads/u-1/2026/08/abc.png");
    });

    it("buildCosPublicUrl tolerates trailing slash in publicBaseUrl", () => {
        const url = buildCosPublicUrl("https://cdn.example.com/", "uploads/u-1/x.png");
        expect(url).toBe("https://cdn.example.com/uploads/u-1/x.png");
    });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run:

```bash
node node_modules/vitest/vitest.mjs run src/utils/cos-key.test.ts
```

Expected: FAIL — `Failed to resolve import "@/utils/cos-key"`。

- [ ] **Step 3: 实现 `src/utils/cos-key.ts`**

Create `frontend_uniapp/src/utils/cos-key.ts`:

```ts
/**
 * 构造 COS 对象 key 与公开 URL(纯函数,可单测,与 SDK 解耦)。
 *
 * key 形如:`<keyPrefix>/<userId>/<yyyy>/<mm>/<uuid>.<ext>`
 * 与后端 STS scope `<keyPrefix>/<userId>/*` 严格对齐,否则上传会被 COS 拒绝。
 */

/** MIME → 扩展名(权威,避免扩展名/MIME 不一致) */
const MIME_TO_EXT: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "text/csv": ".csv",
    "text/markdown": ".md",
    "application/zip": ".zip",
    "application/x-zip-compressed": ".zip",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/wav": ".wav",
    "audio/ogg": ".ogg",
    "audio/webm": ".webm",
    "audio/flac": ".flac",
    "audio/aac": ".aac",
};

/** 允许的扩展名白名单(兜底,从 originalName 推断) */
const ALLOWED_EXTS = [
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".gif",
    ".pdf",
    ".txt",
    ".csv",
    ".md",
    ".zip",
    ".mp4",
    ".webm",
    ".mov",
    ".mp3",
    ".m4a",
    ".wav",
    ".ogg",
    ".flac",
    ".aac",
];

/** 推断扩展名:优先 MIME,兜底 filename,再不行 .bin */
export function pickExt(mimeType: string, originalName: string): string {
    const fromMime = MIME_TO_EXT[mimeType];
    if (fromMime) return fromMime;
    const lower = originalName.toLowerCase();
    for (const ext of ALLOWED_EXTS) {
        if (lower.endsWith(ext)) return ext;
    }
    return ".bin";
}

/** 生成 RFC4122 v4 UUID(浏览器/小程序通用,基于 crypto.getRandomValues) */
function uuid(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    // 兜底:手动拼(微信小程序老版本无 crypto.randomUUID)
    const bytes = new Uint8Array(16);
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
        crypto.getRandomValues(bytes);
    } else {
        for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0"));
    return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

export interface BuildKeyInput {
    keyPrefix: string;
    userId: string;
    mimeType: string;
    originalName: string;
}

/**
 * 构造对象 key:`<keyPrefix>/<userId>/<yyyy>/<mm>/<uuid>.<ext>`
 * - yyyy/mm 用 UTC(与后端 LocalDriver 对齐)
 * - keyPrefix 为空时不带前缀段
 */
export function buildCosObjectKey(input: BuildKeyInput): string {
    const now = new Date();
    const yyyy = String(now.getUTCFullYear());
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const ext = pickExt(input.mimeType, input.originalName);
    const fileName = `${uuid()}${ext}`;
    const segs = [input.keyPrefix, input.userId, yyyy, mm, fileName].filter(Boolean);
    return segs.join("/");
}

/**
 * 构造公开访问 URL:`<publicBaseUrl>/<key>`(保证单斜杠)。
 */
export function buildCosPublicUrl(publicBaseUrl: string, key: string): string {
    const base = publicBaseUrl.replace(/\/+$/, "");
    return `${base}/${key.replace(/^\/+/, "")}`;
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run:

```bash
node node_modules/vitest/vitest.mjs run src/utils/cos-key.test.ts
```

Expected: PASS(6 个用例)。

- [ ] **Step 5: Commit**

```bash
cd frontend_uniapp
git add src/utils/cos-key.ts src/utils/cos-key.test.ts
git commit -m "feat(cos): build cos object key and public url"
```

---

## Task 9: 前端 `src/utils/cos-client.ts`(COS SDK 单例 + 凭证缓存)

**Files:**

- Create: `frontend_uniapp/src/utils/cos-client.ts`
- Create: `frontend_uniapp/src/utils/cos-client.test.ts`

- [ ] **Step 1: 写失败测试**

Create `frontend_uniapp/src/utils/cos-client.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const { CosCtor, putObjectMock, uploadFileMock } = vi.hoisted(() => ({
    CosCtor: vi.fn(),
    putObjectMock: vi.fn(),
    uploadFileMock: vi.fn(),
}));

vi.mock("cos-js-sdk-v5", () => ({
    default: vi.fn().mockImplementation(() => ({
        putObject: putObjectMock,
        uploadFile: uploadFileMock,
    })),
}));

import { getCosClient, __resetCosClientForTest } from "@/utils/cos-client";

beforeEach(() => {
    CosCtor.mockClear();
    putObjectMock.mockReset();
    uploadFileMock.mockReset();
    __resetCosClientForTest();
});

describe("utils/cos-client", () => {
    it("constructs COS instance with STS creds + session token", async () => {
        putObjectMock.mockResolvedValue({ statusCode: 200 });
        const creds = {
            userId: "u-abc",
            secretId: "tmpSid",
            secretKey: "tmpSkey",
            sessionToken: "tok",
            startTime: 1,
            expiredTime: 2,
            bucket: "b-1",
            region: "ap-shanghai",
            keyPrefix: "uploads",
            publicBaseUrl: "https://cdn.example.com",
        };
        await getCosClient(creds);
        const { default: COS } = await import("cos-js-sdk-v5");
        expect(COS).toHaveBeenCalledWith({
            SecretId: "tmpSid",
            SecretKey: "tmpSkey",
            SecurityToken: "tok",
        });
    });

    it("reuses cached instance when same creds passed", async () => {
        putObjectMock.mockResolvedValue({ statusCode: 200 });
        const creds = {
            userId: "u-1",
            secretId: "s1",
            secretKey: "k1",
            sessionToken: "t1",
            startTime: 1,
            expiredTime: 2,
            bucket: "b",
            region: "r",
            keyPrefix: "p",
            publicBaseUrl: "u",
        };
        await getCosClient(creds);
        await getCosClient(creds);
        const { default: COS } = await import("cos-js-sdk-v5");
        // 同一凭证只构造一次
        expect(COS).toHaveBeenCalledTimes(1);
    });

    it("reconstructs when secretId changes (creds refreshed)", async () => {
        putObjectMock.mockResolvedValue({ statusCode: 200 });
        await getCosClient({
            userId: "u-1",
            secretId: "s1",
            secretKey: "k1",
            sessionToken: "t1",
            startTime: 1,
            expiredTime: 2,
            bucket: "b",
            region: "r",
            keyPrefix: "p",
            publicBaseUrl: "u",
        });
        await getCosClient({
            userId: "u-1",
            secretId: "s2",
            secretKey: "k2",
            sessionToken: "t2",
            startTime: 3,
            expiredTime: 4,
            bucket: "b",
            region: "r",
            keyPrefix: "p",
            publicBaseUrl: "u",
        });
        const { default: COS } = await import("cos-js-sdk-v5");
        expect(COS).toHaveBeenCalledTimes(2);
    });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run:

```bash
node node_modules/vitest/vitest.mjs run src/utils/cos-client.test.ts
```

Expected: FAIL — `Failed to resolve import "@/utils/cos-client"`。

- [ ] **Step 3: 实现 `src/utils/cos-client.ts`**

Create `frontend_uniapp/src/utils/cos-client.ts`:

```ts
import COS from "cos-js-sdk-v5";

import type { CosCredentials } from "@/api/cos-credentials";

/**
 * COS SDK 单例管理(按凭证缓存)。
 *
 * 设计:
 * - 凭证由后端签发,带 30 分钟 TTL
 * - 同一凭证(secretId 相同)复用同一个 COS 实例
 * - 凭证刷新(secretId 变化)时重建实例
 * - 不在这里做"到期前 5 分钟预刷新"(留给 uploadFileToCos 决策,本模块只做缓存)
 */

interface CachedClient {
    secretId: string;
    client: COS;
}

let _cached: CachedClient | null = null;

/**
 * 返回与给定凭证绑定的 COS 实例。若凭证与缓存一致则复用,否则重建。
 */
export function getCosClient(creds: CosCredentials): COS {
    if (_cached && _cached.secretId === creds.secretId) {
        return _cached.client;
    }
    const client = new COS({
        SecretId: creds.secretId,
        SecretKey: creds.secretKey,
        SecurityToken: creds.sessionToken,
    });
    _cached = { secretId: creds.secretId, client };
    return client;
}

/** 测试钩子:重置缓存 */
export function __resetCosClientForTest(): void {
    _cached = null;
}
```

- [ ] **Step 4: 运行测试,确认通过**

Run:

```bash
node node_modules/vitest/vitest.mjs run src/utils/cos-client.test.ts
```

Expected: PASS(3 个用例)。

- [ ] **Step 5: Commit**

```bash
cd frontend_uniapp
git add src/utils/cos-client.ts src/utils/cos-client.test.ts
git commit -m "feat(cos): manage cos-js-sdk-v5 client with credential cache"
```

---

## Task 10: 前端 `src/api/upload.ts` 新增 `uploadFileToCos`

**Files:**

- Modify: `frontend_uniapp/src/api/upload.ts`

- [ ] **Step 1: 写失败测试**

Create `frontend_uniapp/src/api/upload-cos.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * uploadFileToCos 测试:mock fetchCosCredentials + cos-client + cos-key。
 *
 * 验证:
 * - H5 端(input.file 为 File):调 cos.putObject({ Body: File })
 * - 微信小程序端(input.file 为 tempFilePath):调 cos.uploadFile({ FilePath })
 * - 返回 UploadResult 形状与现有 uploadFile 一致
 * - 凭证过期前 5 分钟自动重新拉取
 */

const { fetchCredsMock, getCosClientMock, putObjectMock, uploadFileMock } = vi.hoisted(() => ({
    fetchCredsMock: vi.fn(),
    getCosClientMock: vi.fn(),
    putObjectMock: vi.fn(),
    uploadFileMock: vi.fn(),
}));

vi.mock("@/api/cos-credentials", () => ({
    fetchCosCredentials: fetchCredsMock,
}));
vi.mock("@/utils/cos-client", () => ({
    getCosClient: getCosClientMock,
}));
vi.mock("@/utils", async () => ({
    // 提供 isH5 等可能被引用的工具(若 upload.ts 不引用则不影响)
    getEnvBaseUrl: () => "http://localhost:3000",
}));

import { uploadFileToCos } from "@/api/upload";
import type { UploadResult } from "@/api/upload";

const STUB_CREDS = {
    userId: "u-abc",
    secretId: "s1",
    secretKey: "k1",
    sessionToken: "t1",
    startTime: Math.floor(Date.now() / 1000),
    expiredTime: Math.floor(Date.now() / 1000) + 1800,
    bucket: "b-1",
    region: "ap-shanghai",
    keyPrefix: "uploads",
    publicBaseUrl: "https://cdn.example.com",
};

beforeEach(() => {
    fetchCredsMock.mockReset();
    getCosClientMock.mockReset();
    putObjectMock.mockReset();
    uploadFileMock.mockReset();
    fetchCredsMock.mockResolvedValue(STUB_CREDS);
    getCosClientMock.mockReturnValue({
        putObject: putObjectMock,
        uploadFile: uploadFileMock,
    });
    putObjectMock.mockResolvedValue({ statusCode: 200 });
    uploadFileMock.mockResolvedValue({ statusCode: 200 });
});

describe("api/upload.uploadFileToCos", () => {
    it("rejects when file is undefined/null", async () => {
        await expect(uploadFileToCos({ file: "" as unknown as File })).rejects.toThrow(/file/i);
    });

    it("H5 path: uses cos.putObject with Body=File and returns UploadResult", async () => {
        // 模拟 H5:传 File 对象
        const blob = new Blob(["x"], { type: "image/png" });
        const file = new File([blob], "avatar.png", { type: "image/png" });
        const result = await uploadFileToCos({ file, purpose: "avatar" });
        expect(putObjectMock).toHaveBeenCalledTimes(1);
        const params = putObjectMock.mock.calls[0]?.[0];
        expect(params.Bucket).toBe("b-1");
        expect(params.Region).toBe("ap-shanghai");
        expect(params.Key).toMatch(/^uploads\/[^/]+\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.png$/);
        expect(params.Body).toBe(file);
        expect(params.ContentType).toBe("image/png");
        expect(result.url).toBe(`https://cdn.example.com/${params.Key}`);
        expect(result.key).toBe(params.Key);
        expect(result.size).toBe(file.size);
        expect(result.mimeType).toBe("image/png");
        expect(result.originalName).toBe("avatar.png");
    });

    it("wx path: uses cos.uploadFile with FilePath when file is string", async () => {
        // 模拟微信小程序:传 tempFilePath 字符串
        const tempPath = "wx://tmp/abc.png";
        const result = await uploadFileToCos({
            file: tempPath,
            name: "avatar.png",
            purpose: "avatar",
        });
        expect(uploadFileMock).toHaveBeenCalledTimes(1);
        expect(putObjectMock).not.toHaveBeenCalled();
        const params = uploadFileMock.mock.calls[0]?.[0];
        expect(params.Bucket).toBe("b-1");
        expect(params.FilePath).toBe(tempPath);
        expect(params.ContentType).toBe("image/png");
        expect(result.url).toBe(`https://cdn.example.com/${params.Key}`);
    });

    it("refreshes credentials when expiredTime is within 5 min", async () => {
        // 第一次:凭证快过期(< 5 min)
        const almostExpired = {
            ...STUB_CREDS,
            secretId: "s-old",
            startTime: Math.floor(Date.now() / 1000) - 1700,
            expiredTime: Math.floor(Date.now() / 1000) + 60, // 1 min 后过期
        };
        fetchCredsMock.mockResolvedValueOnce(almostExpired);
        fetchCredsMock.mockResolvedValueOnce(STUB_CREDS); // 刷新后的新凭证
        // putObject 用新 client(通过 getCosClient 重建)
        getCosClientMock.mockReturnValueOnce({
            putObject: putObjectMock,
            uploadFile: uploadFileMock,
        });
        const blob = new Blob(["x"], { type: "image/png" });
        const file = new File([blob], "a.png", { type: "image/png" });
        await uploadFileToCos({ file, purpose: "avatar" });
        // 凭证过期前应重新拉取
        expect(fetchCredsMock).toHaveBeenCalledTimes(2);
    });

    it("propagates cos putObject errors", async () => {
        putObjectMock.mockRejectedValue(new Error("cos 403"));
        const blob = new Blob(["x"], { type: "image/png" });
        const file = new File([blob], "a.png", { type: "image/png" });
        await expect(uploadFileToCos({ file, purpose: "avatar" })).rejects.toThrow(/cos 403/);
    });
});
```

- [ ] **Step 2: 运行测试,确认失败**

Run:

```bash
node node_modules/vitest/vitest.mjs run src/api/upload-cos.test.ts
```

Expected: FAIL — `uploadFileToCos is not a function`(尚未在 `src/api/upload.ts` 中导出)。

- [ ] **Step 3: 在 `src/api/upload.ts` 追加 `uploadFileToCos`**

在 `frontend_uniapp/src/api/upload.ts` 文件末尾追加(不修改现有 `uploadFile` / `uploadWx` / `uploadH5`):

```ts
// ============================================================================
// 直传腾讯云 COS(新增;现有 uploadFile 走后端,保留为回退)
// ============================================================================

import { fetchCosCredentials, type CosCredentials } from "@/api/cos-credentials";
import { getCosClient } from "@/utils/cos-client";
import { buildCosObjectKey, buildCosPublicUrl } from "@/utils/cos-key";

/** 凭证提前刷新阈值:到期前 5 分钟视为失效 */
const CREDS_REFRESH_THRESHOLD_SECONDS = 300;

let _cachedCreds: CosCredentials | null = null;

/** 凭证是否需要刷新(null / 过期 / 即将过期) */
function needsRefresh(creds: CosCredentials | null, nowSeconds: number): boolean {
    if (!creds) return true;
    return creds.expiredTime - nowSeconds <= CREDS_REFRESH_THRESHOLD_SECONDS;
}

/** 取(可能刷新的)凭证;若刷新则更新缓存 */
async function getValidCreds(): Promise<CosCredentials> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!needsRefresh(_cachedCreds, nowSeconds)) {
        return _cachedCreds!;
    }
    const fresh = await fetchCosCredentials();
    _cachedCreds = fresh;
    return fresh;
}

/** 微信小程序端:用 uni.getFileInfo 拿真实文件大小(H5 直接用 File.size) */
function getWxFileSize(filePath: string): Promise<number> {
    return new Promise((resolve) => {
        uni.getFileInfo({
            filePath,
            success: (res) => resolve(res.size ?? 0),
            // 失败不阻断上传,回退到 0
            fail: () => resolve(0),
        });
    });
}

/**
 * 直传腾讯云 COS(跨平台自动路由)。
 *
 * - **H5**(`input.file` 为 `File`):走 `cos.putObject({ Body: File })`
 * - **微信小程序**(`input.file` 为 `tempFilePath` 字符串):走 `cos.uploadFile({ FilePath })`
 *
 * 返回的 `UploadResult` 与 `uploadFile` 形状一致,调用方可平滑切换。
 *
 * 凭证由后端 `GET /api/upload/cos-credentials` 签发(scope=`uploads/<userId>/*`),
 * 客户端做内存级缓存,到期前 5 分钟自动刷新。
 */
export async function uploadFileToCos(input: UploadInput): Promise<UploadResult> {
    if (!input.file) {
        throw new Error("file is required");
    }

    const creds = await getValidCreds();
    const client = getCosClient(creds);

    // H5: input.file 是 File;微信小程序: input.file 是 tempFilePath 字符串
    const isH5File = input.file instanceof File;
    const mimeType = isH5File ? input.file.type : guessMimeFromName(input.name ?? "");
    const originalName = isH5File ? input.file.name : (input.name ?? "upload.bin");
    const key = buildCosObjectKey({
        keyPrefix: creds.keyPrefix,
        userId: creds.userId,
        mimeType,
        originalName,
    });

    try {
        if (isH5File) {
            // H5:走 putObject,Body 直接传 File
            await client.putObject({
                Bucket: creds.bucket,
                Region: creds.region,
                Key: key,
                Body: input.file as File,
                ContentType: mimeType,
            });
        } else {
            // 微信小程序:走 uploadFile(multipart),FilePath 是 tempFilePath
            await client.uploadFile({
                Bucket: creds.bucket,
                Region: creds.region,
                Key: key,
                FilePath: input.file as string,
                FileName: originalName,
                ContentType: mimeType,
            });
        }
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`COS 上传失败: ${msg}`);
    }

    const size = isH5File ? (input.file as File).size : await getWxFileSize(input.file as string);
    return {
        url: buildCosPublicUrl(creds.publicBaseUrl, key),
        key,
        size,
        mimeType,
        originalName,
    };
}

/** 从文件名粗略推断 MIME(微信小程序 tempFilePath 没有内置 MIME) */
function guessMimeFromName(name: string): string {
    const lower = name.toLowerCase();
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".pdf")) return "application/pdf";
    if (lower.endsWith(".mp4")) return "video/mp4";
    if (lower.endsWith(".mp3")) return "audio/mpeg";
    return "application/octet-stream";
}
```

注:测试中 `uni.getFileInfo` 走 `test-setup.ts` 里 mock 的 `uni` 全局对象(若未 mock,在 `beforeEach` 加 `vi.spyOn(uni, "getFileInfo").mockResolvedValue({ size: 0 })` 或在 wx-path 测试用例里 mock);若 `test-setup.ts` 未提供 `getFileInfo`,在测试文件顶部追加:

```ts
beforeEach(() => {
    // 给 uni.getFileInfo 一个默认 mock(被 wx path 调用)
    (uni as unknown as { getFileInfo: unknown }).getFileInfo = vi.fn(
        ({ success }: { success: (r: { size: number }) => void }) => success({ size: 0 }),
    );
});
```

- [ ] **Step 4: 运行所有相关测试,确认通过**

Run(在 `frontend_uniapp/`):

```bash
node node_modules/vitest/vitest.mjs run src/api/upload-cos.test.ts src/api/cos-credentials.test.ts src/utils/cos-key.test.ts src/utils/cos-client.test.ts
```

Expected: PASS。

Run(在 `admin/`):

```bash
node node_modules/vitest/vitest.mjs run tests/unit/lib/cos tests/integration/api/upload/cos-credentials.test.ts
```

Expected: PASS(后端 userId 字段已在 Task 3 引入,无回归)。

- [ ] **Step 5: Lint + 类型检查(两端)**

Run(在 `frontend_uniapp/`):

```bash
node node_modules/eslint/bin/eslint.js src/api/upload.ts src/utils/cos-client.ts src/utils/cos-key.ts src/api/cos-credentials.ts
node node_modules/typescript/bin/tsc --noEmit
```

Run(在 `admin/`):

```bash
node node_modules/eslint/bin/eslint.js lib/cos/sts.ts tests/unit/lib/cos/sts.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

Expected: 无错误。

- [ ] **Step 6: Commit(仅前端)**

```bash
cd frontend_uniapp
git add src/api/upload.ts src/api/upload-cos.test.ts
git commit -m "feat(upload): add uploadFileToCos for direct cos upload with credential caching"
```

---

## Task 11: 迁移调用方之一 — `create-circle.vue`

**Files:**

- Modify: `frontend_uniapp/src/pages/create-circle/create-circle.vue`

- [ ] **Step 1: 改 import 与调用名**

Edit `frontend_uniapp/src/pages/create-circle/create-circle.vue`:

- 第 5 行 `import { uploadFile } from "@/api/upload"` 改为:

```ts
import { uploadFileToCos } from "@/api/upload";
```

- 第 179 行 `const result = await uploadFile({ file, name, purpose: "generic" })` 改为:

```ts
const result = await uploadFileToCos({ file, name, purpose: "generic" });
```

- [ ] **Step 2: 类型检查 + lint**

Run(在 `frontend_uniapp/`):

```bash
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/pages/create-circle/create-circle.vue
```

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
cd frontend_uniapp
git add src/pages/create-circle/create-circle.vue
git commit -m "refactor(create-circle): switch cover upload to direct cos"
```

---

## Task 12: 迁移调用方之二 — `profile.vue`

**Files:**

- Modify: `frontend_uniapp/src/pages/profile/profile.vue`

- [ ] **Step 1: 改 import 与调用名**

Edit `frontend_uniapp/src/pages/profile/profile.vue`:

- 第 6 行 `import { uploadFile } from "@/api/upload"` 改为:

```ts
import { uploadFileToCos } from "@/api/upload";
```

- 第 123 行 `const { url } = await uploadFile({ file, name: filename, purpose: "avatar" })` 改为:

```ts
const { url } = await uploadFileToCos({ file, name: filename, purpose: "avatar" });
```

- [ ] **Step 2: 类型检查 + lint**

Run(在 `frontend_uniapp/`):

```bash
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/pages/profile/profile.vue
```

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
cd frontend_uniapp
git add src/pages/profile/profile.vue
git commit -m "refactor(profile): switch avatar upload to direct cos"
```

---

## Task 13: 迁移调用方之三 — `teacher-certification.vue`

**Files:**

- Modify: `frontend_uniapp/src/pages/teacher-certification/teacher-certification.vue`

- [ ] **Step 1: 改 import 与调用名(两处调用)**

Edit `frontend_uniapp/src/pages/teacher-certification/teacher-certification.vue`:

- 第 4 行 `import { uploadFile } from "@/api/upload"` 改为:

```ts
import { uploadFileToCos } from "@/api/upload";
```

- 第 117 行 `const result = await uploadFile({ file, name, purpose: "generic" })` 改为:

```ts
const result = await uploadFileToCos({ file, name, purpose: "generic" });
```

- 第 172 行 `const result = await uploadFile({ file, name, purpose: "generic" })` 改为:

```ts
const result = await uploadFileToCos({ file, name, purpose: "generic" });
```

- [ ] **Step 2: 类型检查 + lint**

Run(在 `frontend_uniapp/`):

```bash
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js src/pages/teacher-certification/teacher-certification.vue
```

Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
cd frontend_uniapp
git add src/pages/teacher-certification/teacher-certification.vue
git commit -m "refactor(teacher-certification): switch cert upload to direct cos"
```

---

## Task 14: 全量质量门禁 + 端到端冒烟

**Files:** (无新文件)

- [ ] **Step 1: 后端全量 lint + 类型 + unit + integration**

Run(在 `admin/`):

```bash
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
```

Expected: 全绿。

- [ ] **Step 2: 前端全量 lint + 类型 + unit**

Run(在 `frontend_uniapp/`):

```bash
node node_modules/eslint/bin/eslint.js .
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run
```

Expected: 全绿。

- [ ] **Step 3: H5 端冒烟(需要真实 COS 配置,手动)**

在 `admin/.env` 配置真实 COS:

```env
COS_SECRET_ID="..."
COS_SECRET_KEY="..."
COS_BUCKET="frenqency-1234567890"
COS_REGION="ap-shanghai"
COS_PUBLIC_BASE_URL="https://frenqency-1234567890.cos.ap-shanghai.myqcloud.com"
COS_KEY_PREFIX="uploads"
COS_STS_DURATION_SECONDS="1800"
```

启动后端 `pnpm dev`(在 `admin/`),启动前端 H5 `pnpm dev:h5`(在 `frontend_uniapp/`)。

在浏览器登录,打开「个人资料」页 → 改头像,选一张 PNG。

Expected:

- Network 面板看到 `GET /api/upload/cos-credentials` 200,响应含 `secretId/sessionToken/bucket/region/keyPrefix/publicBaseUrl/userId`
- 紧接一个 `PUT https://frenqency-xxx.cos.ap-shanghai.myqcloud.com/uploads/<userId>/2026/08/<uuid>.png` 200(由 `cos.putObject` 发出)
- 头像 UI 更新为新 URL,COS 控制台可见该 Object

- [ ] **Step 4: 微信小程序端冒烟(手动)**

在 `frontend_uniapp/` 执行 `pnpm dev:mp-weixin`,在微信开发者工具打开。

去 `mp.weixin.qq.com` → 开发管理 → 服务器域名,把 `COS_PUBLIC_BASE_URL` 域名 + 后端 API 域名加入 `request` 与 `uploadFile` 合法域名(开发期可在开发者工具关闭「域名校验」临时跳过)。

登录后进「创建圈子」→ 选封面图。

Expected:

- Network 面板看到 `GET /api/upload/cos-credentials` 200
- 看到一次 `POST https://frenqency-xxx.cos.ap-shanghai.myqcloud.com/`(multipart,由 `cos.uploadFile` 发出,内含 `key`/`policy`/`x-cos-*` form fields)200
- 封面预览为新 URL,COS 控制台可见该 Object

- [ ] **Step 5: 回退通道验证(本地 uploadFile 仍可用)**

临时把任一调用方的 `uploadFileToCos` 改回 `uploadFile`(用 git 临时改一个文件验证),确认 `POST /api/upload` 本地路径仍工作:

```bash
cd frontend_uniapp
# 临时改回一个调用方做验证
git stash
# 在 src/pages/profile/profile.vue 手动把 uploadFileToCos 改回 uploadFile
# 跑一次上传,确认本地落盘正常
# 然后回滚:
git checkout src/pages/profile/profile.vue
git stash pop
```

Expected: `POST /api/upload` 200,文件出现在 `admin/public/uploads/<yyyy>/<mm>/<uuid>.<ext>`,验证后端本地上传通道未受影响。

- [ ] **Step 6: 最终提交(若有未提交回退)**

```bash
cd frontend_uniapp
git status
# 若有未提交改动:
git add -A
git commit -m "chore: verify cos/local fallback end-to-end"
```

---

## Spec Coverage 自检

| 需求                                               | 任务                                                                                   |
| -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 保留现有本地上传方法(后端 `POST /api/upload` 不动) | 全程未修改 `app/api/upload/route.ts` 与 `lib/storage/local.ts`;Task 14 Step 5 验证回退 |
| uniapp 客户端直传腾讯云 COS                        | Task 6(SDK) + Task 9(客户端门面) + Task 10(uploadFileToCos)                            |
| 后端不传输文件,只签发凭证                          | Task 1-4(`lib/cos/` + `GET /api/upload/cos-credentials`)                               |
| 按用户隔离(用户 A 不能写用户 B 的文件)             | Task 3 STS scope=`uploads/<userId>/*` + userId 安全校验                                |
| 跨平台(H5 + 微信小程序)                            | Task 10 `uploadFileToCos` 分支(`putObject` vs `uploadFile`)                            |
| 现有 3 个调用方迁移                                | Task 11/12/13                                                                          |
| 现有 `uploadFile` 保留为回退                       | Task 10 仅新增,不删除;Task 14 Step 5 验证                                              |
| 文档同步                                           | Task 5(env + AGENTS.md)                                                                |
| 测试覆盖                                           | Task 2/3/4/7/8/9/10 各步含 TDD 测试                                                    |

## 风险与回退

- **回退方案**:任一调用方失败,把该文件的 `uploadFileToCos` 改回 `uploadFile` 即可瞬间回退到本地上传;后端完全不受影响。
- **SDK 体积**:`cos-js-sdk-v5` 压缩后 ~80KB;微信小程序主包 2MB 上限需注意。若超限,可改用分包加载或换 `cos-wx-sdk-v5`(微信专用,体积更小)。
- **微信小程序域名白名单**:发布前必须把 `COS_PUBLIC_BASE_URL` 域名加入 `uploadFile` 合法域名,否则真机上传会被拒。开发期可在微信开发者工具关闭「不校验合法域名」临时跳过。
- **STS 凭证泄漏**:凭证 scope 严格限定到 `uploads/<userId>/*` 且 TTL 30 min,即使泄漏也只能在该用户自己的目录下 PutObject,影响有限。生产建议进一步限定 TTL 到 5-10 分钟(`COS_STS_DURATION_SECONDS=600`)。
- **CORS**:H5 端 `cos.putObject` 跨域 PUT 需在 COS Bucket 的跨域 CORS 配置里允许 `Origin`/`PUT`/`Content-Type` 等头。配置位置:腾讯云 COS 控制台 → Bucket → 安全管理 → 跨域访问 CORS 设置。
- **历史数据**:迁移后旧 `users.avatarUrl` 等仍指向本地 `/uploads/...`;若需迁移历史文件到 COS,属独立任务(本计划不覆盖)。
