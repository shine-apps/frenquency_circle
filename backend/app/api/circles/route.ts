import { z } from "zod"
import { and, count, desc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles } from "@/db/schema"
import { corsOptions, fail, isUuid, ok, withCors, parsePagination } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { createCircle, createCircleSchema, toCircleDTO } from "@/lib/circles"
import type { CircleDTO, Paginated } from "@/types/api"

/**
 * POST /api/circles
 *
 * 创建圈子(任意登录用户可调,不区分角色)。
 * - 仅要求登录(401),不再要求教师认证
 * - 圈子创建后 status=pending,管理员审核通过后上线
 * - 24 小时内最多创建 5 个,超限返回 429。
 *
 * 业务规则(配额 / 标签白名单 / 落库 / 通知)集中在 `lib/circles.ts` 的
 * `createCircle`,与教师后台的 `POST /api/teacher/circles` 共用同一份实现。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  // 1. 鉴权(仅要求登录,角色不参与准入判定)
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = createCircleSchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", z.treeifyError(parsed.error)),
      req
    )
  }

  // 3. 创建圈子(共享业务规则)
  const result = await createCircle({ creatorId: userId, input: parsed.data })
  if (!result.ok) {
    return withCors(fail(result.status, result.message, result.details), req)
  }

  return withCors(
    ok({ circleId: result.circleId, status: result.status }, { status: 201 }),
    req
  )
}

/**
 * GET /api/circles
 *
 * 圈子列表(分页,按创建时间倒序)。
 * - `?creatorId=<userId>`:返回该用户**已上线**(status=active)的圈子,
 *   供公开主页展示「TA 发布的圈子」;pending / offline / violated / deleted 一律不外泄
 * - 缺少 creatorId 返回 400(本接口不提供全站圈子流,避免无意义的全表扫描)
 */
export async function GET(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response

  // 2. 解析分页与创建者(creatorId 必须是 uuid,否则 Postgres 会抛 22P02 → 500)
  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }
  const creatorId = url.searchParams.get("creatorId")?.trim()
  if (!isUuid(creatorId)) {
    return withCors(fail(400, "creatorId 参数缺失或格式不正确"), req)
  }

  // 3. 列表与总数同口径(同一 where 条件)
  const where = and(
    eq(circles.creatorId, creatorId),
    eq(circles.status, "active")
  )

  const rows = await db
    .select()
    .from(circles)
    .where(where)
    .orderBy(desc(circles.createdAt))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize)

  const [totalRow] = await db
    .select({ value: count() })
    .from(circles)
    .where(where)

  const list: CircleDTO[] = rows.map(toCircleDTO)
  const result: Paginated<CircleDTO> = {
    list,
    total: Number(totalRow?.value ?? 0),
    page: pagination.page,
    pageSize: pagination.pageSize,
  }

  return withCors(ok(result), req)
}
