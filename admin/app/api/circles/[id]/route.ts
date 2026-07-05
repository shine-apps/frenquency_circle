import { z } from "zod"
import { count, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import {
  circles,
  circleTags,
  tags,
  contactLogs,
  users,
} from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { toTagDTO } from "@/lib/search/tag-search"
import { logger, LOG_PREFIX } from "@/lib/logger"
import type { CircleDTO, CircleDetailDTO, TagDTO } from "@/types/api"

/** 手机号格式 */
const PHONE_RE = /^1[3-9]\d{9}$/
/** 微信号格式 */
const WECHAT_RE = /^[a-zA-Z][-_a-zA-Z0-9]{5,19}$/

type RouteContext = { params: Promise<{ id: string }> }

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

/** 查询圈子详情并组装 CircleDetailDTO */
async function fetchCircleDetail(circleId: string): Promise<CircleDetailDTO | null> {
  // 1. 查询圈子本身
  const [circleRow] = await db
    .select()
    .from(circles)
    .where(eq(circles.id, circleId))
  if (!circleRow) return null

  // 2. 查询创建者信息
  const [creatorRow] = await db
    .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, circleRow.creatorId))

  // 3. 查询圈子标签
  const tagRows = await db
    .select()
    .from(tags)
    .innerJoin(circleTags, eq(circleTags.tagId, tags.id))
    .where(eq(circleTags.circleId, circleId))
  const circleTagList: TagDTO[] = tagRows.map((r) => toTagDTO(r.tags))

  // 4. 统计被联系次数
  const [countRow] = await db
    .select({ value: count() })
    .from(contactLogs)
    .where(eq(contactLogs.circleId, circleId))

  return {
    ...toCircleDTO(circleRow),
    creator: {
      id: creatorRow?.id ?? circleRow.creatorId,
      name: creatorRow?.name ?? "未知用户",
      avatarUrl: creatorRow?.avatarUrl ?? null,
    },
    tags: circleTagList,
    contactCount: countRow?.value ?? 0,
  }
}

/**
 * GET /api/circles/:id
 *
 * 返回圈子详情。非创建者访问非 active 状态的圈子返回 404。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params

  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 查询圈子详情
  const detail = await fetchCircleDetail(id)
  if (!detail) {
    return withCors(fail(404, "圈子不存在"), req)
  }

  // 3. 非创建者访问非 active 圈子返回 404
  if (detail.creatorId !== userId && detail.status !== "active") {
    return withCors(fail(404, "圈子不存在"), req)
  }

  return withCors(ok(detail), req)
}

/** PUT 请求体 schema(所有字段可选) */
const updateCircleSchema = z
  .object({
    title: z.string().trim().min(2).max(50).optional(),
    description: z.string().min(10).max(1000).optional(),
    contactPhone: z
      .string()
      .regex(PHONE_RE)
      .optional()
      .or(z.literal("")),
    wechat: z
      .string()
      .regex(WECHAT_RE)
      .optional()
      .or(z.literal("")),
    activityTime: z.string().max(100).optional(),
    maxMembers: z.number().int().min(1).max(999).optional(),
    tagIds: z.array(z.string().uuid()).min(1).max(5).optional(),
  })
  .refine(
    (data) => {
      // 两个字段都未提供时跳过校验(允许仅更新标题等非联系字段)
      // 至少一个字段提供时,至少一个必须非空
      if (data.contactPhone === undefined && data.wechat === undefined) {
        return true
      }
      return !!data.contactPhone || !!data.wechat
    },
    { message: "至少填写一种联系方式(电话或微信)" }
  )

/**
 * PUT /api/circles/:id
 *
 * 更新圈子信息(仅创建者可调)。tagIds 提供时全量替换。
 */
export async function PUT(req: Request, context: RouteContext) {
  const { id } = await context.params

  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 查询圈子,校验创建者
  const [circleRow] = await db.select().from(circles).where(eq(circles.id, id))
  if (!circleRow) {
    return withCors(fail(404, "圈子不存在"), req)
  }
  if (circleRow.creatorId !== userId) {
    return withCors(fail(403, "无权修改他人创建的圈子"), req)
  }

  // 3. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = updateCircleSchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  const {
    title,
    description,
    contactPhone,
    wechat,
    activityTime,
    maxMembers,
    tagIds: newTagIds,
  } = parsed.data

  // 4. 更新圈子字段(仅更新已提供的字段)
  const updates: Partial<typeof circles.$inferInsert> = { updatedAt: new Date() }
  if (title !== undefined) updates.title = title
  if (description !== undefined) updates.description = description
  if (contactPhone !== undefined) updates.contactPhone = contactPhone || null
  if (wechat !== undefined) updates.wechat = wechat || null
  if (activityTime !== undefined) updates.activityTime = activityTime || null
  if (maxMembers !== undefined) updates.maxMembers = maxMembers

  await db.update(circles).set(updates).where(eq(circles.id, id))

  // 5. 全量替换 circle_tags(如果提供了 tagIds)
  if (newTagIds) {
    await db.transaction(async (tx) => {
      await tx.delete(circleTags).where(eq(circleTags.circleId, id))
      await tx.insert(circleTags).values(
        newTagIds.map((tagId) => ({ circleId: id, tagId }))
      )
    })
  }

  logger.info(LOG_PREFIX.CIRCLE, "Circle updated", { circleId: id, userId })

  // 6. 返回更新后的详情
  const detail = await fetchCircleDetail(id)
  return withCors(ok(detail), req)
}

/**
 * DELETE /api/circles/:id
 *
 * 软删除圈子(status='deleted'),仅创建者可调。
 */
export async function DELETE(req: Request, context: RouteContext) {
  const { id } = await context.params

  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 查询圈子,校验创建者
  const [circleRow] = await db.select().from(circles).where(eq(circles.id, id))
  if (!circleRow) {
    return withCors(fail(404, "圈子不存在"), req)
  }
  if (circleRow.creatorId !== userId) {
    return withCors(fail(403, "无权删除他人创建的圈子"), req)
  }

  // 3. 软删除
  await db
    .update(circles)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(eq(circles.id, id))

  logger.info(LOG_PREFIX.CIRCLE, "Circle deleted", { circleId: id, userId })

  return withCors(ok({ id }), req)
}
