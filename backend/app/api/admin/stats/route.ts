import { and, eq, isNotNull, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { users, circles, hobbyTags } from "@/db/schema"
import { ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"

/** 仪表盘统计数据 */
type AdminStats = {
  /** 总用户数 */
  userCount: number
  /** 圈子总数(不含已删除) */
  circleCount: number
  /** 已设置位置的用户数(users.latitude/longitude 非空) */
  locatedUserCount: number
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

  const [
    [{ userCount }],
    [{ circleCount }],
    [{ locatedUserCount }],
    [{ pendingTagCount }],
    [{ pendingCircleCount }],
  ] = await Promise.all([
    db.select({ userCount: sql<number>`count(*)::int` }).from(users),
    db
      .select({ circleCount: sql<number>`count(*)::int` })
      .from(circles)
      .where(sql`${circles.status} != 'deleted'`),
    db
      .select({ locatedUserCount: sql<number>`count(*)::int` })
      .from(users)
      .where(and(isNotNull(users.latitude), isNotNull(users.longitude))),
    db
      .select({ pendingTagCount: sql<number>`count(*)::int` })
      .from(hobbyTags)
      .where(eq(hobbyTags.status, "pending")),
    db
      .select({ pendingCircleCount: sql<number>`count(*)::int` })
      .from(circles)
      .where(eq(circles.status, "violated")),
  ])

  const payload: AdminStats = {
    userCount: Number(userCount),
    circleCount: Number(circleCount),
    locatedUserCount: Number(locatedUserCount),
    pendingTagCount: Number(pendingTagCount),
    pendingCircleCount: Number(pendingCircleCount),
  }

  return ok(payload)
}