import type { CosCredentials } from "@/lib/cos/sts"

/**
 * COS SDK 单例管理(按凭证缓存),与 frontend_uniapp/src/utils/cos-client.ts 同构。
 *
 * - **动态 `await import("cos-js-sdk-v5")`**:该包是浏览器 UMD 包,静态 import 会在
 *   SSR(Node)侧执行模块顶层代码导致崩溃,同时把 SDK 拖进首屏 bundle;
 *   动态 import 保证 SDK 只在"用户点上传"这一刻、且仅在浏览器加载;
 * - 同一凭证(secretId 相同)复用同一实例,凭证刷新时重建。
 */

/** SDK 回调签名 */
type CosSdkCallback = (err: unknown, data?: unknown) => void

/** 本项目用到的最小 SDK 调用面(回调式,由调用方包成 Promise) */
export interface CosSdkLike {
  putObject(
    params: Record<string, unknown>,
    callback?: (err: unknown, data?: unknown) => void
  ): unknown
}

interface CachedClient {
  secretId: string
  sdk: CosSdkLike
}

let cachedClient: CachedClient | null = null

/** 归一 SDK 错误为 Error(保留 COS 返回的 message) */
export function normalizeCosError(err: unknown): Error {
  const e = err as { error?: { message?: string } | string; message?: string }
  const detail =
    (typeof e?.error === "object" && e.error?.message) ||
    (typeof e?.error === "string" ? e.error : undefined) ||
    e?.message ||
    JSON.stringify(err)
  return new Error(detail)
}

/** 加载(并缓存)与给定凭证绑定的 SDK 实例 */
export async function getCosClient(creds: CosCredentials): Promise<CosSdkLike> {
  if (cachedClient && cachedClient.secretId === creds.secretId) {
    return cachedClient.sdk
  }
  const mod = await import("cos-js-sdk-v5")
  // SDK 自带的 d.ts 与"最小调用面"不完全重叠(其 putObject 为重载 + 具名参数类型),
  // 这里只取构造签名,实例侧再收窄为 CosSdkLike,故经 unknown 两段转换。
  const CosConstructor = (mod.default ?? mod) as unknown as new (options: {
    SecretId: string
    SecretKey: string
    SecurityToken: string
  }) => CosSdkLike

  const sdk = new CosConstructor({
    SecretId: creds.secretId,
    SecretKey: creds.secretKey,
    SecurityToken: creds.sessionToken,
  })
  cachedClient = { secretId: creds.secretId, sdk }
  return sdk
}

/** 测试钩子:重置 SDK 缓存 */
export function __resetCosClientForTest(): void {
  cachedClient = null
}

export type { CosSdkCallback }
