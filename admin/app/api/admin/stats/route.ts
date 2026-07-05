import { eq, gte, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { users, circles, tags, locations } from "@/db/schema"
import { ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"

/** 仪表盘统计数据 */
type AdminStats = {
  /** 总用户数 */
  userCount: number
  /** 圈子总数(不含已删除) */
  circleCount: number
  /** 今日匹配次数(今日发布定位数) */
  todayMatchCount: number
  /** 待审核标签数(status='pending') */
  pendingTagCount: number
  /** 待处理圈子数(status='violated') */
  pendingCircleCount: number
}

/**
 * GET /api/admin/stats
 *
 * 管理后台仪表盘统计数据(需 ADMIN 权限)。
 * 返回 5 项核心指标,供首页 StatCard 展示。
 *
 * 响应:`AdminStats`
 */
export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  // 今日 00:00(本地时区)作为分界点
  const now = new Date()
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )

  const [
    [{ userCount }],
    [{ circleCount }],
    [{ todayMatchCount }],
    [{ pendingTagCount }],
    [{ pendingCircleCount }],
  ] = await Promise.all([
    db.select({ userCount: sql<number>`count(*)::int` }).from(users),
    db
      .select({ circleCount: sql<number>`count(*)::int` })
      .from(circles)
      .where(sql`${circles.status} != 'deleted'`),
    db
      .select({ todayMatchCount: sql<number>`count(*)::int` })
      .from(locations)
      .where(gte(locations.publishedAt, todayStart)),
    db
      .select({ pendingTagCount: sql<number>`count(*)::int` })
      .from(tags)
      .where(eq(tags.status, "pending")),
    db
      .select({ pendingCircleCount: sql<number>`count(*)::int` })
      .from(circles)
      .where(eq(circles.status, "violated")),
  ])

  const payload: AdminStats = {
    userCount: Number(userCount),
    circleCount: Number(circleCount),
    todayMatchCount: Number(todayMatchCount),
    pendingTagCount: Number(pendingTagCount),
    pendingCircleCount: Number(pendingCircleCount),
  }

  return ok(payload)
}
