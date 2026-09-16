import { redirect } from "next/navigation"
import { and, desc, eq, ne } from "drizzle-orm"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { circles, hobbyTags, users } from "@/db/schema"
import { toCircleDTO } from "@/lib/circles"
import { TeacherCirclesTable, type TeacherCircleItem } from "./_components/circles-table"

/** SSR 圈子列表上限(与管理员后台保持一致的简化分页策略) */
const SSR_CIRCLE_LIMIT = 200
/** 表单可选的已审核标签上限 */
const TAG_LIMIT = 500

/**
 * 教师后台「我的圈子」页(server component)。
 *
 * - 默认只查自己创建的圈子;ADMIN 可带 `?scope=all` 查看全部(代管)
 * - 排除 `deleted`(软删圈子不进入教师视野)
 * - 数据直接 SSR 查库(与 `/admin/*` 页面一致),写操作走 `/api/teacher/circles/*`
 */
export default async function TeacherCirclesPage({
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
  // 非 ADMIN 传 scope=all 也无效,避免越权查看他人圈子
  const scope: "mine" | "all" = isAdmin && scopeParam === "all" ? "all" : "mine"

  const where =
    scope === "all"
      ? ne(circles.status, "deleted")
      : and(eq(circles.creatorId, userId), ne(circles.status, "deleted"))

  const [rows, tagRows] = await Promise.all([
    db
      .select({ circle: circles, creatorName: users.name })
      .from(circles)
      .innerJoin(users, eq(users.id, circles.creatorId))
      .where(where)
      .orderBy(desc(circles.createdAt))
      .limit(SSR_CIRCLE_LIMIT),
    db
      .select({ name: hobbyTags.name })
      .from(hobbyTags)
      .where(eq(hobbyTags.status, "approved"))
      .orderBy(hobbyTags.name)
      .limit(TAG_LIMIT),
  ])

  const items: TeacherCircleItem[] = rows.map(({ circle, creatorName }) => ({
    ...toCircleDTO(circle),
    creatorName,
    tags: circle.tags ?? [],
    canManage: circle.creatorId === userId || isAdmin,
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">我的圈子</h1>
        <p className="text-sm text-muted-foreground">
          {scope === "all" ? "全部老师的圈子" : "你创建的圈子"}，共 {items.length} 个
          {items.length >= SSR_CIRCLE_LIMIT ? `（仅展示最近 ${SSR_CIRCLE_LIMIT} 条）` : ""}
        </p>
      </div>

      <TeacherCirclesTable
        items={items}
        scope={scope}
        canSwitchScope={isAdmin}
        availableTags={tagRows.map((row) => row.name)}
      />
    </div>
  )
}
