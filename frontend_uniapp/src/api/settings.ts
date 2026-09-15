import type { SystemSetting } from '@/types'
import { http } from '@/http/http'

/**
 * 获取系统设置(公开接口,无需登录)。
 * - GET /api/settings
 * - 返回 key/value 数组,value 为任意 JSON 值
 */
export function fetchSettings() {
  // 调用方(App 启动 / 审核门禁)均自行 catch 并静默降级,
  // 这里隐藏 http 层的全局错误 toast,避免发布路径弹出"网络错误"误导用户
  // (与 api/cos-credentials.ts 的约定一致)
  return http.get<SystemSetting[]>('/api/settings', undefined, undefined, {
    hideErrorToast: true,
  })
}
