import { and, desc, eq, gte, lte, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles } from "@/db/schema"
import type { MatchCircleDTO, Paginated } from "@/types/api"
import {
  boundingBoxKm,
  haversineKmSql,
  withinRangeSql,
} from "@/lib/match/distance"

/**
 * 同趣的圈子匹配引擎。
 *
 * 加权打分公式:
 * - 距离分(30%):1 - (distance / rangeKm),范围 0-1
 * - 兴趣重合度(50%):intersection(圈子标签名称, 请求标签名称).length / 请求标签名称.length
 * - 圈子活跃度(20%):memberCount / maxMembers(若 maxMembers 为 null 则 memberCount / 10),上限 1
 *
 * 总分 = 0.3 * 距离分 + 0.5 * 重合度分 + 0.2 * 活跃度分
 *
 * 圈子标签存储于 circles.tags text[](hobby_tags.name),无需再 JOIN 桥接表。
 *
 * 性能设计(大数据量,与 people-matcher 一致):
 * 1. WHERE 先按经纬度包围盒(Bounding Box)粗筛,命中 circles_location_idx
 *    组合 B-tree 索引,Haversine 精确条件仅作粗筛后的二次过滤;
 * 2. 距离/重合度/活跃度打分与 ORDER BY / LIMIT / OFFSET 全部下推 SQL,
 *    应用层只处理当前页 pageSize 行,不再全量拉取内存排序;
 * 3. total 用 COUNT 查询与数据页查询 Promise.all 并行。
 *
 * 未来产品决策项:如需"仅返回有标签重合的圈子",可在 WHERE 追加
 * `circles.tags && ARRAY[...]::text[]`(走 GIN 索引);当前语义允许重合度为 0
 * 的圈子入选,与历史行为一致,故不加硬过滤。
 */

export type MatchCirclesParams = {
  lat: number
  lng: number
  tags: string[]
  rangeKm: number
  page: number
  pageSize: number
}

/**
 * 查询范围内的活跃圈子并按加权总分排序返回(打分/排序/分页均在 SQL 层)。
 *
 * @returns 分页后的 MatchCircleDTO 列表
 */
export async function matchCircles(
  params: MatchCirclesParams
): Promise<Paginated<MatchCircleDTO>> {
  const { lat, lng, tags, rangeKm, page, pageSize } = params

  // 1. 包围盒粗筛范围(B-tree 索引可命中),Haversine 保留为精确过滤
  const bbox = boundingBoxKm(lat, lng, rangeKm)

  const where = and(
    eq(circles.status, "active"),
    gte(circles.latitude, bbox.latMin),
    lte(circles.latitude, bbox.latMax),
    gte(circles.longitude, bbox.lngMin),
    lte(circles.longitude, bbox.lngMax),
    withinRangeSql(circles.latitude, circles.longitude, lat, lng, rangeKm)
  )

  // 2. SQL 层打分(与历史应用层公式逐项一致)
  const distanceSql = haversineKmSql(
    circles.latitude,
    circles.longitude,
    lat,
    lng
  )
  // 距离分:越近越高,范围 0-1
  const distanceScoreSql = sql`GREATEST(0, 1 - ${distanceSql} / ${rangeKm})`
  // 兴趣重合度:名称数组交集数 / 请求标签数;请求无标签时恒为 0
  const overlapScoreSql =
    tags.length > 0
      ? sql`(
          (SELECT count(*) FROM unnest(${circles.tags}) AS t
           WHERE t = ANY(ARRAY[${sql.join(
             tags.map((t) => sql`${t}`),
             sql`, `
           )}]::text[]))::float / ${tags.length}
        )`
      : sql`0`
  // 圈子活跃度:memberCount / maxMembers(无上限则 / 10),上限 1
  const activityScoreSql = sql`LEAST(1, ${circles.memberCount}::float / COALESCE(${circles.maxMembers}, 10))`
  // 加权总分:距离 30% + 重合度 50% + 活跃度 20%
  const totalScoreSql = sql<number>`(
      0.3 * ${distanceScoreSql}
      + 0.5 * ${overlapScoreSql}
      + 0.2 * ${activityScoreSql}
    )`

  // 3. 数据页 + 总数并行查询(total 同样走包围盒过滤)
  const [pageRows, countRows] = await Promise.all([
    db
      .select({
        id: circles.id,
        title: circles.title,
        address: circles.address,
        activityTime: circles.activityTime,
        memberCount: circles.memberCount,
        maxMembers: circles.maxMembers,
        tags: circles.tags,
        distance: distanceSql,
      })
      .from(circles)
      .where(where)
      .orderBy(desc(totalScoreSql))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(circles)
      .where(where),
  ])

  // 4. 组装 DTO(圈子距离不做隐私脱敏,因为圈子是公开的;仅当前页 ≤pageSize 行)
  const list: MatchCircleDTO[] = pageRows.map((row) => ({
    circleId: row.id,
    title: row.title,
    distanceKm: Math.round(
      (typeof row.distance === "number" && Number.isFinite(row.distance)
        ? row.distance
        : 0) * 100
    ) / 100,
    tags: row.tags ?? [],
    activityTime: row.activityTime,
    memberCount: row.memberCount,
    maxMembers: row.maxMembers,
    address: row.address,
  }))

  return { list, total: countRows[0]?.count ?? 0, page, pageSize }
}
