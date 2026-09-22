import { eq, desc, sql, and } from "drizzle-orm"

import { db } from "@/lib/db"
import { teacherApplications, users } from "@/db/schema"
import { fail, ok, parsePagination } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import type {
  AdminTeacherApplicationItem,
  CertificationFile,
} from "@/types/api"

/**
 * GET /api/admin/teacher-applications
 *
 * 管理员查询教师认证申请列表(分页,按 createdAt 倒序)。
 * 可选 status 筛选:?status=pending|approved|rejected
 */
export async function GET(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { searchParams } = new URL(req.url)
  const pagination = parsePagination(searchParams)
  if (!pagination) {
    return fail(400, "Invalid pagination params")
  }

  const statusFilter = searchParams.get("status")

  const where = statusFilter
    ? and(
        eq(teacherApplications.status, statusFilter),
        // 仅查独立认证(circle_id IS NULL),避免重复展示圈子关联的老记录
        sql`${teacherApplications.circleId} IS NULL`
      )
    : sql`${teacherApplications.circleId} IS NULL`

  const offset = (pagination.page - 1) * pagination.pageSize

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: teacherApplications.id,
        userId: teacherApplications.userId,
        circleId: teacherApplications.circleId,
        files: teacherApplications.files,
        idCardFront: teacherApplications.idCardFront,
        idCardBack: teacherApplications.idCardBack,
        status: teacherApplications.status,
        reviewNote: teacherApplications.reviewNote,
        createdAt: teacherApplications.createdAt,
        updatedAt: teacherApplications.updatedAt,
        userName: users.name,
        reviewerName: sql<string | null>`(${db
          .select({ name: users.name })
          .from(users)
          .where(eq(users.id, teacherApplications.reviewerId!))
          .limit(1)
        })`,
      })
      .from(teacherApplications)
      .innerJoin(users, eq(users.id, teacherApplications.userId))
      .where(where)
      .orderBy(desc(teacherApplications.createdAt))
      .limit(pagination.pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(teacherApplications)
      .where(where),
  ])

  const list: AdminTeacherApplicationItem[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    circleId: (r.circleId as string) ?? null,
    files: (r.files as CertificationFile[]) ?? [],
    idCardFront: (r.idCardFront as CertificationFile) ?? null,
    idCardBack: (r.idCardBack as CertificationFile) ?? null,
    status: r.status as "pending" | "approved" | "rejected",
    reviewNote: r.reviewNote,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    userName: r.userName,
    reviewerName: r.reviewerName ?? null,
  }))

  return ok({
    list,
    total: Number(count),
    page: pagination.page,
    pageSize: pagination.pageSize,
  })
}
