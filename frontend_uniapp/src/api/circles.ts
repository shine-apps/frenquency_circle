import { http } from '@/http/http'
import type {
  CircleDetailDTO,
  CircleDTO,
  CreateCircleInput,
  FollowedCircleDTO,
  Paginated,
  UpdateCircleInput,
} from '@/types'

/** 创建圈子返回 */
export interface CreateCircleResult {
  circleId: string
  status: string
}

/** 联系圈子返回 */
export interface ContactCircleResult {
  contactPhone: string | null
  wechat: string | null
}

/** 我创建的圈子查询参数 */
export interface MyCirclesParams {
  page?: number
  pageSize?: number
}

/** 创建圈子(需 TEACHER 角色)。24 小时内最多 5 个,超限返回 429 */
export function createCircle(input: CreateCircleInput) {
  return http.post<CreateCircleResult>('/api/circles', input as unknown as Record<string, unknown>)
}

/** 获取圈子详情(需登录)。非创建者访问非 active 状态的圈子返回 404 */
export function getCircle(id: string) {
  return http.get<CircleDetailDTO>(`/api/circles/${encodeURIComponent(id)}`)
}

/** 更新圈子信息(仅创建者可调)。tags 提供时全量替换 */
export function updateCircle(id: string, patch: UpdateCircleInput) {
  return http.put<CircleDetailDTO>(`/api/circles/${encodeURIComponent(id)}`, patch as unknown as Record<string, unknown>)
}

/** 软删除圈子(仅创建者可调,`status='deleted'`) */
export function deleteCircle(id: string) {
  return http.delete<{ id: string }>(`/api/circles/${encodeURIComponent(id)}`)
}

/** 获取当前用户创建的圈子列表(分页,排除已删除) */
export function getMyCircles(params?: MyCirclesParams) {
  return http.get<Paginated<CircleDTO>>('/api/circles/mine', {
    ...(params?.page !== undefined ? { page: params.page } : {}),
    ...(params?.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
  })
}

/** 学员联系老师(需登录)。插入 contact_logs 记录 */
export function contactCircle(id: string, contactType: 'phone' | 'wechat') {
  return http.post<ContactCircleResult>(`/api/circles/${encodeURIComponent(id)}/contact`, { contactType })
}

/** 关注圈子(幂等,仅 active 圈子可关注) */
export function followCircle(id: string) {
  return http.post<{ followed: true }>(`/api/circles/${encodeURIComponent(id)}/follow`)
}

/** 取消关注(幂等) */
export function unfollowCircle(id: string) {
  return http.delete<{ followed: false }>(`/api/circles/${encodeURIComponent(id)}/follow`)
}

/** 我关注的圈子列表(分页,按关注时间倒序,排除已删除) */
export function getFollowedCircles(params?: MyCirclesParams) {
  return http.get<Paginated<FollowedCircleDTO>>('/api/circles/followed', {
    ...(params?.page !== undefined ? { page: params.page } : {}),
    ...(params?.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
  })
}
