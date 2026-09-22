import type { CheckinStatus } from "@/types/api"

/**
 * 打卡状态选项与展示文案（纯常量，客户端 / 服务端共用）。
 *
 * 独立于 `lib/checkins.ts`：后者依赖 `db`，客户端组件不可引用，
 * 因此把状态常量与解析函数拆到本文件（与 `lib/user-role.ts` 同一定位）。
 */

/** 状态下拉 / Tab 选项（顺序与列表默认展示一致） */
export const CHECKIN_STATUS_OPTIONS: { value: CheckinStatus; label: string }[] = [
  { value: "active", label: "正常" },
  { value: "deleted", label: "已删除" },
]

/** 状态 → 中文名称 */
export const CHECKIN_STATUS_LABEL: Record<CheckinStatus, string> = {
  active: "正常",
  deleted: "已删除",
}

/**
 * 解析状态过滤参数（URL query / searchParams 传入）。
 *
 * @param raw 原始参数值
 * @returns 合法状态返回对应值；未传或非法返回 null（表示不过滤状态）
 */
export function parseCheckinStatusFilter(
  raw: string | null | undefined
): CheckinStatus | null {
  const value = (raw ?? "").trim().toLowerCase()
  const matched = CHECKIN_STATUS_OPTIONS.find((option) => option.value === value)
  return matched ? matched.value : null
}
