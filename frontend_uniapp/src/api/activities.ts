import { http } from '@/http/http'
import type {
  ActivityDTO,
  ActivityListDTO,
  CreateActivityInput,
  UpdateActivityInput,
} from '@/types'

/** 活动列表查询参数 */
export interface ActivityListParams {
  page?: number
  pageSize?: number
  /** 只看自己发布的(含已取消),仅发布者可传 */
  mine?: boolean
  /** 指定发布者(仅返回 active)。公开主页展示「TA 发布的活动」时使用 */
  creatorId?: string
}

/** 发布活动(任意登录用户均可发布,无需圈子)。返回新建活动 */
export function createActivity(input: CreateActivityInput) {
  return http.post<ActivityDTO>(
    '/api/activities',
    input as unknown as Record<string, unknown>,
  )
}

/**
 * 活动列表(分页,按起始时间倒序)。
 * - 默认全局 active
 * - `mine: true` 只看自己发布(含已取消,仅发布者可传)
 * - `creatorId` 查看指定发布者(仅 active,公开主页用)
 */
export function getActivities(params?: ActivityListParams) {
  return http.get<ActivityListDTO>('/api/activities', {
    ...(params?.page !== undefined ? { page: params.page } : {}),
    ...(params?.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
    ...(params?.mine ? { mine: 1 } : {}),
    ...(params?.creatorId ? { creatorId: params.creatorId } : {}),
  })
}

/** 活动详情(非创建者不可见已取消活动) */
export function getActivity(activityId: string) {
  return http.get<ActivityDTO>(
    `/api/activities/${encodeURIComponent(activityId)}`,
  )
}

/** 更新活动(仅发布者,部分更新) */
export function updateActivity(activityId: string, patch: UpdateActivityInput) {
  return http.patch<ActivityDTO>(
    `/api/activities/${encodeURIComponent(activityId)}`,
    patch as unknown as Record<string, unknown>,
  )
}

/** 软取消活动(仅发布者,置 status=cancelled) */
export function cancelActivity(activityId: string) {
  return http.delete<{ id: string, status: string }>(
    `/api/activities/${encodeURIComponent(activityId)}`,
  )
}
