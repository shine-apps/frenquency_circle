import { desc, eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles, circleFollows } from "@/db/schema"
import { corsOptions, fail, ok, withCors, parsePagination } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import type { CircleDTO, FollowedCircleDTO, Paginated } from "@/types/api"

/** 将 circles 表行转换为 CircleDTO(与 mine/route.ts 保持一致) */
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
    coverImages: row.coverImages ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * GET /api/circles/followed
 *
 * 返回当前用户关注的圈子列表(分页,按关注时间倒序,排除已删除圈子)。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

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

  // 3. 查询该用户全部关注记录(一次取出,在内存中过滤已删除圈子后再分页,
  //    确保 total 与 list 口径一致,不会因圈子被删除而出现 total > list 的情况)
  const followRows = await db
    .select()
    .from(circleFollows)
    .where(eq(circleFollows.userId, userId))
    .orderBy(desc(circleFollows.createdAt))

  const circleIds = followRows.map((r) => r.circleId)

  // 4. 批量查询对应圈子
  const circleMap = new Map<number, typeof circles.$inferSelect>()
  if (circleIds.length > 0) {
    const circleRows = await db
      .select()
      .from(circles)
      .where(inArray(circles.id, circleIds))
    circleRows.forEach((c) => circleMap.set(c.id, c))
  }

  // 5. 过滤掉已删除圈子,组装 DTO,并按关注时间倒序
  const visibleFollows = followRows
    .map((f) => {
      const c = circleMap.get(f.circleId)
      if (!c || c.status === "deleted") return null
      return { ...toCircleDTO(c), followedAt: f.createdAt.toISOString() }
    })
    .filter((x): x is FollowedCircleDTO => x !== null)

  // 6. 内存分页
  const total = visibleFollows.length
  const start = (pagination.page - 1) * pagination.pageSize
  const list = visibleFollows.slice(start, start + pagination.pageSize)

  const result: Paginated<FollowedCircleDTO> = {
    list,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  }
  return withCors(ok(result), req)
}
