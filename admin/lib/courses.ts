import { z } from "zod"
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  courseLessonProgress,
  courseLessons,
  courses,
  type CourseStatus,
} from "@/db/schema"
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
import type {
  CourseDTO,
  CourseLessonDTO,
  CourseLessonProgressDTO,
  PublicCourseDTO,
  RecentCourseDTO,
} from "@/types/api"

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

/**
 * 课程行 → 用户端公开 DTO(uni-app 只读接口专用)。
 *
 * 与 {@link toCourseDTO} 的差异:只输出 C 端消费字段,剔除
 * `creatorId / status / reviewNote / reviewedAt` —— 审核驳回原因在课程
 * 重新上线后可能残留,不能随公开接口下发;创建者身份亦不外泄。
 *
 * - `lessons` 由调用方传入(详情场景),列表场景传空数组只给 `lessonCount`;
 * - `lessonCount` 默认取 lessons 数量,列表场景(无课时明细)显式传入聚合值。
 */
export function toPublicCourseDTO(
  row: typeof courses.$inferSelect,
  lessons: CourseLessonDTO[] = [],
  lessonCount?: number
): PublicCourseDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    coverImages: row.coverImages ?? [],
    tags: row.tags ?? [],
    lessons,
    lessonCount: lessonCount ?? lessons.length,
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

// ============================================================================
// 课时播放进度(course_lesson_progress)
// ============================================================================

/** "最近学习"窗口:超过该天数的进度不再视为最近 */
export const RECENT_PROGRESS_WINDOW_DAYS = 90
/** "最近学习"列表最大返回条数(防异常用户塞满) */
export const RECENT_PROGRESS_LIMIT_MAX = 50

/**
 * 上报/更新单课时播放进度(upsert)。
 *
 * 校验:
 * - lesson 必须存在且所属课程 `status='active'`(否则视为已下线,返回 404);
 * - 位置:
 *   - 负数 / NaN → 0;
 *   - 超过课程 `duration_seconds` → 裁剪到 duration(duration 为 null 时不裁剪)。
 *
 * @throws `LessonNotFoundError` lesson 不存在 / 所属课程未上线
 */
export async function recordLessonProgress(params: {
  userId: string
  lessonId: string
  positionSeconds: number
}): Promise<CourseLessonProgressDTO> {
  const { userId, lessonId, positionSeconds } = params

  // 1. 校验课时与课程状态,同时取 duration 用于裁剪
  const [lesson] = await db
    .select({
      duration: courseLessons.durationSeconds,
      courseStatus: courses.status,
    })
    .from(courseLessons)
    .innerJoin(courses, eq(courses.id, courseLessons.courseId))
    .where(eq(courseLessons.id, lessonId))
    .limit(1)

  if (!lesson || lesson.courseStatus !== "active") {
    throw new LessonNotFoundError()
  }

  // 2. 位置裁剪(纯函数 clampPosition 单测覆盖)
  const safePosition = clampPosition(positionSeconds, lesson.duration)

  // 3. Upsert:用 onConflictDoUpdate,updated_at 永远刷新,
  //    是"最近学习"列表的排序依据
  const [row] = await db
    .insert(courseLessonProgress)
    .values({ userId, lessonId, positionSeconds: safePosition })
    .onConflictDoUpdate({
      target: [courseLessonProgress.userId, courseLessonProgress.lessonId],
      set: { positionSeconds: safePosition, updatedAt: new Date() },
    })
    .returning({
      lessonId: courseLessonProgress.lessonId,
      positionSeconds: courseLessonProgress.positionSeconds,
      updatedAt: courseLessonProgress.updatedAt,
    })

  if (!row) {
    // returning 为空一般是 RLS / 触发器异常,数据库可达时几乎不可能发生
    throw new Error("recordLessonProgress: upsert returned no row")
  }

  return {
    lessonId: row.lessonId,
    positionSeconds: row.positionSeconds,
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * 拉取单课程内当前用户的所有课时进度。
 *
 * - join `course_lessons` 限定只返回该课程下的进度;
 * - 不存在的 courseId / 非 active 课程 → 返回空数组(语义等价于"用户没看过")。
 */
export async function getCourseProgress(
  userId: string,
  courseId: string
): Promise<CourseLessonProgressDTO[]> {
  const rows = await db
    .select({
      lessonId: courseLessonProgress.lessonId,
      positionSeconds: courseLessonProgress.positionSeconds,
      updatedAt: courseLessonProgress.updatedAt,
    })
    .from(courseLessonProgress)
    .innerJoin(courseLessons, eq(courseLessons.id, courseLessonProgress.lessonId))
    .where(
      and(
        eq(courseLessonProgress.userId, userId),
        eq(courseLessons.courseId, courseId)
      )
    )

  return rows.map((r) => ({
    lessonId: r.lessonId,
    positionSeconds: r.positionSeconds,
    updatedAt: r.updatedAt.toISOString(),
  }))
}

/**
 * "最近学习"列表(按 updated_at desc,聚合到课程粒度)。
 *
 * 实现要点:
 * 1. 拉最近 {@link RECENT_PROGRESS_WINDOW_DAYS} 天内全部进度行(单用户数据量有限,
 *    内存聚合完全够用,免去窗口函数的额外复杂度);
 * 2. 按课程 ID group,每课程只保留最新一条(updated_at 倒序扫描中第一条命中);
 * 3. 批量 join 课程行,过滤掉已下线 / 已删除(只返回 active);
 * 4. 输出按 lastPlayedAt 倒序,截断到 `limit`。
 */
export async function getRecentCourseProgress(
  userId: string,
  options: { limit?: number } = {}
): Promise<RecentCourseDTO[]> {
  const limit = Math.min(
    options.limit ?? RECENT_PROGRESS_LIMIT_MAX,
    RECENT_PROGRESS_LIMIT_MAX
  )
  const cutoff = new Date(
    Date.now() - RECENT_PROGRESS_WINDOW_DAYS * 24 * 60 * 60 * 1000
  )

  // 1. 拉用户窗口内全部进度行(join lessons 拿课时标题 / sortOrder / 课程 id)
  const progressRows = await db
    .select({
      lessonId: courseLessonProgress.lessonId,
      positionSeconds: courseLessonProgress.positionSeconds,
      updatedAt: courseLessonProgress.updatedAt,
      courseId: courseLessons.courseId,
      lessonTitle: courseLessons.title,
      lessonSortOrder: courseLessons.sortOrder,
    })
    .from(courseLessonProgress)
    .innerJoin(courseLessons, eq(courseLessons.id, courseLessonProgress.lessonId))
    .where(
      and(
        eq(courseLessonProgress.userId, userId),
        gte(courseLessonProgress.updatedAt, cutoff)
      )
    )
    .orderBy(desc(courseLessonProgress.updatedAt))

  if (progressRows.length === 0) return []

  // 2. 内存 group by courseId,取每课程第一行(已按 updated_at desc)
  const latestByCourse = new Map<string, (typeof progressRows)[number]>()
  for (const row of progressRows) {
    if (!latestByCourse.has(row.courseId)) {
      latestByCourse.set(row.courseId, row)
    }
  }

  // 3. 拉课程(仅 active),过滤掉已下线的课程
  const courseIds = [...latestByCourse.keys()]
  const courseRows = await db
    .select()
    .from(courses)
    .where(and(inArray(courses.id, courseIds), eq(courses.status, "active")))

  const activeCourses = new Map(courseRows.map((c) => [c.id, c]))

  // 4. 组装 DTO;按 lastPlayedAt 倒序(已按 progress.updated_at desc 入 map,顺序保留)
  const result: RecentCourseDTO[] = []
  for (const row of latestByCourse.values()) {
    const courseRow = activeCourses.get(row.courseId)
    if (!courseRow) continue
    result.push({
      course: toPublicCourseDTO(courseRow),
      lastLessonId: row.lessonId,
      lastLessonTitle: row.lessonTitle,
      lastLessonSortOrder: row.lessonSortOrder,
      lastPositionSeconds: row.positionSeconds,
      lastPlayedAt: row.updatedAt.toISOString(),
    })
  }
  return result.slice(0, limit)
}

/** lesson 不存在 / 已下线的错误标记,路由层捕获后转 404 */
export class LessonNotFoundError extends Error {
  constructor() {
    super("LessonNotFound")
    this.name = "LessonNotFoundError"
  }
}

/**
 * 播放位置裁剪(纯函数,便于单元测试)。
 *
 * - 非有限数(NaN / Infinity)→ 0;
 * - 负数 → 0;
 * - 向下取整(秒级精度);
 * - 超过 `duration` → 钳到 `duration`(duration 为 null 时不裁剪,允许探测
 *   失败时仍上报位置;客户端后续 seek 时按真实 duration 自行判断)。
 *
 * @example clampPosition(5.9, 100) // 5
 * @example clampPosition(-1, 100)   // 0
 * @example clampPosition(150, 100) // 100
 * @example clampPosition(60, null) // 60
 */
export function clampPosition(
  position: number,
  duration: number | null
): number {
  if (!Number.isFinite(position)) return 0
  let safe = Math.max(0, Math.floor(position))
  if (duration !== null && safe > duration) safe = duration
  return safe
}
