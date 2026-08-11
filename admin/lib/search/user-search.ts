import { and, eq, inArray, ne, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { users, userTags, tags } from "@/db/schema"
import { toTagDTO } from "@/lib/search/tag-search"
import { toPinyin, toPinyinInitials } from "@/lib/search/pinyin"
import type {
  ActivityLevel,
  Paginated,
  TagDTO,
  UserMatchedField,
  UserSearchResultDTO,
} from "@/types/api"

/**
 * 用户搜索引擎。
 *
 * 与 `tag-search.ts` 保持一致的 5 策略匹配(按优先级):
 *   1. 精确匹配(忽略大小写):name / email
 *   2. ILIKE 模糊匹配(`%query%`):name / email
 *   3. 拼音全拼匹配:name 的拼音全拼 === query 的拼音
 *   4. 拼音首字母匹配:name 的首字母 === query 的首字母
 *   5. 拼音首字母前缀匹配:name 的首字母以 query 首字母开头
 *
 * 标签维度同规则匹配(用户绑定的兴趣标签),命中任一标签即算"同频"。
 *
 * 隐私控制:仅返回 `privacySettings.allowMatch = true` 的用户。
 * 标签过滤:提供 tagIds 时,用户必须至少拥有其中一个标签。
 *
 * 说明:users 表未预存拼音列(与 tags 表不同),且拼音计算依赖
 * `pinyin-pro` 无法在 SQL 层完成,因此沿用 `people-matcher.ts` 的
 * "查询候选 → 应用层打分 → 分页" 模式。候选集先按 SQL 宽松条件
 * 收敛(name/email ILIKE 或 privacy 过滤),再在内存中精确打分。
 * 若后续用户量增大,可考虑为 users.name 新增 pinyin 列 + 数据库索引。
 */

/** 活跃度分数加成(用于同分排序) */
const ACTIVITY_BONUS: Record<string, number> = {
  high: 10,
  medium: 5,
  low: 0,
}

/**
 * 对单个文本字段应用 5 策略匹配,返回匹配分数(0 表示不匹配)。
 *
 * 分数设计(数值越大优先级越高):
 *   100: 精确匹配
 *   80:  ILIKE 模糊匹配
 *   70:  拼音全拼完全匹配
 *   55:  拼音全拼包含匹配
 *   45:  拼音首字母完全匹配
 *   35:  拼音首字母前缀匹配
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

/** 用户搜索结果候选(基础字段,不含标签) */
type UserCandidate = {
  id: string
  name: string
  email: string
  avatarUrl: string | null
  activityLevel: string
  practiceYears: number | null
}

/** 应用层打分后的用户项 */
type ScoredUser = {
  candidate: UserCandidate
  score: number
  matchedFields: Set<UserMatchedField>
  tags: TagDTO[]
}

export type SearchUsersParams = {
  /** 搜索关键词(trim 后非空) */
  q: string
  /** 兴趣标签 ID 过滤(可选) */
  tagIds?: string[]
  /** 排除的当前用户 ID */
  currentUserId?: string
  page: number
  pageSize: number
}

/**
 * 按关键词 + 标签分页搜索用户。
 *
 * @returns 分页后的 UserSearchResultDTO 列表,按匹配分数降序排序
 */
export async function searchUsers(
  params: SearchUsersParams
): Promise<Paginated<UserSearchResultDTO>> {
  const { q, tagIds = [], currentUserId, page, pageSize } = params
  const trimmed = q.trim()

  const emptyResult: Paginated<UserSearchResultDTO> = {
    list: [],
    total: 0,
    page,
    pageSize,
  }
  if (!trimmed) return emptyResult

  // 计算入参拼音,用于拼音策略
  const queryPinyin = toPinyin(trimmed)
  const queryInitials = toPinyinInitials(trimmed)

  // 1. 查询候选用户:allowMatch=true,且(可选)排除当前用户
  const conditions = [
    // 隐私过滤:allowMatch 缺失或为 'true' 时允许被搜索
    sql`(users.privacy_settings->>'allowMatch' IS NULL OR users.privacy_settings->>'allowMatch' = 'true')`,
  ]
  if (currentUserId) {
    conditions.push(ne(users.id, currentUserId))
  }
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      activityLevel: users.activityLevel,
      practiceYears: users.practiceYears,
    })
    .from(users)
    .where(and(...conditions))

  if (rows.length === 0) return emptyResult
  const candidates: UserCandidate[] = rows as UserCandidate[]

  // 2. 批量查询候选用户标签
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

  const tagsByUser = new Map<string, TagDTO[]>()
  for (const row of userTagRows) {
    const list = tagsByUser.get(row.userId) ?? []
    list.push(toTagDTO(row as typeof tags.$inferSelect))
    tagsByUser.set(row.userId, list)
  }

  // 3. 应用层 5 策略打分 + 标签过滤
  const tagIdSet = new Set(tagIds)
  const scored: ScoredUser[] = []

  for (const candidate of candidates) {
    const userTagList = tagsByUser.get(candidate.id) ?? []

    // 标签过滤:tagIds 提供时,必须至少命中一个
    if (tagIdSet.size > 0) {
      const hit = userTagList.some((t) => tagIdSet.has(t.id))
      if (!hit) continue
    }

    // 计算各字段匹配分
    const nameScore = scoreField(candidate.name, trimmed, queryPinyin, queryInitials)
    const emailScore = scoreField(candidate.email, trimmed, queryPinyin, queryInitials)
    let tagScore = 0
    for (const tag of userTagList) {
      const s = scoreField(tag.name, trimmed, queryPinyin, queryInitials)
      if (s > tagScore) tagScore = s
    }

    const matchedFields = new Set<UserMatchedField>()
    if (nameScore > 0) matchedFields.add("name")
    if (emailScore > 0) matchedFields.add("email")
    if (tagScore > 0) matchedFields.add("tag")

    // 总分 = 最高字段分 + 活跃度加成
    const maxFieldScore = Math.max(nameScore, emailScore, tagScore)
    if (maxFieldScore <= 0) continue
    const totalScore =
      maxFieldScore + (ACTIVITY_BONUS[candidate.activityLevel] ?? 0)

    scored.push({ candidate, score: totalScore, matchedFields, tags: userTagList })
  }

  // 4. 排序:分数降序,同分时高活跃度优先
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (ACTIVITY_BONUS[b.candidate.activityLevel] ?? 0) -
        (ACTIVITY_BONUS[a.candidate.activityLevel] ?? 0)
  )

  // 5. 分页
  const total = scored.length
  const start = (page - 1) * pageSize
  const pageItems = scored.slice(start, start + pageSize)

  // 6. 组装 DTO
  const list: UserSearchResultDTO[] = pageItems.map((item) => ({
    userId: item.candidate.id,
    name: item.candidate.name,
    avatarUrl: item.candidate.avatarUrl,
    tags: item.tags,
    activityLevel: item.candidate.activityLevel as ActivityLevel,
    practiceYears: item.candidate.practiceYears,
    matchedFields: ["name", "email", "tag"].filter((f) =>
      item.matchedFields.has(f as UserMatchedField)
    ) as UserMatchedField[],
  }))

  return { list, total, page, pageSize }
}
