import { inArray, isNotNull, or, sql } from "drizzle-orm"
import type { SQL } from "drizzle-orm"

import { db } from "@/lib/db"
import { checkins, circles, users } from "@/db/schema"
import type { CheckinDTO } from "@/types/api"

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
