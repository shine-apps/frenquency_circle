import { fail, isUuid, ok } from "@/lib/api"
import { requireTeacher } from "@/lib/auth-utils"
import {
  assertTeacherStatusTransition,
  buildCourseUpdatePatch,
  getCourseWithLessons,
  softDeleteCourse,
  toCourseDTO,
  toCourseLessonDTO,
  updateCourse,
  updateCourseSchema,
  type UpdateCourseInput,
} from "@/lib/courses"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ courseId: string }> }

/**
 * 教师后台课程操作公共前置:鉴权 + id 合法性 + 查课程 + 归属校验。
 *
 * 归属规则与活动 / 圈子一致:创建者本人,或 ADMIN(代管)。
 * 通过时返回课程与课时;不通过时返回可直接 `return` 的响应。
 */
async function loadManageableCourse(courseId: string) {
  const guard = await requireTeacher()
  if (!guard.ok) return { ok: false as const, response: guard.response }

  // 路径参数必须是 uuid,否则 Postgres 抛 22P02 → 500
  if (!isUuid(courseId)) {
    return { ok: false as const, response: fail(400, "courseId 格式不正确") }
  }

  const loaded = await getCourseWithLessons(courseId)
  if (!loaded) {
    return { ok: false as const, response: fail(404, "课程不存在") }
  }
  if (loaded.course.creatorId !== guard.userId && guard.role !== "ADMIN") {
    return { ok: false as const, response: fail(403, "只有课程创建者可以操作课程") }
  }
  return {
    ok: true as const,
    ...loaded,
    userId: guard.userId,
    role: guard.role,
  }
}

/**
 * PATCH /api/teacher/courses/:courseId
 *
 * 教师编辑自己的课程(部分更新)。
 * - `lessons` 提供时全量替换(事务内删旧插新,顺序按数组下标);
 * - `status` 仅允许 `active | offline`,且课程当前必须是 `active` / `offline` ——
 *   教师不能自行把 `pending` 变 `active`(绕过审核),也不能把 `rejected` 变 `active`。
 */
export async function PATCH(req: Request, context: RouteContext) {
  const { courseId } = await context.params

  const loaded = await loadManageableCourse(courseId)
  if (!loaded.ok) return loaded.response

  const body = await req.json().catch(() => null)
  const parsed = updateCourseSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }
  const input = parsed.data as UpdateCourseInput
  if (Object.keys(input).length === 0) {
    return fail(400, "没有提供任何更新字段")
  }

  // 状态流转守卫(教师侧)
  if (input.status && !assertTeacherStatusTransition(loaded.course.status, input.status)) {
    return fail(403, "当前状态不允许该操作")
  }

  const updated = await updateCourse({
    courseId,
    patch: buildCourseUpdatePatch(input),
    ...(input.lessons !== undefined ? { lessons: input.lessons } : {}),
  })

  logger.info(LOG_PREFIX.COURSE, "Teacher updated course", {
    courseId,
    by: loaded.userId,
    role: loaded.role,
  })

  return ok(toCourseDTO(updated.course, updated.lessons.map(toCourseLessonDTO)))
}

/**
 * DELETE /api/teacher/courses/:courseId
 *
 * 软删除课程(置 `status=deleted`,终态,非硬删)。
 */
export async function DELETE(_req: Request, context: RouteContext) {
  const { courseId } = await context.params

  const loaded = await loadManageableCourse(courseId)
  if (!loaded.ok) return loaded.response

  await softDeleteCourse(courseId)

  logger.info(LOG_PREFIX.COURSE, "Teacher deleted course", {
    courseId,
    by: loaded.userId,
    role: loaded.role,
  })

  return ok({ id: courseId, status: "deleted" })
}
