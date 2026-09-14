import { and, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm"
import type { SQL } from "drizzle-orm"

import { db } from "@/lib/db"
import { checkins, circles, users } from "@/db/schema"
import type { AdminCheckinItem, CheckinDTO, CheckinStatus } from "@/types/api"

/** checkins 表行类型(查询结果原样透传给组装层) */
export type CheckinRow = typeof checkins.$inferSelect

/**
 * 「含媒体」SQL 过滤条件:有视频或有图片。
 * 打卡广场只用它筛选,纯文字打卡不进广场。
 */
export function hasMediaCondition(): SQL {
  return or(
    isNotNull(checkins.videoUrl),
    sql`cardinality(${checkins.images}) > 0`
  ) as SQL
}

/** 转义 LIKE 通配符（`%` / `_` / `\`），使关键词按字面量匹配（Postgres 默认转义符为 `\`） */
function escapeLikePattern(keyword: string): string {
  return keyword.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

/** 后台搜索关键词长度上限（超出截断，避免超长 LIKE 模式拖慢全表扫描） */
const KEYWORD_MAX_LENGTH = 50

/**
 * 组合后台打卡列表查询条件：状态过滤 AND 关键词模糊匹配。
 *
 * 关键词同时命中「打卡正文」与「作者昵称」：
 * 管理员既可能按内容定位违规打卡，也可能按昵称排查某个用户的记录。
 * 通配符先转义，避免用户输入被当作 LIKE 模式串导致全表误命中；
 * 超长关键词截断到 `KEYWORD_MAX_LENGTH`，防止构造长串触发高成本扫描。
 * 两个条件均可选，都未命中时返回 undefined（调用方查询全量）。
 */
export function buildCheckinListWhere(options: {
  status: CheckinStatus | null
  keyword: string
}): SQL | undefined {
  const conditions: SQL[] = []
  if (options.status) conditions.push(eq(checkins.status, options.status))

  const keyword = options.keyword.trim().slice(0, KEYWORD_MAX_LENGTH)
  if (keyword) {
    const pattern = `%${escapeLikePattern(keyword)}%`
    conditions.push(
      or(
        ilike(checkins.content, pattern),
        sql`${checkins.userId} in (select ${users.id} from ${users} where ${users.name} ilike ${pattern})`
      ) as SQL
    )
  }

  if (conditions.length === 0) return undefined
  return and(...conditions)
}

/** 把 checkins 行映射为不含 author / circleTitle 的基础字段 */
function toBaseDTO(
  row: CheckinRow
): Omit<CheckinDTO, "author" | "circleTitle"> {
  return {
    id: row.id,
    userId: row.userId,
    content: row.content,
    circleId: row.circleId,
    tags: row.tags ?? [],
    images: row.images ?? [],
    videoUrl: row.videoUrl,
    createdAt: row.createdAt.toISOString(),
  }
}

/**
 * 批量补全作者信息与圈子标题,组装 CheckinDTO 列表。
 *
 * 查询数恒定为「2 + 主表」(作者 + 圈子),与页大小无关:
 * 先按 userId / circleId 去重后各发一次 `inArray` 查询,再在内存用 Map 映射,
 * 杜绝在循环里逐条查询造成的 N+1。
 *
 * 作者或圈子已被删除时降级为占位值(打卡历史保留,不因关联对象消失而丢数据)。
 */
export async function hydrateCheckins(
  rows: CheckinRow[]
): Promise<CheckinDTO[]> {
  if (rows.length === 0) return []

  const userIds = Array.from(new Set(rows.map((r) => r.userId)))
  const circleIds = Array.from(
    new Set(rows.map((r) => r.circleId).filter((id): id is string => !!id))
  )

  const authorRows = await db
    .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
    .from(users)
    .where(inArray(users.id, userIds))
  const authorMap = new Map(authorRows.map((u) => [u.id, u]))

  const circleMap = new Map<string, string>()
  if (circleIds.length > 0) {
    const circleRows = await db
      .select({ id: circles.id, title: circles.title })
      .from(circles)
      .where(inArray(circles.id, circleIds))
    circleRows.forEach((c) => circleMap.set(c.id, c.title))
  }

  return rows.map((row) => {
    const author = authorMap.get(row.userId)
    return {
      ...toBaseDTO(row),
      author: {
        id: author?.id ?? row.userId,
        name: author?.name ?? "未知用户",
        avatarUrl: author?.avatarUrl ?? null,
      },
      circleTitle: row.circleId ? (circleMap.get(row.circleId) ?? null) : null,
    }
  })
}

/**
 * 组装后台打卡管理列表项：在 C 端 DTO 基础上补充 `status` / `updatedAt`。
 *
 * 复用 `hydrateCheckins`（作者 + 圈子批量补全，防 N+1），
 * 因此后台列表的查询数与页大小无关。状态字段按行 id 反查原始行获取，
 * 不依赖「组装结果与输入严格等长且同序」的隐式数组位置约定。
 */
export async function hydrateAdminCheckins(
  rows: CheckinRow[]
): Promise<AdminCheckinItem[]> {
  const dtos = await hydrateCheckins(rows)
  const rowById = new Map(rows.map((row) => [row.id, row]))
  return dtos.flatMap((dto) => {
    const row = rowById.get(dto.id)
    if (!row) return []
    return [
      { ...dto, status: row.status, updatedAt: row.updatedAt.toISOString() },
    ]
  })
}
