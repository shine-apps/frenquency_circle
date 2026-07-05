import { request } from './request'

/**
 * 圈子 CRUD 与联系服务。
 * 对应后端路由:
 * - POST   /api/circles
 * - GET    /api/circles/:id
 * - PUT    /api/circles/:id
 * - DELETE /api/circles/:id
 * - GET    /api/circles/mine
 * - POST   /api/circles/:id/contact
 */

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

/**
 * 创建圈子(需 TEACHER 角色)。
 * - 24 小时内最多 5 个,超限返回 429
 * - 后端自动插入 circle_tags 与 circle_members(role=creator)
 *
 * @returns `{ circleId, status:'active' }`
 */
export async function createCircle(
  input: CreateCircleInput
): Promise<CreateCircleResult> {
  return request<CreateCircleResult>({
    url: '/api/circles',
    method: 'POST',
    data: input as unknown as Record<string, unknown>,
  })
}

/**
 * 获取圈子详情(需登录)。
 * - 非创建者访问非 active 状态的圈子返回 404
 *
 * @param id 圈子 ID
 * @returns CircleDetailDTO
 */
export async function getCircle(id: string): Promise<CircleDetailDTO> {
  return request<CircleDetailDTO>({
    url: `/api/circles/${encodeURIComponent(id)}`,
    method: 'GET',
  })
}

/**
 * 更新圈子信息(仅创建者可调)。
 * - tagIds 提供时全量替换
 * - contactPhone / wechat 至少要有一个非空(若两者都提供则校验至少一个非空)
 *
 * @param id 圈子 ID
 * @param patch 更新字段
 * @returns 更新后的 CircleDetailDTO
 */
export async function updateCircle(
  id: string,
  patch: UpdateCircleInput
): Promise<CircleDetailDTO> {
  return request<CircleDetailDTO>({
    url: `/api/circles/${encodeURIComponent(id)}`,
    method: 'PUT',
    data: patch as unknown as Record<string, unknown>,
  })
}

/**
 * 软删除圈子(仅创建者可调,`status='deleted'`)。
 *
 * @returns `{ id }`
 */
export async function deleteCircle(id: string): Promise<{ id: string }> {
  return request<{ id: string }>({
    url: `/api/circles/${encodeURIComponent(id)}`,
    method: 'DELETE',
  })
}

/**
 * 获取当前用户创建的圈子列表(分页,排除已删除)。
 */
export async function getMyCircles(
  params?: MyCirclesParams
): Promise<Paginated<CircleDTO>> {
  return request<Paginated<CircleDTO>>({
    url: '/api/circles/mine',
    method: 'GET',
    params: params as unknown as Record<string, unknown>,
  })
}

/**
 * 学员联系老师(需登录)。
 * - 插入 contact_logs 记录
 * - 圈子不存在或非 active 返回 404
 *
 * @param id 圈子 ID
 * @param contactType 联系方式类型
 * @returns `{ contactPhone, wechat }`(空值返回 null)
 */
export async function contactCircle(
  id: string,
  contactType: 'phone' | 'wechat'
): Promise<ContactCircleResult> {
  return request<ContactCircleResult>({
    url: `/api/circles/${encodeURIComponent(id)}/contact`,
    method: 'POST',
    data: { contactType },
  })
}
