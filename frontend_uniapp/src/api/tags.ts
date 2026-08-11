import { http } from '@/http/http'
import type { CategoryNode, TagDTO } from '@/types'

/**
 * 搜索兴趣标签。
 * - `q` 为空时后端返回热门标签 top N
 * - `q` 非空时按 5 个策略合并去重(精确 / ILIKE / 拼音 / 拼音首字母)
 *
 * @param q 关键词(可选)
 * @param limit 返回条数(1-50,默认 10)
 * @returns `{ list: TagDTO[] }`
 */
export function searchTags(q: string, limit?: number) {
  return http.get<{ list: TagDTO[] }>('/api/tags/search', {
    ...(q !== '' ? { q } : {}),
    ...(limit !== undefined ? { limit } : {}),
  })
}

/**
 * 获取兴趣标签分类树(六大类与二级分类)。
 * 用于兴趣选择页骨架。
 */
export function getCategories() {
  return http.get<{ categories: CategoryNode[] }>('/api/tags/categories')
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
export function createCustomTag(name: string) {
  return http.post<TagDTO>('/api/tags/custom', { name })
}
