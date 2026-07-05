import { and, eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles, circleTags, tags } from "@/db/schema"
import type {
  MatchCircleDTO,
  Paginated,
  TagDTO,
} from "@/types/api"
import { toTagDTO } from "@/lib/search/tag-search"
import { haversineKm, withinRangeSql } from "@/lib/match/distance"

/**
 * 同频的圈子匹配引擎。
 *
 * 加权打分公式:
 * - 距离分(30%):1 - (distance / rangeKm),范围 0-1
 * - 兴趣重合度(50%):intersection(圈子标签, 请求标签).length / 请求标签.length
 * - 圈子活跃度(20%):memberCount / maxMembers(若 maxMembers 为 null 则 memberCount / 10)
 *
 * 总分 = 0.3 * 距离分 + 0.5 * 重合度分 + 0.2 * 活跃度分
 */

export type MatchCirclesParams = {
  lat: number
  lng: number
  tagIds: string[]
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
  const { lat, lng, tagIds, rangeKm, page, pageSize } = params

  const tagIdSet = new Set(tagIds)

  // 1. 查询范围内的活跃圈子
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

  // 2. 批量查询候选圈子的标签
  const candidateIds = candidates.map((c) => c.id)
  const circleTagRows = await db
    .select({
      circleId: circleTags.circleId,
      id: tags.id,
      name: tags.name,
      category: tags.category,
      subCategory: tags.subCategory,
      pinyin: tags.pinyin,
      pinyinInitials: tags.pinyinInitials,
      status: tags.status,
      createdBy: tags.createdBy,
      createdAt: tags.createdAt,
      updatedAt: tags.updatedAt,
    })
    .from(circleTags)
    .innerJoin(tags, eq(circleTags.tagId, tags.id))
    .where(inArray(circleTags.circleId, candidateIds))

  // 按 circleId 分组标签
  const tagsByCircle = new Map<string, TagDTO[]>()
  for (const row of circleTagRows) {
    const list = tagsByCircle.get(row.circleId) ?? []
    list.push(toTagDTO(row as typeof tags.$inferSelect))
    tagsByCircle.set(row.circleId, list)
  }

  // 3. 应用层打分
  const scored = candidates.map((c) => {
    const distance = haversineKm(lat, lng, c.latitude, c.longitude)
    // 距离分
    const distanceScore = Math.max(0, 1 - distance / rangeKm)
    // 兴趣重合度
    const circleTagsList = tagsByCircle.get(c.id) ?? []
    const overlapCount = circleTagsList.filter((t) => tagIdSet.has(t.id)).length
    const overlapScore =
      tagIds.length > 0 ? overlapCount / tagIds.length : 0
    // 圈子活跃度:memberCount / maxMembers(无上限则 / 10)
    const capacity = c.maxMembers ?? 10
    const activityScore = Math.min(1, c.memberCount / capacity)
    // 加权总分:距离 30% + 重合度 50% + 活跃度 20%
    const total = 0.3 * distanceScore + 0.5 * overlapScore + 0.2 * activityScore
    return { candidate: c, distance, total, tags: circleTagsList }
  })

  // 4. 按总分降序排序
  scored.sort((a, b) => b.total - a.total)

  // 5. 分页
  const total = scored.length
  const start = (page - 1) * pageSize
  const pageItems = scored.slice(start, start + pageSize)

  // 6. 组装 DTO(圈子距离不做隐私脱敏,因为圈子是公开的)
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
