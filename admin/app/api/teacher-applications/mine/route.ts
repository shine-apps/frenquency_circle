import { eq, desc } from "drizzle-orm"

import { db } from "@/lib/db"
import { teacherApplications } from "@/db/schema"
import { ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import type { TeacherApplicationDTO, CertificationFile } from "@/types/api"

/**
 * GET /api/teacher-applications/mine
 *
 * 查询当前用户最新的教师认证申请记录。
 * - 返回最近一条 teacher_application 或 null
 */
export async function GET(req: Request) {
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  const [row] = await db
    .select()
    .from(teacherApplications)
    .where(eq(teacherApplications.userId, userId))
    .orderBy(desc(teacherApplications.createdAt))
    .limit(1)

  if (!row) {
    return withCors(ok(null), req)
  }

  const dto: TeacherApplicationDTO = {
    id: row.id,
    userId: row.userId,
    circleId: row.circleId ?? null,
    files: (row.files as CertificationFile[]) ?? [],
    idCardFront: (row.idCardFront as CertificationFile) ?? null,
    idCardBack: (row.idCardBack as CertificationFile) ?? null,
    status: row.status as "pending" | "approved" | "rejected",
    reviewNote: row.reviewNote,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }

  return withCors(ok(dto), req)
}
