import { http } from '@/http/http'
import type { LocationPublishInput, MatchCircleDTO, MatchPersonDTO, Paginated } from '@/types'

/** 搜寻同频返回 */
export interface PublishLocationResult {
  locationId: string
  publishedAt: string
}

/** 匹配查询参数(people / circles 共用) */
export interface MatchQueryParams {
  latitude: number
  longitude: number
  /** 标签名称数组(存 hobby_tags.name) */
  tags: string[]
  rangeKm: number
  page?: number
  pageSize?: number
}

/** 搜寻同频:发布当前位置(需登录)。写入 locations 表,同时更新 users 表的最新位置 */
export function publishLocation(input: LocationPublishInput) {
  return http.post<PublishLocationResult>('/api/locations/publish', input as unknown as Record<string, unknown>)
}

/**
 * 匹配同频的人(需登录)。
 * 注意:tags 数组需序列化为逗号分隔字符串(后端 `tags=a,b,c` 解析)。
 */
export function matchPeople(params: MatchQueryParams) {
  return http.get<Paginated<MatchPersonDTO>>('/api/locations/match-people', {
    latitude: params.latitude,
    longitude: params.longitude,
    tags: params.tags.join(','),
    rangeKm: params.rangeKm,
    ...(params.page !== undefined ? { page: params.page } : {}),
    ...(params.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
  })
}

/**
 * 匹配同频的圈子(需登录)。
 * 注意:tags 数组需序列化为逗号分隔字符串。
 */
export function matchCircles(params: MatchQueryParams) {
  return http.get<Paginated<MatchCircleDTO>>('/api/locations/match-circles', {
    latitude: params.latitude,
    longitude: params.longitude,
    tags: params.tags.join(','),
    rangeKm: params.rangeKm,
    ...(params.page !== undefined ? { page: params.page } : {}),
    ...(params.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
  })
}
