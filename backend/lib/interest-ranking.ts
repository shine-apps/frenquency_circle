import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { hobbyTags, interestEvents } from "@/db/schema"
import { selectTagsWithCategory, toTagDTO } from "@/lib/search/tag-search"
import type { HotInterestDTO } from "@/types/api"
import { chinaDay } from "@/lib/interest-events"

export type HotInterestsParams = {
  /** 最近 N 天,默认 30 */
  days?: number
  /** 起始日期 YYYY-MM-DD(东八区自然日),含当日;优先于 days */
  startDate?: string
  /** 结束日期 YYYY-MM-DD(东八区自然日),含当日;优先于 days */
  endDate?: string
  /** 返回条数 Top K,默认 10 */
  limit?: number
}

type Window = { start: string; end: string }

/**
 * 解析时间窗口:
 * - 显式 startDate / endDate 优先(startDate 缺省 1970-01-01,endDate 缺省今天,均含当日);
 * - 否则取最近 days 天(含今天),默认 30 天。
 */
export function resolveWindow(params: HotInterestsParams): Window {
  const { days = 30, startDate, endDate } = params
  const today = chinaDay(new Date())
  if (startDate || endDate) {
    return {
      start: startDate ?? "1970-01-01",
      end: endDate ?? today,
    }
  }
  // 统一以东八区自然日为基准:从「中国今日」回推 N 天的中国日,
  // 避免用 UTC 当下时间回推导致的跨午夜 ±1 天漂移。
  const [y, m, d] = today.split("-").map(Number)
  const start = chinaDay(new Date(Date.UTC(y, m - 1, d - days + 1)))
  return { start, end: today }
}

/**
 * 计算热门兴趣 Top K:
 * 1) 按 event_date 时间窗口过滤;
 * 2) GROUP BY tag_name 聚合 SUM(score),按得分总和降序取前 K;
 * 3) 关联分类树映射 HotInterestDTO(事件中的标签已删除 / 改名 / 非 approved 时跳过)。
 */
export async function computeHotInterests(
  params: HotInterestsParams = {}
): Promise<{ list: HotInterestDTO[] }> {
  const { limit = 10 } = params
  const { start, end } = resolveWindow(params)

  const totalScore = sql<number>`sum(${interestEvents.score})`.as("total_score")
  const rows = await db
    .select({ tagName: interestEvents.tagName, totalScore })
    .from(interestEvents)
    .where(
      and(
        gte(interestEvents.eventDate, start),
        lte(interestEvents.eventDate, end)
      )
    )
    .groupBy(interestEvents.tagName)
    .orderBy(desc(totalScore))
    .limit(limit)

  if (rows.length === 0) return { list: [] }

  const tagRows = await selectTagsWithCategory().where(
    and(
      inArray(
        hobbyTags.name,
        rows.map((r) => r.tagName)
      ),
      eq(hobbyTags.status, "approved")
    )
  )
  const tagByName = new Map(tagRows.map((t) => [t.name, t]))

  const list: HotInterestDTO[] = []
  for (const row of rows) {
    const tag = tagByName.get(row.tagName)
    if (tag) list.push({ ...toTagDTO(tag), heat: Number(row.totalScore) })
  }
  return { list }
}
