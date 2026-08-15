import { http } from '@/http/http'
import type { MatchCircleDTO, MatchPersonDTO, Paginated } from '@/types'

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

/**
 * 匹配同趣的人(需登录)。
 * 注意:tags 数组需序列化为逗号分隔字符串(后端 `tags=a,b,c` 解析);为空时不传该参数,
 * 由后端按距离/活跃度推荐(不选兴趣也可匹配)。
 */
export function matchPeople(params: MatchQueryParams) {
  const query: Record<string, string | number> = {
    latitude: params.latitude,
    longitude: params.longitude,
    rangeKm: params.rangeKm,
  }
  if (params.tags.length > 0)
    query.tags = params.tags.join(',')
  if (params.page !== undefined)
    query.page = params.page
  if (params.pageSize !== undefined)
    query.pageSize = params.pageSize
  return http.get<Paginated<MatchPersonDTO>>('/api/locations/match-people', query)
}

/**
 * 匹配同趣的圈子(需登录)。
 * 注意:tags 数组需序列化为逗号分隔字符串;为空时不传该参数(不选兴趣也可匹配)。
 */
export function matchCircles(params: MatchQueryParams) {
  const query: Record<string, string | number> = {
    latitude: params.latitude,
    longitude: params.longitude,
    rangeKm: params.rangeKm,
  }
  if (params.tags.length > 0)
    query.tags = params.tags.join(',')
  if (params.page !== undefined)
    query.page = params.page
  if (params.pageSize !== undefined)
    query.pageSize = params.pageSize
  return http.get<Paginated<MatchCircleDTO>>('/api/locations/match-circles', query)
}