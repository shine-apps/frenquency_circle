import { useTokenStore } from '@/store/token'
import { getEnvBaseUrl } from '@/utils'

/** 与后端 CosCredentials 对齐(见 admin/lib/cos/sts.ts) */
export interface CosCredentials {
  /** 当前用户 ID(用于构造 scope 内的 key) */
  userId: string
  secretId: string
  secretKey: string
  sessionToken: string
  /** Unix 秒 */
  startTime: number
  /** Unix 秒 */
  expiredTime: number
  bucket: string
  region: string
  keyPrefix: string
  publicBaseUrl: string
}

interface IResponse<T> {
  code: number
  data: T
  message: string
}

/**
 * 向后端请求 scoped STS 凭证(供 cos-js-sdk-v5 直传)。
 *
 * - 走 `getEnvBaseUrl()` + `useTokenStore().validToken` 的标准鉴权模式
 * - 失败抛 Error(调用方决定是否重试/降级到 uploadFile)
 */
export async function fetchCosCredentials(): Promise<CosCredentials> {
  const baseUrl = getEnvBaseUrl()
  const tokenStore = useTokenStore()
  const token = tokenStore.updateNowTime().validToken
  if (!token) {
    throw new Error('未登录或登录已过期,无法获取 COS 凭证')
  }

  let res: Response
  try {
    res = await fetch(`${baseUrl}/api/upload/cos-credentials`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
  }
  catch (e) {
    throw new Error(`网络异常: ${e instanceof Error ? e.message : String(e)}`)
  }

  let body: IResponse<CosCredentials> | null = null
  try {
    body = (await res.json()) as IResponse<CosCredentials>
  }
  catch {
    throw new Error(`服务器返回非 JSON: ${res.status}`)
  }

  if (!res.ok || body.code !== 200) {
    const msg = body?.message || `HTTP ${res.status}`
    throw new Error(msg)
  }
  if (!body.data) {
    throw new Error('COS 凭证为空')
  }
  return body.data
}
