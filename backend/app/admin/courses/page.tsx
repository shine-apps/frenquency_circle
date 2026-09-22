import { and, asc, desc, eq, inArray, ne } from "drizzle-orm"

import { db } from "@/lib/db"
import { courseLessons, courses, users } from "@/db/schema"
import { toCourseDTO, toCourseLessonDTO } from "@/lib/courses"
import { AdminCoursesTable, type AdminCourseItem } from "./_components/courses-table"

// SSR 课程列表上限
const SSR_COURSE_LIMIT = 200

/**
 * 管理后台课程审核页(server component)。
 *
 * 直接从 db 查询课程(含除已删除外的所有状态),JOIN users 取创建者名称,
 * 一次查出全部课时供审核详情弹窗直接播放视频。
 */
export default async function AdminCoursesPage() {
  const rows = await db
    .select({ course: courses, creatorName: users.name })
    .from(courses)
    .innerJoin(users, eq(users.id, courses.creatorId))
    .where(and(ne(courses.status, "deleted")))
    .orderBy(desc(courses.createdAt))
    .limit(SSR_COURSE_LIMIT)

  // 一次查出本页课程全部课时,按课程分组(审核详情弹窗直接播放,无需再发请求)
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

  const items: AdminCourseItem[] = rows.map(({ course, creatorName }) => ({
    ...toCourseDTO(course, (lessonsByCourse.get(course.id) ?? []).map(toCourseLessonDTO)),
    creatorName,
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">课程管理</h1>
        <p className="text-sm text-muted-foreground">
          共 {items.length} 个课程{items.length >= SSR_COURSE_LIMIT ? `（仅展示最近 ${SSR_COURSE_LIMIT} 条）` : ""}
        </p>
      </div>
      <AdminCoursesTable items={items} />
    </div>
  )
}
