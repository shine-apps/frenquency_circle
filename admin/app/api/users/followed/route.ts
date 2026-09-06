import { desc, eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import { userFollows, users } from "@/db/schema"
import { corsOptions, fail, ok, withCors, parsePagination } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import type { ActivityLevel, FollowedUserDTO, Paginated } from "@/types/api"

/**
 * GET /api/users/followed
 *
 * 返回当前用户关注的人列表(分页,按关注时间倒序)。
 * 与 `GET /api/circles/followed` 同一实现范式:先取全部关注记录,
 * 批量补齐用户信息后在内存分页,保证 total 与 list 口径一致。
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

  // 3. 查询该用户全部关注记录(按关注时间倒序)
  const followRows = await db
    .select()
    .from(userFollows)
    .where(eq(userFollows.userId, userId))
    .orderBy(desc(userFollows.createdAt))

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

  // 6. 内存分页
  const total = list.length
  const start = (pagination.page - 1) * pagination.pageSize
  const result: Paginated<FollowedUserDTO> = {
    list: list.slice(start, start + pagination.pageSize),
    total,
    page: pagination.page,
    pageSize: pagination.pageSize,
  }

  return withCors(ok(result), req)
}
