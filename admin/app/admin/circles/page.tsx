import { desc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles, users } from "@/db/schema"
import { CirclesTable } from "./_components/circles-table"
import type { CircleDTO } from "@/types/api"

// SSR 圈子列表上限
const SSR_CIRCLE_LIMIT = 200

/** 圈子列表项(含创建者名称,用于表格展示) */
type CircleListItem = CircleDTO & {
  creatorName: string
}

/**
 * 管理后台圈子审核页(server component)。
 * 直接从 db 查询圈子(含所有状态),JOIN users 取创建者名称。
 */
export default async function AdminCirclesPage() {
  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        circle: circles,
        creatorName: users.name,
      })
      .from(circles)
      .innerJoin(users, eq(users.id, circles.creatorId))
      .orderBy(desc(circles.createdAt))
      .limit(SSR_CIRCLE_LIMIT),
    db.select({ count: sql<number>`count(*)::int` }).from(circles),
  ])

  const items: CircleListItem[] = rows.map((r) => ({
    id: r.circle.id,
    title: r.circle.title,
    description: r.circle.description,
    creatorId: r.circle.creatorId,
    latitude: r.circle.latitude,
    longitude: r.circle.longitude,
    address: r.circle.address,
    contactPhone: r.circle.contactPhone,
    wechat: r.circle.wechat,
    activityTime: r.circle.activityTime,
    maxMembers: r.circle.maxMembers,
    memberCount: r.circle.memberCount,
    status: r.circle.status,
    createdAt: r.circle.createdAt.toISOString(),
    updatedAt: r.circle.updatedAt.toISOString(),
    creatorName: r.creatorName,
  }))

  const total = Number(count)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">圈子审核</h1>
        <p className="text-sm text-muted-foreground">
          共 {total} 个圈子{total > SSR_CIRCLE_LIMIT ? `（仅展示最近 ${SSR_CIRCLE_LIMIT} 条）` : ""}
        </p>
      </div>
      <CirclesTable items={items} />
    </div>
  )
}
