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
    const policy = getPolicy([
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
        getCredential(
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
