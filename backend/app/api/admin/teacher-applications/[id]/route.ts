import { z } from "zod"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { teacherApplications, users } from "@/db/schema"
import { fail, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"
import type { TeacherApplicationDTO, CertificationFile } from "@/types/api"

const LOG_PREFIX_TA = "TEACHER_APP"

type RouteContext = { params: Promise<{ id: string }> }

/** 审批请求体 */
const reviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reviewNote: z.string().max(500).optional(),
})

/**
 * PATCH /api/admin/teacher-applications/:id
 *
 * 管理员审批教师认证申请。
 * - approved:升级用户为 TEACHER,标记申请已通过
 * - rejected:标记申请已驳回,记录驳回原因
 */
export async function PATCH(req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params

  const body = await req.json().catch(() => null)
  const parsed = reviewSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }

  const { status, reviewNote } = parsed.data

  // 查询申请
  const [app] = await db
    .select()
    .from(teacherApplications)
    .where(eq(teacherApplications.id, id))

  if (!app) {
    return fail(404, "认证申请不存在")
  }

  if (app.status !== "pending") {
    return fail(409, "该申请已处理,无法重复审批")
  }

  // 审批通过:升级用户为 TEACHER
  if (status === "approved") {
    await db
      .update(users)
      .set({ role: "TEACHER", updatedAt: new Date() })
      .where(eq(users.id, app.userId))
  }

  // 更新申请状态
  await db
    .update(teacherApplications)
    .set({
      status,
      reviewerId: guard.userId,
      reviewedAt: new Date(),
      reviewNote: reviewNote ?? null,
      updatedAt: new Date(),
    })
    .where(eq(teacherApplications.id, id))

  logger.info(LOG_PREFIX_TA, "Teacher application reviewed", {
    applicationId: id,
    status,
    userId: app.userId,
    by: guard.userId,
  })

  // 返回更新后的 DTO
  const [updated] = await db
    .select()
    .from(teacherApplications)
    .where(eq(teacherApplications.id, id))

  const dto: TeacherApplicationDTO = {
    id: updated.id,
    userId: updated.userId,
    circleId: updated.circleId ?? null,
    files: (updated.files as CertificationFile[]) ?? [],
    idCardFront: (updated.idCardFront as CertificationFile) ?? null,
    idCardBack: (updated.idCardBack as CertificationFile) ?? null,
    status: updated.status as "pending" | "approved" | "rejected",
    reviewNote: updated.reviewNote,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  }

  return ok(dto)
}
