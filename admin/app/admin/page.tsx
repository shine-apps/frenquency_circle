import { desc, eq, gte, sql } from "drizzle-orm"
import { UsersIcon, CircleIcon, ZapIcon, TagIcon, AlertTriangleIcon } from "lucide-react"

import { db } from "@/lib/db"
import { users, circles, tags, locations } from "@/db/schema"
import { StatCard } from "@/components/stat-card"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"

export default async function AdminDashboardPage() {
  // 今日 00:00 UTC 作为分界点
  const now = new Date()
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  )

  const [
    [{ usersCount }],
    [{ circleCount }],
    [{ todayMatchCount }],
    [{ pendingTagCount }],
    [{ pendingCircleCount }],
    recentUsers,
  ] = await Promise.all([
    db.select({ usersCount: sql<number>`count(*)::int` }).from(users),
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
    db.select().from(users).orderBy(desc(users.createdAt)).limit(5),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          frenqency_circle 后台概览
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="用户"
          value={Number(usersCount)}
          description="总注册用户数"
          icon={<UsersIcon className="size-4 text-muted-foreground" />}
        />
        <StatCard
          label="圈子"
          value={Number(circleCount)}
          description="圈子总数(不含已删除)"
          icon={<CircleIcon className="size-4 text-muted-foreground" />}
        />
        <StatCard
          label="今日匹配"
          value={Number(todayMatchCount)}
          description="今日发布定位数"
          icon={<ZapIcon className="size-4 text-muted-foreground" />}
        />
        <StatCard
          label="待审标签"
          value={Number(pendingTagCount)}
          description="待审核的自定义标签"
          icon={<TagIcon className="size-4 text-muted-foreground" />}
        />
        <StatCard
          label="待审圈子"
          value={Number(pendingCircleCount)}
          description="违规待处理圈子"
          icon={<AlertTriangleIcon className="size-4 text-muted-foreground" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>最近注册用户</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentUsers.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={u.role === "ADMIN" ? "default" : "secondary"}
                    >
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.createdAt.toISOString().slice(0, 10)}
                  </TableCell>
                </TableRow>
              ))}
              {recentUsers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    暂无数据
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
