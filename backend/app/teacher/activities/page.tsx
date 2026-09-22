import { redirect } from "next/navigation"
import { desc, eq } from "drizzle-orm"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { activities, users } from "@/db/schema"
import { toActivityDTO } from "@/lib/activities"
import { TeacherActivitiesTable, type TeacherActivityItem } from "./_components/activities-table"

/** SSR 活动列表上限(与管理后台保持一致的简化分页策略) */
const SSR_ACTIVITY_LIMIT = 200

/**
 * 教师后台「我的活动」页(server component)。
 *
 * - 默认只查自己发布的活动(含已取消);ADMIN 可带 `?scope=all` 查看全部(代管)
 * - 数据直接 SSR 查库,写操作走 `/api/teacher/activities/*`
 */
export default async function TeacherActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>
}) {
  const session = await auth()
  // layout 已校验;这里再兜一次以收窄类型,避免用 `?? ""` 拼出非法 uuid 查询
  const userId = session?.user?.id
  if (!userId) redirect("/login")
  const isAdmin = session?.user?.role === "ADMIN"

  const { scope: scopeParam } = await searchParams
  const scope: "mine" | "all" = isAdmin && scopeParam === "all" ? "all" : "mine"

  const rows = await db
    .select({ activity: activities, creatorName: users.name })
    .from(activities)
    .innerJoin(users, eq(users.id, activities.creatorId))
    .where(scope === "all" ? undefined : eq(activities.creatorId, userId))
    .orderBy(desc(activities.startTime))
    .limit(SSR_ACTIVITY_LIMIT)

  const items: TeacherActivityItem[] = rows.map(({ activity, creatorName }) => ({
    ...toActivityDTO(activity),
    creatorName,
    canManage: activity.creatorId === userId || isAdmin,
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">我的活动</h1>
        <p className="text-sm text-muted-foreground">
          {scope === "all" ? "全部老师发布的活动" : "你发布的活动"}，共 {items.length} 个
          {items.length >= SSR_ACTIVITY_LIMIT ? `（仅展示最近 ${SSR_ACTIVITY_LIMIT} 条）` : ""}
        </p>
      </div>

      <TeacherActivitiesTable
        items={items}
        scope={scope}
        canSwitchScope={isAdmin}
      />
    </div>
  )
}
