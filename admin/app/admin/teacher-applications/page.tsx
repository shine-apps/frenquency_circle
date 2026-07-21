import { desc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { teacherApplications, users } from "@/db/schema"
import { TeacherApplicationsTable } from "./_components/teacher-applications-table"
import type {
  AdminTeacherApplicationItem,
  CertificationFile,
} from "@/types/api"

/** SSR 列表上限 */
const SSR_LIMIT = 200

/**
 * 管理后台教师认证审核页(server component)。
 * 从 db 查询独立认证申请(circle_id IS NULL),JOIN users 取申请人名称,
 * 子查询取审核人名称。
 */
export default async function AdminTeacherApplicationsPage() {
  const rows = await db
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
    .where(sql`${teacherApplications.circleId} IS NULL`)
    .orderBy(desc(teacherApplications.createdAt))
    .limit(SSR_LIMIT)

  const items: AdminTeacherApplicationItem[] = rows.map((r) => ({
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">教师认证审核</h1>
        <p className="text-sm text-muted-foreground">
          共 {items.length} 条认证申请
          {items.length >= SSR_LIMIT ? `（仅展示最近 ${SSR_LIMIT} 条）` : ""}
        </p>
      </div>
      <TeacherApplicationsTable items={items} />
    </div>
  )
}
