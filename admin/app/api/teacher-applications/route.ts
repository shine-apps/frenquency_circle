import { z } from "zod"
import { eq, desc } from "drizzle-orm"

import { db } from "@/lib/db"
import { teacherApplications } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"

const LOG_PREFIX_TA = "TEACHER_APP"

/** 单个文件对象 */
const fileObj = z.object({
  url: z.string().url(),
  key: z.string(),
  size: z.number().int().positive(),
  mimeType: z.string(),
  originalName: z.string(),
})

/** 身份证图片(必须为图片) */
const idCardObj = fileObj.refine(
  (f) => f.mimeType.startsWith("image/"),
  "身份证必须为图片"
)

/** 提交认证材料 schema:1-5 个材料 + 身份证正反面(必填) */
const submitCertSchema = z.object({
  files: z
    .array(fileObj)
    .min(1, "至少上传 1 个认证材料")
    .max(5, "最多上传 5 个认证材料"),
  idCardFront: idCardObj,
  idCardBack: idCardObj,
})

/**
 * POST /api/teacher-applications
 *
 * USER 角色提交教师认证材料,创建一条独立的 teacher_application 记录。
 * - 仅 USER 角色可调
 * - 已有 pending 申请时不可重复提交
 * - 文件数量 1-5 个
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id
  const role = guard.user.role

  if (role !== "USER") {
    return withCors(
      fail(403, role === "TEACHER" ? "已是认证教师,无需重复申请" : "无权操作"),
      req
    )
  }

  // 检查是否已有 pending 申请
  const [existing] = await db
    .select({ id: teacherApplications.id })
    .from(teacherApplications)
    .where(eq(teacherApplications.userId, userId))
    .orderBy(desc(teacherApplications.createdAt))
    .limit(1)

  if (existing) {
    // 同时查状态(需要单独查或改上面 select)
    const [existingFull] = await db
      .select()
      .from(teacherApplications)
      .where(eq(teacherApplications.id, existing.id))

    if (existingFull && existingFull.status === "pending") {
      return withCors(
        fail(409, "已有待审核的认证申请,请等待管理员审核"),
        req
      )
    }
  }

  // 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = submitCertSchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  // 插入 teacher_application(circleId 为 null,独立认证)
  const [row] = await db
    .insert(teacherApplications)
    .values({
      userId,
      circleId: null as any, // Drizzle 类型暂不兼容 nullable uuid,需要强制转换
      files: parsed.data.files,
      idCardFront: parsed.data.idCardFront,
      idCardBack: parsed.data.idCardBack,
      status: "pending",
    })
    .returning({ id: teacherApplications.id })

  logger.info(LOG_PREFIX_TA, "Teacher application submitted", {
    userId,
    applicationId: row.id,
    fileCount: parsed.data.files.length,
    hasIdCard: true,
  })

  return withCors(
    ok({ applicationId: row.id, status: "pending" }, { status: 201 }),
    req
  )
}
