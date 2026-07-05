import { request } from './request'

/**
 * 定位与匹配相关服务。
 * 对应后端路由:
 * - POST /api/locations/publish
 * - GET /api/locations/match-people
 * - GET /api/locations/match-circles
 */

/** 发布定位返回 */
export interface PublishLocationResult {
  locationId: string
  publishedAt: string
}

/** 匹配查询参数(people / circles 共用) */
export interface MatchQueryParams {
  latitude: number
  longitude: number
  tagIds: string[]
  rangeKm: number
  page?: number
  pageSize?: number
}

/**
 * 发布当前位置(需登录)。
 * - 写入 locations 表,同时更新 users 表的最新位置
 * - 同一用户 5 分钟内只能发布 1 次(后端 429)
 *
 * @param input 定位发布请求体
 * @returns `{ locationId, publishedAt }`
 */
export async function publishLocation(
  input: LocationPublishInput
): Promise<PublishLocationResult> {
  return request<PublishLocationResult>({
    url: '/api/locations/publish',
    method: 'POST',
    data: input as unknown as Record<string, unknown>,
  })
}

/**
 * 匹配同频的人(需登录)。
 *
 * @param params 匹配查询参数
 * @returns 分页的 MatchPersonDTO 列表
 */
export async function matchPeople(
  params: MatchQueryParams
): Promise<Paginated<MatchPersonDTO>> {
  return request<Paginated<MatchPersonDTO>>({
    url: '/api/locations/match-people',
    method: 'GET',
    // tagIds 数组会被 request.ts 序列化为逗号分隔字符串,后端 transform 解析
    params: params as unknown as Record<string, unknown>,
  })
}

/**
 * 匹配同频的圈子(需登录)。
 *
 * @param params 匹配查询参数
 * @returns 分页的 MatchCircleDTO 列表
 */
export async function matchCircles(
  params: MatchQueryParams
): Promise<Paginated<MatchCircleDTO>> {
  return request<Paginated<MatchCircleDTO>>({
    url: '/api/locations/match-circles',
    method: 'GET',
    params: params as unknown as Record<string, unknown>,
  })
}
