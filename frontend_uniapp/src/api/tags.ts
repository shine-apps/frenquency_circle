import { http } from '@/http/http'
import type { CategoryNode, HotInterestDTO, TagDTO } from '@/types'

/**
 * 搜索兴趣标签。
 * - `q` 为空时后端返回热门兴趣 top N(基于 interest_events 得分总和)
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
 * 获取热门兴趣列表(公开)。
 * - 按时间窗口聚合 interest_events 得分总和,按热度降序返回 Top N
 *
 * @param params.days 最近 N 天(1-90,默认 30)
 * @param params.startDate 起始日期 YYYY-MM-DD(东八区,含当日,优先于 days)
 * @param params.endDate 结束日期 YYYY-MM-DD(东八区,含当日,优先于 days)
 * @param params.limit 返回条数(1-50,默认 10)
 * @returns `{ list: HotInterestDTO[] }`
 */
export function getHotInterests(params?: {
  days?: number
  startDate?: string
  endDate?: string
  limit?: number
}) {
  return http.get<{ list: HotInterestDTO[] }>('/api/interests/hot', {
    ...(params?.days !== undefined ? { days: params.days } : {}),
    ...(params?.startDate ? { startDate: params.startDate } : {}),
    ...(params?.endDate ? { endDate: params.endDate } : {}),
    ...(params?.limit !== undefined ? { limit: params.limit } : {}),
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
 * @param categorySlug 必填,所属分类(一级叶子或二级中类)的稳定 slug;自定义标签必须归属到一个真实分类
 * @returns 新创建的 TagDTO
 */
export function createCustomTag(
  name: string,
  categorySlug: string,
) {
  return http.post<TagDTO>('/api/hobby-tags/custom', {
    name,
    ...(categorySlug ? { categorySlug } : {}),
  })
}
