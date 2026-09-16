/**
 * 圈子状态展示文案与徽章样式(纯函数,服务端 / 客户端共用)。
 *
 * 管理员后台(`app/admin/circles`)与教师后台(`app/teacher/circles`)
 * 共用同一份映射,避免两处各写一套导致状态文案漂移。
 */

/** Badge variant 取值(与 components/ui/badge.tsx 的 variant 对齐) */
export type CircleStatusBadgeVariant = "default" | "secondary" | "destructive"

/** 圈子状态 → 中文标签 */
export function circleStatusLabel(status: string): string {
  if (status === "active") return "活跃"
  if (status === "offline") return "已下线"
  if (status === "deleted") return "已删除"
  if (status === "violated") return "违规"
  if (status === "pending") return "待审核"
  if (status === "rejected") return "未通过"
  return status
}

/** 圈子状态 → 徽章样式 */
export function circleStatusBadgeVariant(
  status: string
): CircleStatusBadgeVariant {
  if (status === "active") return "default"
  if (status === "deleted" || status === "pending") return "secondary"
  return "destructive"
}
