import { http } from '@/http/http'
import { useTokenStore } from '@/store/token'

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

/**
 * 向后端请求 scoped STS 凭证(供 COS 直传)。
 *
 * - 走项目统一的 `http.get`(底层 `uni.request`,拦截器自动拼 baseUrl + Authorization)
 *   → 跨平台可用(H5 / 小程序均可,不再依赖浏览器原生 `fetch`)
 * - 失败抛 Error(调用方决定是否重试)
 */
export async function fetchCosCredentials(): Promise<CosCredentials> {
  const tokenStore = useTokenStore()
  const token = tokenStore.updateNowTime().validToken
  if (!token) {
    throw new Error('未登录或登录已过期,无法获取 COS 凭证')
  }
  // hideErrorToast:错误由调用方(toast.show)统一提示,避免双重 toast
  return http.get<CosCredentials>('/api/upload/cos-credentials', undefined, undefined, {
    hideErrorToast: true,
  })
}
