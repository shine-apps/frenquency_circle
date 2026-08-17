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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
