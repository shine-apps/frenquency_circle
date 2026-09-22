import { z } from "zod"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles } from "@/db/schema"
import { fail, isUuid, ok } from "@/lib/api"
import { requireTeacher } from "@/lib/auth-utils"
import {
  PHONE_RE,
  WECHAT_RE,
  findUnapprovedTags,
  toCircleDTO,
} from "@/lib/circles"
import { COVER_IMAGES_MAX } from "@/lib/form-limits"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ circleId: string }> }

/** 老师可自主切换的状态(其余状态由管理员流程控制) */
const OWNER_CONTROLLABLE_STATUSES = ["active", "offline"] as const

/**
 * 教师后台更新圈子请求体 schema(部分更新,全部字段可选)。
 *
 * 与 C 端 `PUT /api/circles/:id` 的差异:
 * - 允许 `address` / `latitude` / `longitude`(后台表单用地图选点改地址)
 * - 允许 `status`(仅 `active` / `offline`,自主上下线)
 *
 * 「清空」语义(后台表单为全量提交,必须能清空字段):
 * - 联系方式:`""` 是合法输入,落库时写成 NULL
 * - `activityTime` / `maxMembers`:显式传 `null` 表示清空(不传 `undefined` 才表示不变)
 */
const updateTeacherCircleSchema = z
  .object({
    title: z.string().trim().min(2).max(50).optional(),
    description: z.string().min(10).max(1000).optional(),
    tags: z.array(z.string().trim().min(1).max(30)).min(1).max(5).optional(),
    address: z.string().min(1).max(200).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    activityTime: z.string().max(100).nullable().optional(),
    maxMembers: z.number().int().min(1).max(999).nullable().optional(),
    contactPhone: z.string().regex(PHONE_RE).optional().or(z.literal("")),
    wechat: z.string().regex(WECHAT_RE).optional().or(z.literal("")),
    /** 轮播图片 URL 数组(0-9 张)。空数组表示清空,undefined 表示不变 */
    coverImages: z.array(z.string().url()).max(COVER_IMAGES_MAX).optional(),
    /** 自主上下线:active 上线 / offline 下线 */
    status: z.enum(OWNER_CONTROLLABLE_STATUSES).optional(),
  })
  .refine(
    (data) =>
      // 只改状态 / 标题等非联系字段时跳过;提供了任一联系字段时至少一个非空
      (data.contactPhone === undefined && data.wechat === undefined) ||
      !!data.contactPhone ||
      !!data.wechat,
    { message: "至少填写一种联系方式(电话或微信)" }
  )
  .refine(
    // 经纬度是一对坐标,必须同时提供或同时不提供,避免出现半截坐标
    (data) =>
      (data.latitude === undefined && data.longitude === undefined) ||
      (data.latitude !== undefined && data.longitude !== undefined),
    { message: "经度与纬度需要同时提供" }
  )

/**
 * PATCH /api/teacher/circles/:circleId
 *
 * 老师编辑自己的圈子(字段更新 + 自主上下线)。
 *
 * 权限:
 * - 登录角色需为 TEACHER / ADMIN(`requireTeacher`)
 * - 圈子创建者本人;或 ADMIN(代管)
 *
 * 状态机(防止绕过管理员审核):
 * - 仅允许 `active ↔ offline`
 * - 当前状态为 `pending` / `rejected` / `violated` / `deleted` 时,任何 status 变更一律 403
 */
export async function PATCH(req: Request, context: RouteContext) {
  const { circleId } = await context.params

  // 1. 鉴权
  const guard = await requireTeacher()
  if (!guard.ok) return guard.response

  // 1.1 路径参数必须是 uuid,否则 Postgres 抛 22P02 → 500
  if (!isUuid(circleId)) {
    return fail(400, "circleId 格式不正确")
  }

  // 2. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = updateTeacherCircleSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }
  const input = parsed.data
  if (Object.keys(input).length === 0) {
    return fail(400, "没有提供任何更新字段")
  }

  // 3. 查圈子 + 归属校验
  const [circle] = await db.select().from(circles).where(eq(circles.id, circleId))
  if (!circle) {
    return fail(404, "圈子不存在")
  }
  const isOwner = circle.creatorId === guard.userId
  const isAdmin = guard.role === "ADMIN"
  if (!isOwner && !isAdmin) {
    return fail(403, "无权修改他人创建的圈子")
  }
  if (circle.status === "deleted") {
    return fail(400, "已删除的圈子不可编辑")
  }

  // 4. 状态机:老师只能在 active / offline 之间切换,不能绕过审核
  if (input.status !== undefined) {
    if (!(OWNER_CONTROLLABLE_STATUSES as readonly string[]).includes(circle.status)) {
      return fail(
        403,
        `当前圈子状态为「${circle.status}」,需等待管理员审核处理,不能自主变更状态`
      )
    }
  }

  // 5. 标签白名单(与建圈共用)
  let uniqueTags: string[] | undefined
  if (input.tags) {
    uniqueTags = Array.from(new Set(input.tags))
    const missing = await findUnapprovedTags(uniqueTags)
    if (missing.length > 0) {
      return fail(400, "部分标签不存在或未通过审核", { missingTags: missing })
    }
  }

  // 6. 组装更新补丁(仅更新已提供的字段)
  const updates: Partial<typeof circles.$inferInsert> = { updatedAt: new Date() }
  if (input.title !== undefined) updates.title = input.title
  if (input.description !== undefined) updates.description = input.description
  if (input.address !== undefined) updates.address = input.address
  if (input.latitude !== undefined) updates.latitude = input.latitude
  if (input.longitude !== undefined) updates.longitude = input.longitude
  // "" / null 都表示清空(表单全量提交时用户删空输入框即为清空)
  if (input.activityTime !== undefined) updates.activityTime = input.activityTime || null
  if (input.maxMembers !== undefined) updates.maxMembers = input.maxMembers ?? null
  if (input.contactPhone !== undefined) updates.contactPhone = input.contactPhone || null
  if (input.wechat !== undefined) updates.wechat = input.wechat || null
  if (input.coverImages !== undefined) updates.coverImages = input.coverImages
  if (input.status !== undefined) updates.status = input.status
  if (uniqueTags !== undefined) updates.tags = uniqueTags

  const [updated] = await db
    .update(circles)
    .set(updates)
    .where(eq(circles.id, circleId))
    .returning()

  logger.info(LOG_PREFIX.CIRCLE, "Teacher updated circle", {
    circleId,
    by: guard.userId,
    role: guard.role,
    status: input.status,
  })

  return ok(toCircleDTO(updated as typeof circles.$inferSelect))
}
