import { z } from "zod"
import { asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { courseLessons, courses, type CourseStatus } from "@/db/schema"
import {
  CIRCLE_TAGS_MAX,
  COVER_IMAGES_MAX,
  COURSE_DESCRIPTION_MAX,
  COURSE_LESSONS_MAX,
  COURSE_REVIEW_NOTE_MAX,
  COURSE_TITLE_MAX,
  LESSON_DESCRIPTION_MAX,
  LESSON_TITLE_MAX,
} from "@/lib/form-limits"
import type { CourseDTO, CourseLessonDTO } from "@/types/api"

/**
 * 视频课程共享层(教师后台 / 管理后台共用)。
 *
 * 与 lib/activities.ts / lib/circles.ts 同构:校验 schema、DTO 投影、
 * 事务化落库与状态机集中在这里,路由只做鉴权与薄壳转发,
 * 保证两条链路的字段口径一致。
 */

/** 课程简介危险片段守卫(与 lib/activities.ts 同款正则,防绕过前端直调 API) */
const DANGEROUS_HTML = /<script|<iframe| on\w+\s*=|javascript:/i

/** 课程简介(纯文本)校验 */
export const courseDescriptionSchema = z
  .string()
  .trim()
  .min(10, "课程简介至少 10 字")
  .max(COURSE_DESCRIPTION_MAX, `课程简介过长(上限 ${COURSE_DESCRIPTION_MAX} 字)`)
  .refine((v) => !DANGEROUS_HTML.test(v), {
    message: "课程简介包含不允许的内容(脚本/iframe/内联事件)",
  })

const coverImagesSchema = z
  .array(z.string().url("封面图片需为有效 URL"))
  .max(COVER_IMAGES_MAX, `封面图片最多 ${COVER_IMAGES_MAX} 张`)

const tagsSchema = z
  .array(z.string().trim().min(1, "标签不能为空").max(50, "标签过长"))
  .max(CIRCLE_TAGS_MAX, `兴趣标签最多 ${CIRCLE_TAGS_MAX} 个`)

/**
 * 课时输入。`sortOrder` 不由客户端提交,由提交顺序派生(见 `deriveSortOrder`),
 * 避免"客户端传的顺序与数组顺序不一致"这类口径漂移。
 */
export const courseLessonInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "课时标题不能为空")
    .max(LESSON_TITLE_MAX, `课时标题过长(上限 ${LESSON_TITLE_MAX} 字)`),
  description: z
    .string()
    .trim()
    .max(LESSON_DESCRIPTION_MAX, `课时简介过长(上限 ${LESSON_DESCRIPTION_MAX} 字)`)
    .default(""),
  /** COS 直传后的公网 URL */
  videoUrl: z.string().url("课时视频需为有效 URL"),
  durationSeconds: z
    .number()
    .int("视频时长必须是整数")
    .min(0, "视频时长不能为负")
    .max(24 * 3600, "视频时长过长")
    .nullable()
    .default(null),
})

export type CourseLessonInput = z.infer<typeof courseLessonInputSchema>

const lessonsSchema = z
  .array(courseLessonInputSchema)
  .min(1, "至少需要 1 个课时")
  .max(COURSE_LESSONS_MAX, `课时最多 ${COURSE_LESSONS_MAX} 个`)

/** 创建课程输入(status 恒为 pending,不接受客户端指定) */
export const createCourseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "课程标题至少 2 字")
    .max(COURSE_TITLE_MAX, `课程标题过长(上限 ${COURSE_TITLE_MAX} 字)`),
  description: courseDescriptionSchema,
  coverImages: coverImagesSchema.default([]),
  tags: tagsSchema.default([]),
  lessons: lessonsSchema,
})

export type CreateCourseInput = z.infer<typeof createCourseSchema>

/** 更新课程输入(全可选;lessons 提供即全量替换) */
export const updateCourseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "课程标题至少 2 字")
    .max(COURSE_TITLE_MAX, `课程标题过长(上限 ${COURSE_TITLE_MAX} 字)`)
    .optional(),
  description: courseDescriptionSchema.optional(),
  coverImages: coverImagesSchema.optional(),
  tags: tagsSchema.optional(),
  lessons: lessonsSchema.optional(),
  status: z.enum(["active", "offline"]).optional(),
})

export type UpdateCourseInput = z.infer<typeof updateCourseSchema>

/**
 * 管理端状态流转入参。
 * `deleted` 由创建者 DELETE 触发;`pending` 由创建时自动设置,均不走此接口。
 */
export const adminCourseStatusSchema = z.object({
  status: z.enum(["active", "offline", "rejected"]),
  reviewNote: z
    .string()
    .trim()
    .max(COURSE_REVIEW_NOTE_MAX, `审核备注过长(上限 ${COURSE_REVIEW_NOTE_MAX} 字)`)
    .optional(),
})

/** 教师可发起的状态流转(只允许在已上线的课程间上下线) */
const TEACHER_TRANSITIONS: Record<CourseStatus, CourseStatus[]> = {
  pending: [],
  active: ["offline"],
  offline: ["active"],
  rejected: [],
  deleted: [],
}

/**
 * 教师侧状态流转守卫。返回 false 时调用方回 403:
 * - 把 `pending` 变 `active`(绕过审核);
 * - 把 `rejected` 变 `active`(需管理员重新放行);
 * - 对 `deleted`(终态)的任何操作。
 */
export function assertTeacherStatusTransition(
  current: CourseStatus,
  next: CourseStatus
): boolean {
  return TEACHER_TRANSITIONS[current]?.includes(next) ?? false
}

/** 提交顺序 → sortOrder(表单即真相,数组下标即展示顺序) */
export function deriveSortOrder(lessons: CourseLessonInput[]): number[] {
  return lessons.map((_, index) => index)
}

/** 课时行 → DTO */
export function toCourseLessonDTO(
  row: typeof courseLessons.$inferSelect
): CourseLessonDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    videoUrl: row.videoUrl,
    durationSeconds: row.durationSeconds ?? null,
    sortOrder: row.sortOrder,
  }
}

/**
 * 课程行 → DTO。
 *
 * - `lessons` 由调用方传入(列表 / 编辑 / 详情场景均已加载,按 sortOrder 升序);
 * - `lessonCount` 默认取 lessons 数量;只想要计数时可显式传入覆盖。
 */
export function toCourseDTO(
  row: typeof courses.$inferSelect,
  lessons: CourseLessonDTO[] = [],
  lessonCount?: number
): CourseDTO {
  return {
    id: row.id,
    creatorId: row.creatorId,
    title: row.title,
    description: row.description,
    coverImages: row.coverImages ?? [],
    tags: row.tags ?? [],
    status: row.status,
    lessons,
    lessonCount: lessonCount ?? lessons.length,
    reviewNote: row.reviewNote ?? null,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** 由部分更新入参构造 `update().set()` 的补丁(仅含已提供字段 + updatedAt) */
export function buildCourseUpdatePatch(
  input: UpdateCourseInput
): Partial<typeof courses.$inferInsert> {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.coverImages !== undefined ? { coverImages: input.coverImages } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    updatedAt: new Date(),
  }
}

/** 课时输入 → course_lessons 插入值(sortOrder 按数组下标派生) */
function toLessonInsert(
  courseId: string,
  lessons: CourseLessonInput[]
): (typeof courseLessons.$inferInsert)[] {
  return lessons.map((lesson, index) => ({
    courseId,
    title: lesson.title,
    description: lesson.description ?? "",
    videoUrl: lesson.videoUrl,
    durationSeconds: lesson.durationSeconds ?? null,
    sortOrder: index,
  }))
}

/** 创建课程(事务:课程 + 课时同成败),status 恒为 pending */
export async function createCourse(params: {
  creatorId: string
  input: CreateCourseInput
}): Promise<{
  course: typeof courses.$inferSelect
  lessons: (typeof courseLessons.$inferSelect)[]
}> {
  const { creatorId, input } = params
  return db.transaction(async (tx) => {
    const [course] = await tx
      .insert(courses)
      .values({
        creatorId,
        title: input.title,
        description: input.description,
        coverImages: input.coverImages ?? [],
        tags: input.tags ?? [],
        status: "pending",
      })
      .returning()

    const lessonRows = await tx
      .insert(courseLessons)
      .values(toLessonInsert(course.id, input.lessons))
      .returning()

    return { course, lessons: lessonRows }
  })
}

/** 按课程加载课时(按 sortOrder 升序) */
export async function listCourseLessons(
  courseId: string
): Promise<(typeof courseLessons.$inferSelect)[]> {
  return db
    .select()
    .from(courseLessons)
    .where(eq(courseLessons.courseId, courseId))
    .orderBy(asc(courseLessons.sortOrder))
}

/** 加载课程及其课时(不存在返回 null) */
export async function getCourseWithLessons(courseId: string): Promise<{
  course: typeof courses.$inferSelect
  lessons: (typeof courseLessons.$inferSelect)[]
} | null> {
  const [course] = await db.select().from(courses).where(eq(courses.id, courseId))
  if (!course) return null
  const lessons = await listCourseLessons(courseId)
  return { course, lessons }
}

/**
 * 更新课程(事务)。`lessons` 提供时全量替换(删旧插新),顺序按数组下标 ——
 * 表单即真相,避免局部 diff 带来的顺序 / 遗漏 bug。
 */
export async function updateCourse(params: {
  courseId: string
  patch: Partial<typeof courses.$inferInsert>
  lessons?: CourseLessonInput[]
}): Promise<{
  course: typeof courses.$inferSelect
  lessons: (typeof courseLessons.$inferSelect)[]
}> {
  const { courseId, patch, lessons } = params
  return db.transaction(async (tx) => {
    const [course] = await tx
      .update(courses)
      .set(patch)
      .where(eq(courses.id, courseId))
      .returning()

    let lessonRows = await tx
      .select()
      .from(courseLessons)
      .where(eq(courseLessons.courseId, courseId))
      .orderBy(asc(courseLessons.sortOrder))

    if (lessons) {
      await tx.delete(courseLessons).where(eq(courseLessons.courseId, courseId))
      if (lessons.length > 0) {
        lessonRows = await tx
          .insert(courseLessons)
          .values(toLessonInsert(courseId, lessons))
          .returning()
      } else {
        lessonRows = []
      }
    }

    return { course, lessons: lessonRows }
  })
}

/** 软删除课程(status=deleted,终态);归属校验由调用方完成 */
export async function softDeleteCourse(courseId: string): Promise<void> {
  await db
    .update(courses)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(eq(courses.id, courseId))
}
