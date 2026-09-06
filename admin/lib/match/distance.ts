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

/** 包围盒(经纬度矩形范围),用于组合 B-tree 索引粗筛 */
export type BoundingBox = {
  latMin: number
  latMax: number
  lngMin: number
  lngMax: number
}

/** 纬度方向每度近似公里数(1 度 ≈ 111km,取整即可,包围盒本就是粗筛) */
const KM_PER_DEGREE_LAT = 111

/**
 * 由中心点 + 半径换算经纬度包围盒(Bounding Box)。
 *
 * 用途:WHERE 中先按 `latitude BETWEEN ... AND longitude BETWEEN ...` 粗筛,
 * 使 (latitude, longitude) 组合 B-tree 索引生效,把 Haversine 精确过滤的
 * 行数从全表缩到包围盒内。包围盒恒为圆形范围的超集,不改变匹配语义。
 *
 * - Δlat = rangeKm / 111
 * - Δlng = rangeKm / (111 × cos(lat)),纬度接近极点时取 180(全球经度范围)
 * - 结果裁剪到 [-90, 90] / [-180, 180]
 *
 * 注:不处理跨 ±180° 经线的环绕(与 Haversine 精确过滤的圆可能在此有
 * 理论差异),对本业务场景无实际影响;PostGIS 迁移后可彻底消除。
 *
 * @param lat 中心纬度
 * @param lng 中心经度
 * @param rangeKm 半径(公里)
 * @returns 裁剪后的包围盒
 */
export function boundingBoxKm(
  lat: number,
  lng: number,
  rangeKm: number
): BoundingBox {
  const dLat = rangeKm / KM_PER_DEGREE_LAT
  const cosLat = Math.cos(toRad(lat))
  const dLng = cosLat > 1e-9 ? rangeKm / (KM_PER_DEGREE_LAT * cosLat) : 180
  return {
    latMin: Math.max(-90, lat - dLat),
    latMax: Math.min(90, lat + dLat),
    lngMin: Math.max(-180, lng - dLng),
    lngMax: Math.min(180, lng + dLng),
  }
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
