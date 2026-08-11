import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles } from "@/db/schema"
import type { MatchCircleDTO, Paginated } from "@/types/api"
import { haversineKm, withinRangeSql } from "@/lib/match/distance"

/**
 * 同频的圈子匹配引擎。
 *
 * 加权打分公式:
 * - 距离分(30%):1 - (distance / rangeKm),范围 0-1
 * - 兴趣重合度(50%):intersection(圈子标签名称, 请求标签名称).length / 请求标签名称.length
 * - 圈子活跃度(20%):memberCount / maxMembers(若 maxMembers 为 null 则 memberCount / 10)
 *
 * 总分 = 0.3 * 距离分 + 0.5 * 重合度分 + 0.2 * 活跃度分
 *
 * 圈子标签存储于 circles.tags text[](hobby_tags.name),无需再 JOIN 桥接表。
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
 * 查询范围内的活跃圈子并按加权总分排序返回。
 *
 * @returns 分页后的 MatchCircleDTO 列表
 */
export async function matchCircles(
  params: MatchCirclesParams
): Promise<Paginated<MatchCircleDTO>> {
  const { lat, lng, tags, rangeKm, page, pageSize } = params

  const tagNameSet = new Set(tags)

  // 1. 查询范围内的活跃圈子(直接取 circles.tags 名称数组)
  const candidates = await db
    .select({
      id: circles.id,
      title: circles.title,
      latitude: circles.latitude,
      longitude: circles.longitude,
      address: circles.address,
      activityTime: circles.activityTime,
      memberCount: circles.memberCount,
      maxMembers: circles.maxMembers,
      tags: circles.tags,
    })
    .from(circles)
    .where(
      and(
        eq(circles.status, "active"),
        withinRangeSql(circles.latitude, circles.longitude, lat, lng, rangeKm)
      )
    )

  if (candidates.length === 0) {
    return { list: [], total: 0, page, pageSize }
  }

  // 2. 应用层打分(直接使用 circles.tags 名称数组)
  const scored = candidates.map((c) => {
    const distance = haversineKm(lat, lng, c.latitude, c.longitude)
    // 距离分
    const distanceScore = Math.max(0, 1 - distance / rangeKm)
    // 兴趣重合度:名称数组交集
    const circleTagNames = c.tags ?? []
    const overlapCount = circleTagNames.filter((t) => tagNameSet.has(t)).length
    const overlapScore =
      tags.length > 0 ? overlapCount / tags.length : 0
    // 圈子活跃度:memberCount / maxMembers(无上限则 / 10)
    const capacity = c.maxMembers ?? 10
    const activityScore = Math.min(1, c.memberCount / capacity)
    // 加权总分:距离 30% + 重合度 50% + 活跃度 20%
    const total = 0.3 * distanceScore + 0.5 * overlapScore + 0.2 * activityScore
    return { candidate: c, distance, total, tags: circleTagNames }
  })

  // 3. 按总分降序排序
  scored.sort((a, b) => b.total - a.total)

  // 4. 分页
  const total = scored.length
  const start = (page - 1) * pageSize
  const pageItems = scored.slice(start, start + pageSize)

  // 5. 组装 DTO(圈子距离不做隐私脱敏,因为圈子是公开的)
  const list: MatchCircleDTO[] = pageItems.map((item) => ({
    circleId: item.candidate.id,
    title: item.candidate.title,
    distanceKm: Math.round(item.distance * 100) / 100,
    tags: item.tags,
    activityTime: item.candidate.activityTime,
    memberCount: item.candidate.memberCount,
    maxMembers: item.candidate.maxMembers,
    address: item.candidate.address,
  }))

  return { list, total, page, pageSize }
}
