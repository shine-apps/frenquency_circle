import type { UserRole } from '@/types'

/** 是否具备创建圈子的权限(传承人 / 管理员)。各入口统一判断,避免口径不一致。 */
export function canCreateCircle(role?: UserRole | null): boolean {
  return role === 'TEACHER' || role === 'ADMIN'
}
