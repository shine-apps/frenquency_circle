import { and, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { activities } from "@/db/schema"
import { corsOptions, fail, ok, parsePagination, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"
import { createActivitySchema, type CreateActivityInput } from "@/lib/activities"
import type { ActivityDTO, ActivityListDTO, Paginated, UserRole } from "@/types/api"

/** 可发布活动的角色 */
const PUBLISH_ROLES: UserRole[] = ["TEACHER", "ADMIN"]

/** 活动行 → ActivityDTO 投影 */
function toActivityDTO(row: typeof activities.$inferSelect): ActivityDTO {
  return {
    id: row.id,
    creatorId: row.creatorId,
    title: row.title,
    description: row.description,
    startTime: row.startTime.toISOString(),
    registrationDeadline: row.registrationDeadline.toISOString(),
    contactPhone: row.contactPhone ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * POST /api/activities
 *
 * 发布活动(TEACHER / ADMIN 直接发布,无需圈子)。
 * - 401 未登录 / 403 非 TEACHER/ADMIN / 400 校验失败 / 201 成功
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const { id: userId, role } = guard.user

  if (!PUBLISH_ROLES.includes(role as UserRole)) {
    return withCors(fail(403, "只有传承人或管理员可以发布活动"), req)
  }

  // 2. 解析并校验请求体
  const body = await req.json().catch(() => null)
  const parsed = createActivitySchema.safeParse(body)
  if (!parsed.success) {
    return withCors(fail(400, "Invalid request body", parsed.error.flatten()), req)
  }
  const input = parsed.data as CreateActivityInput

  // 3. 写入活动
  const [inserted] = await db
    .insert(activities)
    .values({
      creatorId: userId,
      title: input.title,
      description: input.description,
      startTime: new Date(input.startTime),
      registrationDeadline: new Date(input.registrationDeadline),
      contactPhone: input.contactPhone ?? null,
    })
    .returning()

  logger.info(LOG_PREFIX.CIRCLE, "Activity created", {
    activityId: inserted.id,
    creatorId: userId,
    role,
  })

  return withCors(ok(toActivityDTO(inserted), { status: 201 }), req)
}

/**
 * GET /api/activities
 *
 * 活动列表(分页,按起始时间倒序)。
 * - 非创建者:仅见全局 active 活动。
 * - 创建者:`?mine=1` 时只看自己发布的(含 cancelled)。
 */
export async function GET(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 解析分页
  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }
  const mine = url.searchParams.get("mine") === "1"

  // 3. 查询条件:mine=1 只看自己发布;否则全局 active
  const where = mine
    ? eq(activities.creatorId, userId)
    : eq(activities.status, "active")

  const rows = await db
    .select()
    .from(activities)
    .where(where)
    .orderBy(desc(activities.startTime))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize)

  const totalRows = await db
    .select({ id: activities.id })
    .from(activities)
    .where(where)
  const total = totalRows.length

  const list: ActivityDTO[] = rows.map(toActivityDTO)
  const result: Paginated<ActivityDTO> = {
    list,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  } satisfies ActivityListDTO

  return withCors(ok(result), req)
}
