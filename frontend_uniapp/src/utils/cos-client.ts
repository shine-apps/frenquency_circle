import COS from 'cos-js-sdk-v5'

import type { CosCredentials } from '@/api/cos-credentials'

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
  secretId: string
  client: COS
}

let _cached: CachedClient | null = null

/**
 * 返回与给定凭证绑定的 COS 实例。若凭证与缓存一致则复用,否则重建。
 */
export function getCosClient(creds: CosCredentials): COS {
  if (_cached && _cached.secretId === creds.secretId) {
    return _cached.client
  }
  const client = new COS({
    SecretId: creds.secretId,
    SecretKey: creds.secretKey,
    SecurityToken: creds.sessionToken,
  })
  _cached = { secretId: creds.secretId, client }
  return client
}

/** 测试钩子:重置缓存 */
export function __resetCosClientForTest(): void {
  _cached = null
}
