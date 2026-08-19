import { z } from "zod"
import { and, eq, gte, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles, circleMembers, hobbyTags } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"
import { notifyAdmins } from "@/lib/notifications"

/** 手机号格式(与 lib/sms/phone.ts PHONE_RE 一致) */
const PHONE_RE = /^1[3-9]\d{9}$/
/** 微信号格式:字母开头,6-20 位,允许字母数字-_ */
const WECHAT_RE = /^[a-zA-Z][-_a-zA-Z0-9]{5,19}$/

/** 24 小时内最多创建圈子数 */
const DAILY_CREATE_LIMIT = 5
/** 轮播图片最大数量 */
const COVER_IMAGES_MAX = 9

/**
 * 创建圈子请求体 schema。
 * - title: 2-50 字符(trim)
 * - tags: 1-5 个标签名称(1-30 字符)
 * - description: 10-1000 字符
 * - contactPhone / wechat: 至少填一种
 * - coverImages: 0-9 个图片 URL(可选)
 */
const createCircleSchema = z
  .object({
    title: z.string().trim().min(2).max(50),
    tags: z.array(z.string().trim().min(1).max(30)).min(1).max(5),
    description: z.string().min(10).max(1000),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    address: z.string().min(1).max(200),
    contactPhone: z
      .string()
      .regex(PHONE_RE)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    wechat: z
      .string()
      .regex(WECHAT_RE)
      .optional()
      .or(z.literal("").transform(() => undefined)),
    activityTime: z.string().max(100).optional(),
    maxMembers: z.number().int().min(1).max(999).optional(),
    /** 轮播图片 URL 数组(0-9 个,可选) */
    coverImages: z
      .array(z.string().url())
      .max(COVER_IMAGES_MAX, `轮播图片最多 ${COVER_IMAGES_MAX} 张`)
      .optional()
      .default([]),
  })
  .refine((data) => data.contactPhone || data.wechat, {
    message: "至少填写一种联系方式(电话或微信)",
  })

/**
 * POST /api/circles
 *
 * 创建圈子(仅 TEACHER 角色可调)。
 * - 需先通过教师认证成为 TEACHER 才能创建圈子
 * - 圈子创建后 status=pending,管理员审核通过后上线
 * - 24 小时内最多创建 5 个,超限返回 429。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id
  const role = guard.user.role

  // 2. 角色门槛(仅 TEACHER 可创建圈子,需先通过教师认证)
  if (role !== "TEACHER") {
    return withCors(
      fail(403, role === "USER" ? "请先完成教师认证再创建圈子" : "仅认证教师可创建圈子"),
      req
    )
  }

  // 3. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = createCircleSchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  // 4. 24h 配额校验
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentCircles = await db
    .select({ id: circles.id })
    .from(circles)
    .where(
      and(
        eq(circles.creatorId, userId),
        gte(circles.createdAt, twentyFourHoursAgo)
      )
    )
  if (recentCircles.length >= DAILY_CREATE_LIMIT) {
    logger.warn(LOG_PREFIX.CIRCLE, "Create rejected: daily limit", { userId })
    return withCors(
      fail(429, "24 小时内创建圈子数量已达上限(5 个)"),
      req
    )
  }

  // 4.1 校验标签名称存在且通过审核(去重)
  const uniqueTags = Array.from(new Set(parsed.data.tags))
  const existingTags = await db
    .select({ name: hobbyTags.name })
    .from(hobbyTags)
    .where(
      and(
        inArray(hobbyTags.name, uniqueTags),
        eq(hobbyTags.status, "approved")
      )
    )
  const existingNames = new Set(existingTags.map((t) => t.name))
  const missing = uniqueTags.filter((name) => !existingNames.has(name))
  if (missing.length > 0) {
    return withCors(
      fail(400, "部分标签不存在或未通过审核", { missingTags: missing }),
      req
    )
  }

  // 5. 插入圈子(status=pending,等待管理员审核,tags 直接写数组列)
  const {
    title,
    description,
    latitude,
    longitude,
    address,
    contactPhone,
    wechat,
    activityTime,
    maxMembers,
    coverImages,
  } = parsed.data

  const [circleRow] = await db
    .insert(circles)
    .values({
      title,
      description,
      creatorId: userId,
      latitude,
      longitude,
      address,
      contactPhone: contactPhone ?? null,
      wechat: wechat ?? null,
      activityTime: activityTime ?? null,
      maxMembers: maxMembers ?? null,
      memberCount: 0,
      status: "pending",
      coverImages: coverImages ?? [],
      tags: uniqueTags,
    })
    .returning({ id: circles.id })

  // 6. 插入 circle_members(role=creator)
  await db.insert(circleMembers).values({
    circleId: circleRow.id,
    userId,
    role: "creator",
  })

  // 7. 通知所有管理员审核(写入即扇出,失败仅 log,不影响建圈主流程)
  await notifyAdmins({
    actorId: userId,
    entityType: "circle",
    entityId: circleRow.id,
    type: "circle_review",
    title: "新圈子待审核",
    content: `「${title}」已提交,等待管理员审核`,
    linkUrl: "/admin/circles",
    linkTarget: "admin",
    excludeUserId: userId, // 创建者本人若是管理员也不自收
  })

  logger.info(LOG_PREFIX.CIRCLE, "Circle created", {
    circleId: circleRow.id,
    creatorId: userId,
    role,
  })

  return withCors(
    ok({ circleId: circleRow.id, status: "pending" }, { status: 201 }),
    req
  )
}
