import { sql, type AnyColumn, type SQL } from "drizzle-orm"

/**
 * 匹配引擎距离工具。
 *
 * 设计决策(Phase 1):不使用 PostGIS Point 类型,采用 latitude/longitude 双列方案。
 * 距离计算统一使用 Haversine 公式(球面余弦定律的等价形式),
 * 地球半径取 6371km。
 */

/** 地球平均半径(km) */
const EARTH_RADIUS_KM = 6371

/** 角度转弧度 */
function toRad(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * 纯 TS 实现的 Haversine 距离计算(用于应用层打分)。
 *
 * @param lat1 起点纬度
 * @param lng1 起点经度
 * @param lat2 终点纬度
 * @param lng2 终点经度
 * @returns 两点之间的球面距离(km)
 */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(a)))
  return EARTH_RADIUS_KM * c
}

/**
 * 在 SQL 层计算 Haversine 距离(km)的 drizzle sql 模板。
 *
 * 用于 SELECT 中返回距离值,或 WHERE 中做范围比较。
 * 列参数传入 drizzle 的列引用(如 `users.latitude`),
 * 坐标参数传入数值(参考点经纬度)。
 *
 * 生成的 SQL(PostgreSQL):
 * ```sql
 * 6371 * 2 * ASIN(SQRT(
 *   POWER(SIN((RADIANS(:latParam) - RADIANS(latCol)) / 2), 2) +
 *   COS(RADIANS(:latParam)) * COS(RADIANS(latCol)) *
 *   POWER(SIN((RADIANS(:lngParam) - RADIANS(lngCol)) / 2), 2)
 * ))
 * ```
 */
export function haversineKmSql(
  latCol: AnyColumn,
  lngCol: AnyColumn,
  latParam: number,
  lngParam: number
): SQL<number> {
  return sql<number>`
    ${EARTH_RADIUS_KM} * 2 * ASIN(SQRT(
      POWER(SIN((RADIANS(${latParam}) - RADIANS(${latCol})) / 2), 2) +
      COS(RADIANS(${latParam})) * COS(RADIANS(${latCol})) *
      POWER(SIN((RADIANS(${lngParam}) - RADIANS(${lngCol})) / 2), 2)
    ))
  `
}

/**
 * 构造范围筛选条件:`haversineKmSql(...) <= rangeKm`。
 *
 * 返回 `SQL<boolean>` 模板,可直接传入 drizzle 的 `.where()` 方法。
 */
export function withinRangeSql(
  latCol: AnyColumn,
  lngCol: AnyColumn,
  latParam: number,
  lngParam: number,
  rangeKm: number
): SQL<boolean> {
  return sql<boolean>`
    ${EARTH_RADIUS_KM} * 2 * ASIN(SQRT(
      POWER(SIN((RADIANS(${latParam}) - RADIANS(${latCol})) / 2), 2) +
      COS(RADIANS(${latParam})) * COS(RADIANS(${latCol})) *
      POWER(SIN((RADIANS(${lngParam}) - RADIANS(${lngCol})) / 2), 2)
    )) <= ${rangeKm}
  `
}
