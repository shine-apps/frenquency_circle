import { and, count, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { activities } from "@/db/schema"
import { corsOptions, fail, isUuid, ok, parsePagination, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"
import {
  createActivity,
  createActivitySchema,
  toActivityDTO,
  type CreateActivityInput,
} from "@/lib/activities"
import type { ActivityDTO, ActivityListDTO, Paginated } from "@/types/api"

/**
 * POST /api/activities
 *
 * 发布活动(任意登录用户可发布,无需圈子,不区分角色)。
 * - 401 未登录 / 400 校验失败 / 201 成功
 * - 活动创建即 status=active 直接上线(与圈子 / 课程的待审核不同,沿用既有口径)
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  // 1. 鉴权(仅要求登录,角色不参与准入判定)
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const { id: userId, role } = guard.user

  // 2. 解析并校验请求体
  const body = await req.json().catch(() => null)
  const parsed = createActivitySchema.safeParse(body)
  if (!parsed.success) {
    return withCors(fail(400, "Invalid request body", parsed.error.flatten()), req)
  }
  const input = parsed.data as CreateActivityInput

  // 3. 写入活动(与教师后台共用 lib/activities 的 createActivity)
  const inserted = await createActivity({ creatorId: userId, input })

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
 * - `?creatorId=<id>`:查看指定发布者的活动(仅 active),供公开主页展示「TA 发布的活动」;
 *   与 mine=1 同时出现时以 creatorId 为准(对外口径只暴露 active)
 */
export async function GET(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 解析分页与过滤条件
  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }
  const mine = url.searchParams.get("mine") === "1"
  const creatorId = url.searchParams.get("creatorId")?.trim()
  // creatorId 必须是 uuid,否则 Postgres 抛 22P02 → 500
  if (creatorId && !isUuid(creatorId)) {
    return withCors(fail(400, "creatorId 参数格式不正确"), req)
  }

  // 3. 查询条件:creatorId 只看指定发布者(仅 active);mine=1 只看自己发布;否则全局 active
  const where = creatorId
    ? and(eq(activities.creatorId, creatorId), eq(activities.status, "active"))
    : mine
      ? eq(activities.creatorId, userId)
      : eq(activities.status, "active")

  const rows = await db
    .select()
    .from(activities)
    .where(where)
    .orderBy(desc(activities.startTime))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize)

  const [totalRow] = await db
    .select({ value: count() })
    .from(activities)
    .where(where)
  const total = Number(totalRow?.value ?? 0)

  const list: ActivityDTO[] = rows.map(toActivityDTO)
  const result: Paginated<ActivityDTO> = {
    list,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  } satisfies ActivityListDTO

  return withCors(ok(result), req)
}
