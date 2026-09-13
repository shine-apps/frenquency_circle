import { desc, eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import { circles, circleFollows } from "@/db/schema"
import { corsOptions, fail, isUuid, ok, withCors, parsePagination } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { toCircleDTO } from "@/lib/circles"
import { logger, LOG_PREFIX } from "@/lib/logger"
import type { FollowedCircleDTO, Paginated } from "@/types/api"

/**
 * GET /api/circles/followed
 *
 * 返回指定用户关注的圈子列表(分页,按关注时间倒序,排除已删除圈子)。
 * - `?userId=<id>`:查看该用户关注的圈子(公开主页展示 TA 关注的圈子);
 *   缺省为当前登录用户自己的关注列表
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const currentUserId = guard.user.id

  // 2. 解析分页与目标用户(显式传 userId 时必须是 uuid,否则 Postgres 抛 22P02 → 500)
  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }
  const userIdParam = url.searchParams.get("userId")?.trim()
  if (userIdParam && !isUuid(userIdParam)) {
    return withCors(fail(400, "userId 参数格式不正确"), req)
  }
  /** 关注列表归属用户:默认自己,传 userId 时查看他人(公开主页) */
  const userId = userIdParam || currentUserId

  // 查看他人关注列表属半公开信息,留痕便于审计(需要时可按需增加隐私开关)
  if (userId !== currentUserId) {
    logger.info(LOG_PREFIX.CONTACT, "followed circles viewed", {
      viewerId: currentUserId,
      targetId: userId,
    })
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
  const circleMap = new Map<string, typeof circles.$inferSelect>()
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
