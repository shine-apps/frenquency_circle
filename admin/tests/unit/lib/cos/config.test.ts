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

    it("falls back to bucket default domain when COS_PUBLIC_BASE_URL missing", () => {
        delete process.env.COS_PUBLIC_BASE_URL;
        expect(resolveCosConfig().publicBaseUrl).toBe(
            "https://frenqency-1234567890.cos.ap-shanghai.myqcloud.com",
        );
    });

    it("prefers COS_PUBLIC_BASE_URL over bucket default domain", () => {
        process.env.COS_PUBLIC_BASE_URL = "https://cdn.example.com/";
        const cfg = resolveCosConfig();
        expect(cfg.publicBaseUrl).toBe("https://cdn.example.com");
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
