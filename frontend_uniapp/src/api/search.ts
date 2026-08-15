import { http } from '@/http/http'

/**
 * 获取公开用户主页资料（无需管理员权限）。
 * @param userId 用户 ID
 */
export function getUserProfile(userId: string) {
  return http.get<import('@/types').PublicUserProfileDTO>(`/api/users/${encodeURIComponent(userId)}/profile`)
}
