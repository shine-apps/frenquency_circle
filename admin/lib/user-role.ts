import type { UserRole } from "@/types/api"

/**
 * 用户角色选项与展示文案（纯常量，客户端 / 服务端共用）。
 */

/** 角色下拉选项（顺序按权限从低到高） */
export const USER_ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: "USER", label: "普通用户" },
  { value: "TEACHER", label: "老师" },
  { value: "ADMIN", label: "管理员" },
]

/** 角色 → 中文名称 */
export const USER_ROLE_LABEL: Record<UserRole, string> = {
  USER: "普通用户",
  TEACHER: "老师",
  ADMIN: "管理员",
}

/**
 * 解析角色过滤参数（URL / query 传入）。
 *
 * @param raw 原始参数值
 * @returns 合法角色返回对应值；未传或非法返回 null（表示不过滤角色）
 */
export function parseUserRoleFilter(
  raw: string | null | undefined
): UserRole | null {
  const value = (raw ?? "").trim().toUpperCase()
  const matched = USER_ROLE_OPTIONS.find((option) => option.value === value)
  return matched ? matched.value : null
}
