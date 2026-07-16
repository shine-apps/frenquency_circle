import type { NextRequest } from "next/server"
import { z } from "zod"
import { and, desc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles, teacherApplications } from "@/db/schema"
import { fail, ok, parsePagination } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import type { CircleDTO, CertificationFile, Paginated } from "@/types/api"

/**
 * 管理后台圈子列表查询参数 schema。
 * - status: 可选,按状态筛选(active/offline/deleted/violated/pending/rejected)
 * - creator: 可选,按创建者 userId 筛选
 */
const listCirclesQuerySchema = z.object({
  status: z
    .enum(["active", "offline", "deleted", "violated", "pending", "rejected"])
    .optional(),
  creator: z.string().uuid().optional(),
})

/** 将 circles 表行转换为 CircleDTO */
function toCircleDTO(row: typeof circles.$inferSelect): CircleDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    creatorId: row.creatorId,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    contactPhone: row.contactPhone,
    wechat: row.wechat,
    activityTime: row.activityTime,
    maxMembers: row.maxMembers,
    memberCount: row.memberCount,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** 管理后台圈子列表项(含认证材料,用于审核展示) */
type AdminCircleListItem = CircleDTO & {
  /** 关联的教师认证材料(若该圈子由 USER 创建并提交了认证申请) */
  certificationFiles?: CertificationFile[] | null
}

/**
 * GET /api/admin/circles
 *
 * 管理后台圈子列表(需 ADMIN 权限)。
 * 支持按 status / creator 筛选 + 分页。
 * 默认按 createdAt 倒序(最新创建的在前)。
 * LEFT JOIN teacher_applications 返回认证材料供审核展示。
 *
 * 响应:`Paginated<AdminCircleListItem>`
 */
export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const pagination = parsePagination(req.nextUrl.searchParams)
  if (!pagination) return fail(400, "Invalid pagination")
  const { page, pageSize } = pagination
  const offset = (page - 1) * pageSize

  const parsed = listCirclesQuerySchema.safeParse({
    status: req.nextUrl.searchParams.get("status") ?? undefined,
    creator: req.nextUrl.searchParams.get("creator") ?? undefined,
  })
  if (!parsed.success) {
    return fail(400, "Invalid query parameters", parsed.error.flatten())
  }

  const { status, creator } = parsed.data

  // 组装筛选条件
  const conditions = []
  if (status) conditions.push(eq(circles.status, status))
  if (creator) conditions.push(eq(circles.creatorId, creator))

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        circle: circles,
        appFiles: teacherApplications.files,
        appStatus: teacherApplications.status,
      })
      .from(circles)
      .leftJoin(
        teacherApplications,
        eq(teacherApplications.circleId, circles.id)
      )
      .where(whereClause)
      .orderBy(desc(circles.createdAt))
      .limit(pageSize)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(circles)
      .where(whereClause),
  ])

  const list: AdminCircleListItem[] = rows.map((r) => ({
    ...toCircleDTO(r.circle),
    certificationFiles:
      r.appFiles && Array.isArray(r.appFiles)
        ? (r.appFiles as CertificationFile[])
        : null,
  }))

  const payload: Paginated<AdminCircleListItem> = {
    list,
    total: Number(count),
    page,
    pageSize,
  }
  return ok(payload)
}
