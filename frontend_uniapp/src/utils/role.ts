import type { UserRole } from '@/types'
import { useSettingsStore } from '@/store/settings'

/**
 * 应用是否处于发布维护中(isAppDeploying 为 true)。
 * 取不到 store(如无 pinia 实例的纯函数调用场景)时按未维护处理,避免误拦截。
 */
function isAppDeploying(): boolean {
  try {
    return useSettingsStore().isAppDeploying
  }
  catch {
    return false
  }
}

/**
 * 是否具备创建圈子的权限(教师 / 管理员)。
 * 应用发布维护中(isAppDeploying 为 true)一律返回 false;各入口统一判断,避免口径不一致。
 */
export function canCreateCircle(role?: UserRole | null): boolean {
  if (isAppDeploying())
    return false
  return role === 'TEACHER' || role === 'ADMIN'
}
