import { http } from '@/http/http'
import type { CircleSearchResultDTO, Paginated, SearchQueryParams, UserSearchResultDTO } from '@/types'

/**
 * 搜索用户（发现页-找人）。
 *
 * @param params.q 关键词(必填,trim 后 1-100 字符)
 * @param params.tags 可选标签名称过滤(最多 50 个)
 * @param params.page 页码(从 1 开始)
 * @param params.pageSize 每页条数(默认 15)
 */
export function searchUsers(params: SearchQueryParams) {
  return http.get<Paginated<UserSearchResultDTO>>('/api/users/search', {
    q: params.q,
    ...(params.tags && params.tags.length > 0 ? { tags: params.tags.join(',') } : {}),
    page: params.page,
    pageSize: params.pageSize,
  })
}

/**
 * 搜索圈子（发现页-找圈子）。
 *
 * @param params.q 关键词(必填,trim 后 1-100 字符)
 * @param params.tags 可选标签名称过滤(最多 50 个)
 * @param params.page 页码(从 1 开始)
 * @param params.pageSize 每页条数(默认 15)
 */
export function searchCircles(params: SearchQueryParams) {
  return http.get<Paginated<CircleSearchResultDTO>>('/api/circles/search', {
    q: params.q,
    ...(params.tags && params.tags.length > 0 ? { tags: params.tags.join(',') } : {}),
    page: params.page,
    pageSize: params.pageSize,
  })
}

/**
 * 获取公开用户主页资料（无需管理员权限）。
 * @param userId 用户 ID
 */
export function getUserProfile(userId: string) {
  return http.get<import('@/types').PublicUserProfileDTO>(`/api/users/${encodeURIComponent(userId)}/profile`)
}
