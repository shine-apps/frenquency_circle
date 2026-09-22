import type { LocationPrecision } from "@/types/api"

/**
 * 根据被匹配用户的 `privacySettings.locationPrecision` 对距离做脱敏。
 *
 * - `exact`:保留 2 位小数(精确距离)
 * - `community`:四舍五入到 0.5km 整数倍
 * - `region`:四舍五入到 5km 整数倍
 *
 * @param distanceKm 原始距离(km)
 * @param precision 精度脱敏等级
 * @returns 脱敏后的距离(km)
 */
export function applyLocationPrecision(
  distanceKm: number,
  precision: LocationPrecision
): number {
  switch (precision) {
    case "community":
      return Math.round(distanceKm / 0.5) * 0.5
    case "region":
      return Math.round(distanceKm / 5) * 5
    case "exact":
    default:
      return Math.round(distanceKm * 100) / 100
  }
}
