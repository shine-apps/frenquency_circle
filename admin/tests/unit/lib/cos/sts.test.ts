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
    // 模拟真实 SDK 的 getPolicy 行为:接收 ScopeItem[],返回 PolicyDescription
    // 参考 admin/node_modules/qcloud-cos-sts/sdk/sts.js 中 getPolicy 的实现
    getPolicy: (scope: unknown) => {
        const items = scope as Array<{
            action: string;
            bucket: string;
            region: string;
            prefix: string;
        }>;
        const statement = items.map((item) => {
            const action = item.action || "";
            const bucket = item.bucket || "";
            const region = item.region || "";
            const shortBucketName = bucket.substring(0, bucket.lastIndexOf("-"));
            const appId = bucket.substring(1 + bucket.lastIndexOf("-"));
            const resource =
                `qcs::cos:${region}:uid/${appId}:prefix//${appId}/${shortBucketName}/${item.prefix}`;
            return {
                action,
                effect: "allow" as const,
                principal: { qcs: "*" as const },
                resource,
            };
        });
        return { version: "2.0" as const, statement };
    },
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
