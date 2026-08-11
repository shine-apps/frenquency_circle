import { and, eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles, circleTags, tags } from "@/db/schema"
import { toTagDTO } from "@/lib/search/tag-search"
import { toPinyin, toPinyinInitials } from "@/lib/search/pinyin"
import type {
  CircleMatchedField,
  CircleSearchResultDTO,
  Paginated,
  TagDTO,
} from "@/types/api"

/**
 * 圈子搜索引擎。
 *
 * 与 `user-search.ts` 保持一致的多策略匹配(按优先级):
 *   1. 精确匹配(忽略大小写):title / description
 *   2. ILIKE 模糊匹配(`%query%`):title / description
 *   3. 拼音全拼匹配:title 的拼音全拼 === query 的拼音
 *   4. 拼音首字母匹配:title 的首字母 === query 的首字母
 *   5. 拼音首字母前缀匹配:title 的首字母以 query 首字母开头
 *
 * 标签维度同规则匹配(圈子绑定的兴趣标签)。
 *
 * 状态过滤:仅返回 `status='active'` 的圈子(新建 pending 与软删
 * deleted / offline / violated 均不可被搜索)。
 * 标签过滤:提供 tagIds 时,圈子必须至少拥有其中一个标签。
 *
 * 说明:与用户搜索一样,circles 表未预存拼音列,沿用
 * `circle-matcher.ts` 的 "查询候选 → 应用层打分 → 分页" 模式。
 */

/**
 * 对单个文本字段应用多策略匹配,返回匹配分数(0 表示不匹配)。
 * 分数设计同 user-search(精确 100 / ILIKE 80 / 拼音全拼 70/55 / 首字母 45/35)。
 */
function scoreField(
  field: string,
  query: string,
  queryPinyin: string,
  queryInitials: string
): number {
  const lower = field.toLowerCase()
  const q = query.toLowerCase()

  if (lower === q) return 100
  if (lower.includes(q)) return 80

  const fieldPinyin = toPinyin(field)
  if (queryPinyin && fieldPinyin === queryPinyin) return 70
  if (queryPinyin && fieldPinyin.includes(queryPinyin)) return 55

  const fieldInitials = toPinyinInitials(field)
  if (queryInitials && fieldInitials === queryInitials) return 45
  if (queryInitials && fieldInitials.startsWith(queryInitials)) return 35

  return 0
}

/** 圈子搜索结果候选(基础字段,不含标签) */
type CircleCandidate = {
  id: string
  title: string
  description: string
  address: string
  activityTime: string | null
  memberCount: number
  maxMembers: number | null
}

/** 应用层打分后的圈子项 */
type ScoredCircle = {
  candidate: CircleCandidate
  score: number
  matchedFields: Set<CircleMatchedField>
  tags: TagDTO[]
}

export type SearchCirclesParams = {
  /** 搜索关键词(trim 后非空) */
  q: string
  /** 兴趣标签 ID 过滤(可选) */
  tagIds?: string[]
  page: number
  pageSize: number
}

/**
 * 按关键词 + 标签分页搜索圈子。
 *
 * @returns 分页后的 CircleSearchResultDTO 列表,按匹配分数降序排序
 */
export async function searchCircles(
  params: SearchCirclesParams
): Promise<Paginated<CircleSearchResultDTO>> {
  const { q, tagIds = [], page, pageSize } = params
  const trimmed = q.trim()

  const emptyResult: Paginated<CircleSearchResultDTO> = {
    list: [],
    total: 0,
    page,
    pageSize,
  }
  if (!trimmed) return emptyResult

  // 计算入参拼音
  const queryPinyin = toPinyin(trimmed)
  const queryInitials = toPinyinInitials(trimmed)

  // 1. 查询活跃圈子
  const rows = await db
    .select({
      id: circles.id,
      title: circles.title,
      description: circles.description,
      address: circles.address,
      activityTime: circles.activityTime,
      memberCount: circles.memberCount,
      maxMembers: circles.maxMembers,
    })
    .from(circles)
    .where(eq(circles.status, "active"))

  if (rows.length === 0) return emptyResult
  const candidates: CircleCandidate[] = rows as CircleCandidate[]

  // 2. 批量查询候选圈子标签
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

  const tagsByCircle = new Map<string, TagDTO[]>()
  for (const row of circleTagRows) {
    const list = tagsByCircle.get(row.circleId) ?? []
    list.push(toTagDTO(row as typeof tags.$inferSelect))
    tagsByCircle.set(row.circleId, list)
  }

  // 3. 应用层多策略打分 + 标签过滤
  const tagIdSet = new Set(tagIds)
  const scored: ScoredCircle[] = []

  for (const candidate of candidates) {
    const circleTagList = tagsByCircle.get(candidate.id) ?? []

    // 标签过滤:tagIds 提供时,必须至少命中一个
    if (tagIdSet.size > 0) {
      const hit = circleTagList.some((t) => tagIdSet.has(t.id))
      if (!hit) continue
    }

    // 计算各字段匹配分(description 权重稍低,避免长文本抢了标题的优先级)
    const titleScore = scoreField(candidate.title, trimmed, queryPinyin, queryInitials)
    const descriptionScore = Math.floor(
      scoreField(candidate.description, trimmed, queryPinyin, queryInitials) * 0.7
    )
    let tagScore = 0
    for (const tag of circleTagList) {
      const s = scoreField(tag.name, trimmed, queryPinyin, queryInitials)
      if (s > tagScore) tagScore = s
    }

    const matchedFields = new Set<CircleMatchedField>()
    if (titleScore > 0) matchedFields.add("title")
    if (descriptionScore > 0) matchedFields.add("description")
    if (tagScore > 0) matchedFields.add("tag")

    const maxFieldScore = Math.max(titleScore, descriptionScore, tagScore)
    if (maxFieldScore <= 0) continue

    // 圈子活跃度加成(成员越多越靠前)
    const capacity = candidate.maxMembers ?? 10
    const activityBonus = Math.min(10, Math.round(candidate.memberCount / capacity) * 5)

    scored.push({
      candidate,
      score: maxFieldScore + activityBonus,
      matchedFields,
      tags: circleTagList,
    })
  }

  // 4. 排序:分数降序,同分时按创建时间升序(先创建的在前)
  scored.sort((a, b) => b.score - a.score)

  // 5. 分页
  const total = scored.length
  const start = (page - 1) * pageSize
  const pageItems = scored.slice(start, start + pageSize)

  // 6. 组装 DTO
  const list: CircleSearchResultDTO[] = pageItems.map((item) => ({
    circleId: item.candidate.id,
    title: item.candidate.title,
    description: item.candidate.description,
    tags: item.tags,
    memberCount: item.candidate.memberCount,
    maxMembers: item.candidate.maxMembers,
    address: item.candidate.address,
    activityTime: item.candidate.activityTime,
    matchedFields: ["title", "description", "tag"].filter((f) =>
      item.matchedFields.has(f as CircleMatchedField)
    ) as CircleMatchedField[],
  }))

  return { list, total, page, pageSize }
}
