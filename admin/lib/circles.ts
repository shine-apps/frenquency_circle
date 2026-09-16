import { z } from "zod"
import { and, eq, gte, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import { circleMembers, circles, hobbyTags } from "@/db/schema"
import { CIRCLE_TAGS_MAX, COVER_IMAGES_MAX } from "@/lib/form-limits"
import { logger, LOG_PREFIX } from "@/lib/logger"
import { notifyAdmins } from "@/lib/notifications"
import { recordInterestEvents } from "@/lib/interest-events"
import type { CircleDTO } from "@/types/api"

/**
 * 圈子共享层:DTO 投影 + 创建校验 + 创建业务规则。
 *
 * `createCircle` 被 C 端接口(`POST /api/circles`)与教师后台接口
 * (`POST /api/teacher/circles`)共用,保证两条链路走同一套配额 / 标签 /
 * 通知 / 兴趣事件规则,避免规则漂移。
 */

/** 手机号格式(与 lib/sms/phone.ts PHONE_RE 一致) */
export const PHONE_RE = /^1[3-9]\d{9}$/
/** 微信号格式:字母开头,6-20 位,允许字母数字-_ */
export const WECHAT_RE = /^[a-zA-Z][-_a-zA-Z0-9]{5,19}$/

/** 24 小时内最多创建圈子数 */
export const DAILY_CREATE_LIMIT = 5

/**
 * 创建圈子请求体 schema。
 * - title: 2-50 字符(trim)
 * - tags: 1-5 个标签名称(1-30 字符)
 * - description: 10-1000 字符
 * - contactPhone / wechat: 至少填一种
 * - coverImages: 0-9 个图片 URL(可选)
 */
export const createCircleSchema = z
  .object({
    title: z.string().trim().min(2).max(50),
    tags: z
      .array(z.string().trim().min(1).max(30))
      .min(1)
      .max(CIRCLE_TAGS_MAX, `标签最多 ${CIRCLE_TAGS_MAX} 个`),
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

export type CreateCircleInput = z.infer<typeof createCircleSchema>

/**
 * circles 表行 → CircleDTO 投影。
 *
 * 圈子列表 / 我创建的圈子 / 我关注的圈子 / 某用户发布的圈子 / 管理员后台共用
 * 同一份映射,避免多处手写导致字段漂移(新增字段时只需改这里)。
 */
export function toCircleDTO(row: typeof circles.$inferSelect): CircleDTO {
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
    coverImages: row.coverImages ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * 找出「不存在或未通过审核」的标签名称(入参先去重,返回顺序与入参一致)。
 *
 * 创建与更新圈子两条链路共用,统一返回 400 + `{ missingTags }` 语义。
 */
export async function findUnapprovedTags(names: string[]): Promise<string[]> {
  const unique = Array.from(new Set(names))
  if (unique.length === 0) return []

  const rows = await db
    .select({ name: hobbyTags.name })
    .from(hobbyTags)
    .where(
      and(inArray(hobbyTags.name, unique), eq(hobbyTags.status, "approved"))
    )

  const approved = new Set(rows.map((row) => row.name))
  return unique.filter((name) => !approved.has(name))
}

/** 创建圈子结果:成功返回 circleId,失败返回给调用方直接响应的状态与文案 */
export type CreateCircleOutcome =
  | { ok: true; circleId: string; status: "pending" }
  | { ok: false; status: number; message: string; details?: unknown }

/**
 * 创建圈子(业务规则集中在此)。
 *
 * - 24 小时内最多创建 {@link DAILY_CREATE_LIMIT} 个,超限 429
 * - 标签必须存在且 `status='approved'`,否则 400 + `{ missingTags }`
 * - 落库时 `status='pending'`,等管理员审核通过后上线
 * - 自动插入 `circle_members(role='creator')`
 * - 扇出管理员通知 + 记录兴趣事件(均为旁路,失败仅 log)
 *
 * 入参 `input` 需由调用方用 {@link createCircleSchema} 校验过,
 * 以便路由统一处理 400 的 zod 错误细节。
 */
export async function createCircle(params: {
  creatorId: string
  input: CreateCircleInput
}): Promise<CreateCircleOutcome> {
  const { creatorId, input } = params

  // 1. 24h 配额校验
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  const recentCircles = await db
    .select({ id: circles.id })
    .from(circles)
    .where(
      and(
        eq(circles.creatorId, creatorId),
        gte(circles.createdAt, twentyFourHoursAgo)
      )
    )
  if (recentCircles.length >= DAILY_CREATE_LIMIT) {
    logger.warn(LOG_PREFIX.CIRCLE, "Create rejected: daily limit", {
      userId: creatorId,
    })
    return {
      ok: false,
      status: 429,
      message: `24 小时内创建圈子数量已达上限(${DAILY_CREATE_LIMIT} 个)`,
    }
  }

  // 2. 标签白名单校验
  const uniqueTags = Array.from(new Set(input.tags))
  const missing = await findUnapprovedTags(uniqueTags)
  if (missing.length > 0) {
    return {
      ok: false,
      status: 400,
      message: "部分标签不存在或未通过审核",
      details: { missingTags: missing },
    }
  }

  // 3. 插入圈子(status=pending,等待管理员审核,tags 直接写数组列)
  const [circleRow] = await db
    .insert(circles)
    .values({
      title: input.title,
      description: input.description,
      creatorId,
      latitude: input.latitude,
      longitude: input.longitude,
      address: input.address,
      contactPhone: input.contactPhone ?? null,
      wechat: input.wechat ?? null,
      activityTime: input.activityTime ?? null,
      maxMembers: input.maxMembers ?? null,
      memberCount: 0,
      status: "pending",
      coverImages: input.coverImages ?? [],
      tags: uniqueTags,
    })
    .returning({ id: circles.id })

  // 4. 插入 circle_members(role=creator)
  await db.insert(circleMembers).values({
    circleId: circleRow.id,
    userId: creatorId,
    role: "creator",
  })

  // 5. 通知所有管理员审核(写入即扇出,失败仅 log,不影响建圈主流程)
  await notifyAdmins({
    actorId: creatorId,
    entityType: "circle",
    entityId: circleRow.id,
    type: "circle_review",
    title: "新圈子待审核",
    content: `「${input.title}」已提交,等待管理员审核`,
    linkUrl: "/admin/circles",
    linkTarget: "admin",
    excludeUserId: creatorId, // 创建者本人若是管理员也不自收
  })

  // 6. 记录兴趣事件(旁路,失败仅 log,不影响建圈主流程)
  await recordInterestEvents([
    { userId: creatorId, tagNames: uniqueTags, eventType: "circle_tag_create" },
  ])

  logger.info(LOG_PREFIX.CIRCLE, "Circle created", {
    circleId: circleRow.id,
    creatorId,
  })

  return { ok: true, circleId: circleRow.id, status: "pending" }
}
