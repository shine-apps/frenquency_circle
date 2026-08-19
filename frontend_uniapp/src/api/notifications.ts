import { http } from '@/http/http'
import type { NotificationDTO, Paginated } from '@/types'

/** 通知列表查询参数 */
export interface NotificationListParams {
  page?: number
  pageSize?: number
  /** 仅未读 */
  unreadOnly?: boolean
}

/** 获取当前用户小程序端通知列表(分页,按时间倒序,仅 miniprogram) */
export function getNotifications(params?: NotificationListParams) {
  return http.get<Paginated<NotificationDTO>>('/api/notifications', {
    ...(params?.page !== undefined ? { page: params.page } : {}),
    ...(params?.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
    ...(params?.unreadOnly !== undefined ? { unreadOnly: params.unreadOnly } : {}),
  })
}

/** 获取当前用户小程序端未读通知数量 */
export function getUnreadNotificationCount() {
  return http.get<{ count: number }>('/api/notifications/unread-count')
}

/** 标记单条通知已读 */
export function markNotificationRead(id: string) {
  return http.patch<{ marked: boolean }>(`/api/notifications/${encodeURIComponent(id)}`)
}

/** 标记当前用户小程序端全部未读通知已读 */
export function markAllNotificationsRead() {
  return http.post<{ marked: number }>('/api/notifications/read-all')
}
