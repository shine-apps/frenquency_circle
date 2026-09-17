import type { CosCredentials } from "@/lib/cos/sts"
import type { IResponse } from "@/types/api"

/**
 * STS 临时凭证获取与缓存(客户端)。
 *
 * `GET /api/upload/cos-credentials` 的 `readUserFromToken` 底层是 `@auth/core`
 * 的 `getToken`,**先读 cookie 再读 Bearer**,因此浏览器同源请求无需额外带 token。
 *
 * 与 frontend_uniapp/src/api/upload.ts 的 `getValidCreds` 同构:
 * - 内存级缓存,到期前 5 分钟视为失效;
 * - 后端返回的凭证本身已 / 即将过期(可能为后端缓存)时,主动重拉一次。
 */

/** 凭证提前刷新阈值:到期前 5 分钟视为失效 */
const CREDS_REFRESH_THRESHOLD_SECONDS = 300

let cachedCredentials: CosCredentials | null = null

/** 凭证是否需要刷新(null / 已过期 / 即将过期) */
export function needsCredentialsRefresh(
  creds: CosCredentials | null,
  nowSeconds: number
): boolean {
  if (!creds) return true
  return creds.expiredTime - nowSeconds <= CREDS_REFRESH_THRESHOLD_SECONDS
}

/** 同源拉取 scoped STS 凭证(失败抛出可读 Error,由字段组件展示) */
export async function fetchCosCredentials(): Promise<CosCredentials> {
  const res = await fetch("/api/upload/cos-credentials", {
    method: "GET",
    credentials: "same-origin",
  })
  const data = (await res.json().catch(() => null)) as IResponse<CosCredentials> | null
  if (!res.ok || !data?.data) {
    throw new Error(data?.message || "获取上传凭证失败")
  }
  return data.data
}

/** 取(可能刷新的)凭证;命中缓存则不发请求 */
export async function getValidCredentials(): Promise<CosCredentials> {
  const nowSeconds = () => Math.floor(Date.now() / 1000)
  if (!needsCredentialsRefresh(cachedCredentials, nowSeconds())) {
    return cachedCredentials as CosCredentials
  }
  let fresh = await fetchCosCredentials()
  // 防御:后端返回的凭证本身已 / 即将过期,主动重拉一次
  if (needsCredentialsRefresh(fresh, nowSeconds())) {
    fresh = await fetchCosCredentials()
  }
  cachedCredentials = fresh
  return fresh
}

/** 测试钩子:重置凭证缓存 */
export function __resetCosCredentialsForTest(): void {
  cachedCredentials = null
}
