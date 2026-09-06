import { http } from '@/http/http'
import type {
  ContactRequestDTO,
  FollowedUserDTO,
  Paginated,
} from '@/types'

/**
 * 人-人联系与关注相关的 API 封装。
 * 风格与 `api/circles.ts` 保持一致:动词开头小驼峰、路径变量
 * `encodeURIComponent`、分页参数条件展开、返回体签名极简对称。
 */

/** 发起打招呼参数 */
export interface CreateContactRequestInput {
  /** 接收方用户 id */
  toUserId: string
  /** 留言(可选,≤100 字符,空串视为无留言) */
  message?: string
}

/** 联系请求列表查询参数 */
export interface ContactRequestListParams {
  /** incoming 我收到的(默认) / outgoing 我发出的 */
  direction?: 'incoming' | 'outgoing'
  /** 状态过滤,默认 all */
  status?: 'pending' | 'accepted' | 'rejected' | 'all'
  page?: number
  pageSize?: number
}

/** 关注同趣的人(幂等,禁止关注自己) */
export function followUser(id: string) {
  return http.post<{ followed: true }>(`/api/users/${encodeURIComponent(id)}/follow`)
}

/** 取消关注(幂等) */
export function unfollowUser(id: string) {
  return http.delete<{ followed: false }>(`/api/users/${encodeURIComponent(id)}/follow`)
}

/** 我关注的人列表(分页,按关注时间倒序) */
export function getFollowedUsers(params?: { page?: number, pageSize?: number }) {
  return http.get<Paginated<FollowedUserDTO>>('/api/users/followed', {
    ...(params?.page !== undefined ? { page: params.page } : {}),
    ...(params?.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
  })
}

/** 发起打招呼(对方接受后双方互相解锁联系方式) */
export function createContactRequest(input: CreateContactRequestInput) {
  return http.post<ContactRequestDTO>('/api/contact-requests', { ...input })
}

/** 联系请求列表(我收到的 / 我发出的) */
export function getContactRequests(params?: ContactRequestListParams) {
  return http.get<Paginated<ContactRequestDTO>>('/api/contact-requests', {
    ...(params?.direction !== undefined ? { direction: params.direction } : {}),
    ...(params?.status !== undefined ? { status: params.status } : {}),
    ...(params?.page !== undefined ? { page: params.page } : {}),
    ...(params?.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
  })
}

/** 接受联系请求(仅接收方可操作,重复调用幂等) */
export function acceptContactRequest(id: string) {
  return http.post<ContactRequestDTO>(`/api/contact-requests/${encodeURIComponent(id)}/accept`)
}

/** 拒绝联系请求(仅接收方可操作,不发送通知) */
export function rejectContactRequest(id: string) {
  return http.post<ContactRequestDTO>(`/api/contact-requests/${encodeURIComponent(id)}/reject`)
}

/** 撤回自己发出的待处理请求(仅发起方且 pending 时可撤回) */
export function cancelContactRequest(id: string) {
  return http.delete<{ deleted: true }>(`/api/contact-requests/${encodeURIComponent(id)}`)
}
