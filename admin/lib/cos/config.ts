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
