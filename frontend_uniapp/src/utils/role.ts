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
 * 是否为教师区角色(TEACHER / ADMIN)。
 *
 * 仅用于「教师身份展示」口径(如教师认证页的已认证状态、教师后台区域),
 * 不再作为创建圈子 / 活动 / 视频课程的准入条件。
 */
export function isTeacherRole(role?: UserRole | null): boolean {
  return role === 'TEACHER' || role === 'ADMIN'
}

/**
 * 是否具备发布权限(圈子 / 活动 / 视频课程):**任意已登录用户均可**,不再区分角色。
 *
 * - 应用发布维护中(isAppDeploying 为 true)一律返回 false;
 * - 入参为用户角色(登录后 `userInfo.role` 恒有值:USER / TEACHER / ADMIN),
 *   未登录或角色缺失时返回 false(游客 store 默认角色与真实角色无法区分,
 *   各入口仍需先用 `userStore.isLoggedIn` 判定登录态)。
 *
 * 全站创建入口统一通过本函数判断,避免各处硬编码角色数组导致口径不一致。
 */
export function canPublish(role?: UserRole | null): boolean {
  if (isAppDeploying())
    return false
  return role === 'USER' || isTeacherRole(role)
}

/** 兼容别名:语义等价于 {@link canPublish}(创建圈子 / 活动 / 视频课程口径一致) */
export const canCreateCircle = canPublish
