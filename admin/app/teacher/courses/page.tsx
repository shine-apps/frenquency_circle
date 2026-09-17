import { redirect } from "next/navigation"
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { courseLessons, courses, users } from "@/db/schema"
import { toCourseDTO, toCourseLessonDTO } from "@/lib/courses"
import { TeacherCoursesTable, type TeacherCourseItem } from "./_components/courses-table"

/** SSR 课程列表上限(与教师后台其他页一致的简化分页策略) */
const SSR_COURSE_LIMIT = 200

/**
 * 教师后台「我的课程」页(server component)。
 *
 * - 默认只查自己创建的课程(已删除课程为终态,不出现在列表);
 * - ADMIN 可带 `?scope=all` 查看全部(代管);
 * - 数据直接 SSR 查库(含课时,编辑表单无需再发请求),
 *   写操作走 `/api/teacher/courses/*`。
 */
export default async function TeacherCoursesPage({
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
    .select({ course: courses, creatorName: users.name })
    .from(courses)
    .innerJoin(users, eq(users.id, courses.creatorId))
    .where(
      and(
        ne(courses.status, "deleted"),
        scope === "all" ? undefined : eq(courses.creatorId, userId)
      )
    )
    .orderBy(desc(courses.createdAt))
    .limit(SSR_COURSE_LIMIT)

  // 一次查出本页课程全部课时,按课程分组(避免编辑表单额外请求)
  const courseIds = rows.map((row) => row.course.id)
  const lessonRows = courseIds.length
    ? await db
        .select()
        .from(courseLessons)
        .where(inArray(courseLessons.courseId, courseIds))
        .orderBy(asc(courseLessons.sortOrder))
    : []
  const lessonsByCourse = new Map<string, (typeof courseLessons.$inferSelect)[]>()
  for (const lesson of lessonRows) {
    const list = lessonsByCourse.get(lesson.courseId) ?? []
    list.push(lesson)
    lessonsByCourse.set(lesson.courseId, list)
  }

  const items: TeacherCourseItem[] = rows.map(({ course, creatorName }) => ({
    ...toCourseDTO(course, (lessonsByCourse.get(course.id) ?? []).map(toCourseLessonDTO)),
    creatorName,
    canManage: course.creatorId === userId || isAdmin,
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">我的课程</h1>
        <p className="text-sm text-muted-foreground">
          {scope === "all" ? "全部课程" : "你创建的课程"}，共 {items.length} 个
          {items.length >= SSR_COURSE_LIMIT ? `（仅展示最近 ${SSR_COURSE_LIMIT} 条）` : ""}
        </p>
      </div>

      <TeacherCoursesTable items={items} scope={scope} canSwitchScope={isAdmin} />
    </div>
  )
}
