import { http } from '@/http/http'
import type { CheckinDTO, CheckinListDTO, CreateCheckinInput, Paginated } from '@/types'

/** 打卡列表查询参数 */
export interface CheckinListParams {
  page?: number
  pageSize?: number
}

/** 打卡列表公共 query 构造 */
function toListQuery(params?: CheckinListParams) {
  return {
    ...(params?.page !== undefined ? { page: params.page } : {}),
    ...(params?.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
  }
}

/**
 * 发布打卡。
 *
 * - 文字 / 图片(≤9) / 视频(1) 至少一项,图片与视频互斥;
 * - `circleId` 必须是当前用户关注的 active 圈子;
 * - `tags` 为兴趣标签名称(0-10 个,后端校验 approved 存在性)。
 */
export function createCheckin(input: CreateCheckinInput) {
  return http.post<CheckinDTO>(
    '/api/checkins',
    input as unknown as Record<string, unknown>,
  )
}

/** 打卡详情(分享落地页;已删除的打卡返回 404) */
export function getCheckin(id: string) {
  return http.get<CheckinDTO>(`/api/checkins/${encodeURIComponent(id)}`)
}

/** 打卡广场(仅含图片/视频的打卡,按时间倒序分页) */
export function getPlazaCheckins(params?: CheckinListParams) {
  return http.get<CheckinListDTO>('/api/checkins/plaza', toListQuery(params))
}

/** 我的打卡(含纯文字打卡,按时间倒序分页) */
export function getMyCheckins(params?: CheckinListParams) {
  return http.get<CheckinListDTO>('/api/checkins/mine', toListQuery(params))
}

/** 删除自己的打卡(软删除,幂等) */
export function deleteCheckin(id: string) {
  return http.delete<{ deleted: boolean }>(
    `/api/checkins/${encodeURIComponent(id)}`,
  )
}

/** 某个圈子的打卡列表(含纯文字,按时间倒序分页) */
export function getCircleCheckins(circleId: string, params?: CheckinListParams) {
  return http.get<Paginated<CheckinDTO>>(
    `/api/circles/${encodeURIComponent(circleId)}/checkins`,
    toListQuery(params),
  )
}
