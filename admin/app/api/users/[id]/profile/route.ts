import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { users } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { fetchUserTags } from "@/lib/user-tags"
import { logger } from "@/lib/logger"
import type { ActivityLevel, PublicUserProfileDTO } from "@/types/api"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * GET /api/users/:id/profile
 *
 * 公开用户主页(仅展示,不可编辑)。与管理员用的 GET /api/users/:id 区分,
 * 供"发现"搜索结果点击进入他人主页使用。
 *
 * - 鉴权:任意登录用户
 * - 返回 PublicUserProfileDTO(不含 email / phone / privacySettings 等敏感字段)
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request, context: RouteContext) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response

  // 2. 查询用户
  const { id } = await context.params
  const row = await db.query.users.findFirst({ where: eq(users.id, id) })
  if (!row) {
    return withCors(fail(404, "用户不存在"), req)
  }

  // 3. 查询用户标签
  const tags = await fetchUserTags(id)

  // 4. 组装公开 DTO(隐藏邮箱/手机/隐私设置)
  const profile: PublicUserProfileDTO = {
    id: row.id,
    name: row.name,
    avatarUrl: row.avatarUrl ?? null,
    tags,
    activityLevel: row.activityLevel as ActivityLevel,
    practiceYears: row.practiceYears ?? null,
    address: row.address ?? null,
    createdAt: row.createdAt.toISOString(),
  }

  logger.info("SEARCH", "User profile viewed", {
    viewerId: guard.user.id,
    targetId: id,
  })

  return withCors(ok(profile), req)
}
