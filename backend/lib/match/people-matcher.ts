import { and, desc, gte, isNotNull, lte, ne, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { users } from "@/db/schema"
import type {
  MatchPersonDTO,
  Paginated,
  LocationPrecision,
} from "@/types/api"
import {
  boundingBoxKm,
  haversineKmSql,
  withinRangeSql,
} from "@/lib/match/distance"
import { applyLocationPrecision } from "@/lib/match/precision"

/**
 * 同趣的人匹配引擎。
 *
 * 加权打分公式:
 * - 距离分(40%):1 - (distance / rangeKm),范围 0-1(越近越高)
 * - 兴趣重合度(40%):intersection(用户标签名称, 请求标签名称).length / 请求标签名称.length
 * - 活跃度分(20%):high=1, medium=0.6, low=0.3
 *
 * 总分 = 0.4 * 距离分 + 0.4 * 重合度分 + 0.2 * 活跃度分
 *
 * 用户标签存储于 users.tags text[](hobby_tags.name),无需再 JOIN 桥接表。
 *
 * 性能设计(大数据量):
 * 1. WHERE 先按经纬度包围盒(Bounding Box)粗筛,命中 users_location_idx
 *    组合 B-tree 索引,Haversine 精确条件仅作粗筛后的二次过滤;
 * 2. 距离/重合度/活跃度打分与 ORDER BY / LIMIT / OFFSET 全部下推 SQL,
 *    应用层只处理当前页 pageSize 行,不再全量拉取内存排序;
 * 3. total 用 COUNT 查询与数据页查询 Promise.all 并行。
 *
 * 未来产品决策项:如需"仅返回有标签重合的候选",可在 WHERE 追加
 * `users.tags && ARRAY[...]::text[]`(走 GIN 索引);当前语义允许重合度为 0
 * 的候选入选,与历史行为一致,故不加硬过滤。
 */

export type MatchPeopleParams = {
  lat: number
  lng: number
  tags: string[]
  rangeKm: number
  /** 当前登录用户 id,用于排除自身;未登录(游客)时传 undefined */
  currentUserId?: string
  page: number
  pageSize: number
}

/** 从 jsonb privacySettings 中安全提取 locationPrecision */
function extractLocationPrecision(raw: unknown): LocationPrecision {
  if (typeof raw === "object" && raw !== null) {
    const v = (raw as Record<string, unknown>).locationPrecision
    if (v === "exact" || v === "community" || v === "region") return v
  }
  return "exact"
}

/**
 * 查询范围内的同趣用户并按加权总分排序返回(打分/排序/分页均在 SQL 层)。
 *
 * @returns 分页后的 MatchPersonDTO 列表
 */
export async function matchPeople(
  params: MatchPeopleParams
): Promise<Paginated<MatchPersonDTO>> {
  const {
    lat,
    lng,
    tags,
    rangeKm,
    currentUserId,
    page,
    pageSize,
  } = params

  // 1. 包围盒粗筛范围(B-tree 索引可命中),Haversine 保留为精确过滤
  const bbox = boundingBoxKm(lat, lng, rangeKm)

  const whereConditions = [
    isNotNull(users.latitude),
    isNotNull(users.longitude),
    gte(users.latitude, bbox.latMin),
    lte(users.latitude, bbox.latMax),
    gte(users.longitude, bbox.lngMin),
    lte(users.longitude, bbox.lngMax),
    withinRangeSql(users.latitude, users.longitude, lat, lng, rangeKm),
    // 隐私过滤:allowMatch 缺失或为 'true' 时允许匹配
    sql`(users.privacy_settings->>'allowMatch' IS NULL OR users.privacy_settings->>'allowMatch' = 'true')`,
  ]
  // 登录用户排除自身;游客(未登录)不排除
  if (currentUserId) {
    whereConditions.push(ne(users.id, currentUserId))
  }
  const where = and(...whereConditions)

  // 2. SQL 层打分(与历史应用层公式逐项一致)
  const distanceSql = haversineKmSql(users.latitude, users.longitude, lat, lng)
  // 距离分:越近越高,范围 0-1
  const distanceScoreSql = sql`GREATEST(0, 1 - ${distanceSql} / ${rangeKm})`
  // 兴趣重合度:名称数组交集数 / 请求标签数;请求无标签时恒为 0
  const overlapScoreSql =
    tags.length > 0
      ? sql`(
          (SELECT count(*) FROM unnest(${users.tags}) AS t
           WHERE t = ANY(ARRAY[${sql.join(
             tags.map((t) => sql`${t}`),
             sql`, `
           )}]::text[]))::float / ${tags.length}
        )`
      : sql`0`
  // 活跃度分:high=1 / medium=0.6 / low=0.3,缺省 0.6
  const activityScoreSql = sql`CASE ${users.activityLevel}
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 0.6
      WHEN 'low' THEN 0.3
      ELSE 0.6
    END`
  const totalScoreSql = sql<number>`(
      0.4 * ${distanceScoreSql}
      + 0.4 * ${overlapScoreSql}
      + 0.2 * ${activityScoreSql}
    )`

  // 3. 数据页 + 总数并行查询(total 同样走包围盒过滤)
  const [pageRows, countRows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
        activityLevel: users.activityLevel,
        practiceYears: users.practiceYears,
        privacySettings: users.privacySettings,
        tags: users.tags,
        distance: distanceSql,
      })
      .from(users)
      .where(where)
      .orderBy(desc(totalScoreSql))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(where),
  ])

  // 4. 应用位置精度脱敏并组装 DTO(仅当前页 ≤pageSize 行)
  const list: MatchPersonDTO[] = pageRows.map((row) => {
    const precision = extractLocationPrecision(row.privacySettings)
    return {
      userId: row.id,
      name: row.name,
      avatarUrl: row.avatarUrl,
      distanceKm: applyLocationPrecision(
        typeof row.distance === "number" && Number.isFinite(row.distance)
          ? row.distance
          : 0,
        precision
      ),
      tags: row.tags ?? [],
      activityLevel: row.activityLevel as MatchPersonDTO["activityLevel"],
      practiceYears: row.practiceYears,
    }
  })

  return { list, total: countRows[0]?.count ?? 0, page, pageSize }
}
