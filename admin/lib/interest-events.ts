import { db } from "@/lib/db"
import {
  interestEvents,
  type InterestEventType,
  type NewInterestEvent,
} from "@/db/schema"
import { logger, LOG_PREFIX } from "@/lib/logger"

const DAY_MS = 86_400_000

/**
 * 热门兴趣得分锚定日期(东八区自然日)。
 * 得分 = 事件日期与该锚定日期的天数差;长期运行建议改为配置项,避免分数整体膨胀。
 */
export const ANCHOR_DATE = "2026-08-24"

/**
 * 东八区自然日:本地时间 +8h 后取 UTC 日期部分,返回 YYYY-MM-DD。
 * 避免 UTC 在 00:00–08:00 期间把凌晨事件算到前一天。
 */
export function chinaDay(date: Date): string {
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000)
  const y = shifted.getUTCFullYear()
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0")
  const d = String(shifted.getUTCDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/**
 * 计算事件得分(以天为单位):
 * 得分 = 事件日期与锚定日期 2026-08-24 的天数差,向下取整,早于锚定日按 0 计。
 */
export function interestScore(day: string): number {
  const [y, m, d] = day.split("-").map(Number)
  const anchor = new Date(`${ANCHOR_DATE}T00:00:00Z`).getTime()
  const dayMs = Date.UTC(y, m - 1, d)
  return Math.max(0, Math.floor((dayMs - anchor) / DAY_MS))
}

export type InterestEventEntry = {
  userId: string
  tagNames: string[]
  eventType: InterestEventType
}

/**
 * 旁路写入兴趣事件:失败仅记日志,不影响保存兴趣 / 建圈 / 搜索主请求。
 * 同一用户对同一标签在当天最多一条(由 UNIQUE(user_id, tag_name, event_date)
 * + onConflictDoNothing 幂等保证)。
 */
export async function recordInterestEvents(
  entries: InterestEventEntry[]
): Promise<void> {
  try {
    const eventDate = chinaDay(new Date())
    const score = interestScore(eventDate)
    const rows: NewInterestEvent[] = []
    for (const entry of entries) {
      for (const tagName of entry.tagNames) {
        rows.push({
          userId: entry.userId,
          tagName,
          eventType: entry.eventType,
          eventDate,
          score,
        })
      }
    }
    if (rows.length === 0) return
    await db.insert(interestEvents).values(rows).onConflictDoNothing({
      target: [interestEvents.userId, interestEvents.tagName, interestEvents.eventDate],
    })
  } catch (err) {
    logger.error(LOG_PREFIX.INTEREST, "record interest events failed", {
      reason: err instanceof Error ? err.message : "unknown",
      count: entries.length,
    })
  }
}
