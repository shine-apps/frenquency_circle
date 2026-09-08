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
 * 客户端直传所需的动作集合。
 *
 * 只给 `PutObject` 会导致小程序端 403 `AccessDenied`,原因:
 * - `cos-wx-sdk-v5` 的 `SimpleUploadMethod` 默认就是 `postObject`,小程序端
 *   `uploadFile` 对小文件走的是 **POST Object**(`name/cos:PostObject`),不是 PUT;
 * - 超过 `SliceSize`(默认 1MB)的文件走 `sliceUploadFile`,需要分片上传系列动作。
 *
 * 因此这里必须同时授予 PutObject / PostObject 与分片上传动作,否则上传必失败。
 */
const UPLOAD_ACTIONS = [
    "name/cos:PutObject",
    "name/cos:PostObject",
    "name/cos:InitiateMultipartUpload",
    "name/cos:UploadPart",
    "name/cos:CompleteMultipartUpload",
    "name/cos:AbortMultipartUpload",
    "name/cos:ListMultipartUploads",
    "name/cos:ListParts",
];

/**
 * 为指定用户签发 scoped STS 临时凭证。
 *
 * - scope:`<keyPrefix>/<userId>/*`,仅允许上传类动作作用于该前缀下
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
    // action 支持字符串数组(CAM 2.0 语法),一条 statement 即可覆盖全部上传动作
    const policy = getPolicy([
        {
            action: UPLOAD_ACTIONS,
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
