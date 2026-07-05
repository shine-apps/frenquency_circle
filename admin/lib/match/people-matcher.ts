import { and, eq, inArray, isNotNull, ne, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { users, userTags, tags } from "@/db/schema"
import type {
  MatchPersonDTO,
  Paginated,
  TagDTO,
  LocationPrecision,
} from "@/types/api"
import { toTagDTO } from "@/lib/search/tag-search"
import { haversineKm, withinRangeSql } from "@/lib/match/distance"
import { applyLocationPrecision } from "@/lib/match/precision"

/**
 * 同频的人匹配引擎。
 *
 * 加权打分公式:
 * - 距离分(40%):1 - (distance / rangeKm),范围 0-1(越近越高)
 * - 兴趣重合度(40%):intersection(用户标签, 请求标签).length / 请求标签.length
 * - 活跃度分(20%):high=1, medium=0.6, low=0.3
 *
 * 总分 = 0.4 * 距离分 + 0.4 * 重合度分 + 0.2 * 活跃度分
 */

export type MatchPeopleParams = {
  lat: number
  lng: number
  tagIds: string[]
  rangeKm: number
  currentUserId: string
  page: number
  pageSize: number
}

/** 活跃度 → 分数映射 */
const ACTIVITY_SCORE: Record<string, number> = {
  high: 1,
  medium: 0.6,
  low: 0.3,
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
 * 查询范围内的同频用户并按加权总分排序返回。
 *
 * @returns 分页后的 MatchPersonDTO 列表
 */
export async function matchPeople(
  params: MatchPeopleParams
): Promise<Paginated<MatchPersonDTO>> {
  const {
    lat,
    lng,
    tagIds,
    rangeKm,
    currentUserId,
    page,
    pageSize,
  } = params

  const tagIdSet = new Set(tagIds)

  // 1. 查询范围内的候选用户(排除自身、需要有位置、隐私允许匹配)
  const candidates = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      latitude: users.latitude,
      longitude: users.longitude,
      activityLevel: users.activityLevel,
      practiceYears: users.practiceYears,
      privacySettings: users.privacySettings,
    })
    .from(users)
    .where(
      and(
        ne(users.id, currentUserId),
        isNotNull(users.latitude),
        isNotNull(users.longitude),
        withinRangeSql(users.latitude, users.longitude, lat, lng, rangeKm),
        // 隐私过滤:allowMatch 缺失或为 'true' 时允许匹配
        sql`(users.privacy_settings->>'allowMatch' IS NULL OR users.privacy_settings->>'allowMatch' = 'true')`
      )
    )

  if (candidates.length === 0) {
    return { list: [], total: 0, page, pageSize }
  }

  // 2. 批量查询候选用户的标签
  const candidateIds = candidates.map((c) => c.id)
  const userTagRows = await db
    .select({
      userId: userTags.userId,
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
    .from(userTags)
    .innerJoin(tags, eq(userTags.tagId, tags.id))
    .where(inArray(userTags.userId, candidateIds))

  // 按 userId 分组标签
  const tagsByUser = new Map<string, TagDTO[]>()
  for (const row of userTagRows) {
    const list = tagsByUser.get(row.userId) ?? []
    list.push(toTagDTO(row as typeof tags.$inferSelect))
    tagsByUser.set(row.userId, list)
  }

  // 3. 应用层打分
  const scored = candidates.map((c) => {
    const distance = haversineKm(lat, lng, c.latitude!, c.longitude!)
    // 距离分:越近越高,范围 0-1
    const distanceScore = Math.max(0, 1 - distance / rangeKm)
    // 兴趣重合度
    const userTags = tagsByUser.get(c.id) ?? []
    const overlapCount = userTags.filter((t) => tagIdSet.has(t.id)).length
    const overlapScore =
      tagIds.length > 0 ? overlapCount / tagIds.length : 0
    // 活跃度分
    const activityScore = ACTIVITY_SCORE[c.activityLevel] ?? 0.6
    // 加权总分
    const total = 0.4 * distanceScore + 0.4 * overlapScore + 0.2 * activityScore
    return { candidate: c, distance, total, userTags }
  })

  // 4. 按总分降序排序
  scored.sort((a, b) => b.total - a.total)

  // 5. 分页
  const total = scored.length
  const start = (page - 1) * pageSize
  const pageItems = scored.slice(start, start + pageSize)

  // 6. 应用位置精度脱敏并组装 DTO
  const list: MatchPersonDTO[] = pageItems.map((item) => {
    const precision = extractLocationPrecision(item.candidate.privacySettings)
    return {
      userId: item.candidate.id,
      name: item.candidate.name,
      avatarUrl: item.candidate.avatarUrl,
      distanceKm: applyLocationPrecision(item.distance, precision),
      tags: item.userTags,
      activityLevel: item.candidate.activityLevel as MatchPersonDTO["activityLevel"],
      practiceYears: item.candidate.practiceYears,
    }
  })

  return { list, total, page, pageSize }
}
