import { count, desc, eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import { userFollows, users } from "@/db/schema"
import {
  corsOptions,
  fail,
  isUuid,
  ok,
  withCors,
  parsePagination,
} from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import type { ActivityLevel, FollowedUserDTO, Paginated } from "@/types/api"

/**
 * GET /api/users/followed
 *
 * 关注的人列表(分页,按关注时间倒序)。
 * - 默认返回当前登录用户关注的人;
 * - `?userId=<id>`:查看指定用户关注的人,供公开主页展示「TA 关注的趣友」
 *   (口径对齐 `GET /api/circles/followed?userId=`);
 * - 与 `GET /api/circles/followed` 同一实现范式:先取全部关注记录,
 *   批量补齐用户信息后在内存分页,保证 total 与 list 口径一致。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response

  // 2. 解析分页与过滤条件
  const url = new URL(req.url)
  const pagination = parsePagination(url.searchParams)
  if (!pagination) {
    return withCors(fail(400, "Invalid pagination parameters"), req)
  }
  // userId 必须是 uuid,否则 Postgres 抛 22P02 → 500;
  // 空串(如 `?userId=`)视为未传,回退到当前登录用户
  const targetUserId = url.searchParams.get("userId")?.trim() || undefined
  if (targetUserId && !isUuid(targetUserId)) {
    return withCors(fail(400, "userId 参数格式不正确"), req)
  }
  const userId = targetUserId ?? guard.user.id

  // 3. 查询该用户关注记录(SQL 层分页,避免关注量大时全量扫描)
  const where = eq(userFollows.userId, userId)

  const followRows = await db
    .select()
    .from(userFollows)
    .where(where)
    .orderBy(desc(userFollows.createdAt))
    .limit(pagination.pageSize)
    .offset((pagination.page - 1) * pagination.pageSize)

  const [totalRow] = await db
    .select({ value: count() })
    .from(userFollows)
    .where(where)
  const total = Number(totalRow?.value ?? 0)

  const targetIds = followRows.map((f) => f.targetUserId)

  // 4. 批量查询被关注用户(一次查询,避免 N+1)
  const userMap = new Map<
    string,
    {
      id: string
      name: string
      avatarUrl: string | null
      tags: string[]
      activityLevel: string
      practiceYears: number | null
      address: string | null
    }
  >()
  if (targetIds.length > 0) {
    const rows = await db
      .select({
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
        tags: users.tags,
        activityLevel: users.activityLevel,
        practiceYears: users.practiceYears,
        address: users.address,
      })
      .from(users)
      .where(inArray(users.id, targetIds))

    rows.forEach((u) => userMap.set(u.id, u))
  }

  // 5. 组装 DTO,沿用关注时间倒序(被关注者已注销则丢弃该条)
  const list: FollowedUserDTO[] = []
  for (const f of followRows) {
    const u = userMap.get(f.targetUserId)
    if (!u) continue
    list.push({
      id: u.id,
      name: u.name,
      avatarUrl: u.avatarUrl ?? null,
      tags: u.tags ?? [],
      activityLevel: u.activityLevel as ActivityLevel,
      practiceYears: u.practiceYears ?? null,
      address: u.address ?? null,
      followedAt: f.createdAt.toISOString(),
    })
  }

  // 6. 组装分页响应(list 与 count 均为 SQL 层分页口径)
  const result: Paginated<FollowedUserDTO> = {
    list,
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  }

  return withCors(ok(result), req)
}
