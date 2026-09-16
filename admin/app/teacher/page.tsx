import Link from "next/link"
import { redirect } from "next/navigation"
import { and, eq, ne, sql } from "drizzle-orm"
import {
  CalendarCheckIcon,
  CalendarXIcon,
  CircleIcon,
  CircleOffIcon,
  ClockIcon,
  CheckCircleIcon,
} from "lucide-react"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { activities, circles } from "@/db/schema"
import { StatCard } from "@/components/stat-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

/**
 * 教师后台概览页(server component)。
 *
 * 统计口径与列表页一致:只统计自己创建的资源,且排除已删除的圈子,
 * 避免"概览数 10、列表只显示 8"这类口径不一致。
 */

/** 把 `groupBy(status)` 的结果压成 `{ status: count }` */
function toCountMap(rows: { status: string; value: number }[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const row of rows) {
    map[row.status] = Number(row.value)
  }
  return map
}

export default async function TeacherDashboardPage() {
  const session = await auth()
  // layout 已校验;这里再兜一次以收窄类型,避免用 `?? ""` 拼出非法 uuid 查询
  const userId = session?.user?.id
  if (!userId) redirect("/login")
  const displayName = session?.user?.name || session?.user?.email || "老师"

  const [circleRows, activityRows] = await Promise.all([
    db
      .select({ status: circles.status, value: sql<number>`count(*)::int` })
      .from(circles)
      .where(and(eq(circles.creatorId, userId), ne(circles.status, "deleted")))
      .groupBy(circles.status),
    db
      .select({ status: activities.status, value: sql<number>`count(*)::int` })
      .from(activities)
      .where(eq(activities.creatorId, userId))
      .groupBy(activities.status),
  ])

  const circleCounts = toCountMap(circleRows)
  const activityCounts = toCountMap(activityRows)

  const circleTotal =
    (circleCounts.active ?? 0) +
    (circleCounts.pending ?? 0) +
    (circleCounts.offline ?? 0) +
    (circleCounts.rejected ?? 0) +
    (circleCounts.violated ?? 0)
  const activityTotal = (activityCounts.active ?? 0) + (activityCounts.cancelled ?? 0)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">概览</h1>
        <p className="text-sm text-muted-foreground">
          {displayName}，这里可以管理你创建的圈子与活动
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">我的圈子</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="全部"
            value={circleTotal}
            description="不含已删除"
            icon={<CircleIcon className="size-4 text-muted-foreground" />}
          />
          <StatCard
            label="待审核"
            value={circleCounts.pending ?? 0}
            description="等待管理员审核"
            icon={<ClockIcon className="size-4 text-muted-foreground" />}
          />
          <StatCard
            label="已上线"
            value={circleCounts.active ?? 0}
            description="用户可见"
            icon={<CheckCircleIcon className="size-4 text-muted-foreground" />}
          />
          <StatCard
            label="已下线"
            value={circleCounts.offline ?? 0}
            description="暂不展示"
            icon={<CircleOffIcon className="size-4 text-muted-foreground" />}
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">我的活动</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          <StatCard
            label="全部"
            value={activityTotal}
            description="含已取消"
            icon={<CalendarCheckIcon className="size-4 text-muted-foreground" />}
          />
          <StatCard
            label="进行中"
            value={activityCounts.active ?? 0}
            description="用户可见"
            icon={<CheckCircleIcon className="size-4 text-muted-foreground" />}
          />
          <StatCard
            label="已取消"
            value={activityCounts.cancelled ?? 0}
            description="不再展示"
            icon={<CalendarXIcon className="size-4 text-muted-foreground" />}
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>快捷操作</CardTitle>
          <CardDescription>
            新建的圈子需要管理员审核后才会对外展示，活动发布后立即生效；
            审核结果会通过小程序通知你
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {/* 渲染成 <a> 而非 <button>,必须显式告知 Base UI,否则丢按钮语义并告警 */}
          <Button
            render={<Link href="/teacher/circles" />}
            nativeButton={false}
            variant="outline"
          >
            <CircleIcon />
            管理我的圈子
          </Button>
          <Button
            render={<Link href="/teacher/activities" />}
            nativeButton={false}
            variant="outline"
          >
            <CalendarCheckIcon />
            管理我的活动
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
