import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { courses } from "@/db/schema"
import { fail, isUuid, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import {
  adminCourseStatusSchema,
  getCourseWithLessons,
  toCourseDTO,
  toCourseLessonDTO,
} from "@/lib/courses"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PATCH /api/admin/courses/:id
 *
 * 管理员审核 / 上下线课程:
 * - `pending → active`:通过(写 reviewerId / reviewedAt);
 * - `→ rejected`:驳回(写 reviewerId / reviewedAt / reviewNote);
 * - `active ⇄ offline`:下线 / 恢复上线。
 *
 * `reviewerId` / `reviewedAt` 对每次管理员操作都写入(审计字段)。
 *
 * 不发审核结果通知:通知的 admin 铃铛只服务 ADMIN,教师读不到,
 * 且小程序端本期没有课程页(见设计文档 §3 决策 7)。
 */
export async function PATCH(req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params
  // 路径参数必须是 uuid,否则 Postgres 抛 22P02 → 500
  if (!isUuid(id)) {
    return fail(400, "id 格式不正确")
  }

  const body = await req.json().catch(() => null)
  const parsed = adminCourseStatusSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }
  const { status, reviewNote } = parsed.data

  const loaded = await getCourseWithLessons(id)
  if (!loaded) {
    return fail(404, "课程不存在")
  }

  const [updated] = await db
    .update(courses)
    .set({
      status,
      reviewerId: guard.userId,
      reviewedAt: new Date(),
      ...(reviewNote !== undefined ? { reviewNote: reviewNote || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(courses.id, id))
    .returning()

  logger.info(LOG_PREFIX.COURSE, "Admin updated course status", {
    courseId: id,
    status,
    by: guard.userId,
  })

  return ok(toCourseDTO(updated, loaded.lessons.map(toCourseLessonDTO)))
}
