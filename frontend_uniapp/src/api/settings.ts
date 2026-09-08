import type { SystemSetting } from '@/types'
import { http } from '@/http/http'

/**
 * 获取系统设置(公开接口,无需登录)。
 * - GET /api/settings
 * - 返回 key/value 数组,value 为任意 JSON 值
 */
export function fetchSettings() {
  return http.get<SystemSetting[]>('/api/settings')
}
