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
  return http.get<{ list: TagDTO[] }>('/api/hobby-tags/search', {
    ...(q !== '' ? { q } : {}),
    ...(limit !== undefined ? { limit } : {}),
  })
}

/**
 * 获取兴趣标签三级分类树(一级大类 → 二级中类 → 三级具体标签)。
 * 用于兴趣选择页骨架。
 */
export function getCategories() {
  return http.get<{ categories: CategoryNode[] }>('/api/hobby-tags/categories')
}

/**
 * 创建自定义标签(需登录)。
 * - 后端自动计算 pinyin / pinyinInitials
 * - 创建后 `status='pending'`,立即可用于匹配
 * - 名称重复返回 409
 *
 * @param name 标签名(1-30 字符)
 * @param categorySlug 可选,所属分类(一级叶子或二级中类)的稳定 slug;不传时归到全局"自定义标签"兜底中类
 * @returns 新创建的 TagDTO
 */
export function createCustomTag(
  name: string,
  categorySlug?: string
) {
  return http.post<TagDTO>('/api/hobby-tags/custom', {
    name,
    ...(categorySlug ? { categorySlug } : {}),
  })
}
