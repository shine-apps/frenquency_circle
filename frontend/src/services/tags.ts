import { request } from './request'

/**
 * 兴趣标签相关服务。
 * 对应后端路由:
 * - GET /api/tags/search
 * - GET /api/tags/categories
 * - POST /api/tags/custom
 */

/**
 * 搜索兴趣标签。
 * - `q` 为空时后端返回热门标签 top N
 * - `q` 非空时按 5 个策略合并去重(精确 / ILIKE / 拼音 / 拼音首字母)
 *
 * @param q 关键词(可选)
 * @param limit 返回条数(1-50,默认 10)
 * @returns `{ list: TagDTO[] }`
 */
export async function searchTags(
  q: string,
  limit?: number
): Promise<{ list: TagDTO[] }> {
  const params: Record<string, unknown> = {}
  if (q !== undefined && q !== '') params.q = q
  if (limit !== undefined) params.limit = limit
  return request<{ list: TagDTO[] }>({
    url: '/api/tags/search',
    method: 'GET',
    params,
    // 标签搜索接口公开,无需鉴权;但带上 token 也无副作用,
    // 这里不复用 skipAuth 以便后端可按需统计搜索者。
  })
}

/**
 * 获取兴趣标签分类树(六大类与二级分类)。
 * 用于兴趣选择页骨架。
 */
export async function getCategories(): Promise<{ categories: CategoryNode[] }> {
  return request<{ categories: CategoryNode[] }>({
    url: '/api/tags/categories',
    method: 'GET',
  })
}

/**
 * 创建自定义标签(需登录)。
 * - 后端自动计算 pinyin / pinyinInitials
 * - 创建后 `status='pending'`,立即可用于匹配
 * - 名称重复返回 409
 *
 * @param name 标签名(1-30 字符)
 * @returns 新创建的 TagDTO
 */
export async function createCustomTag(name: string): Promise<TagDTO> {
  return request<TagDTO>({
    url: '/api/tags/custom',
    method: 'POST',
    data: { name },
  })
}
