import { and, eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/lib/db"
import { users, hobbyTags } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"

/**
 * 用户标签更新请求体 schema。
 * - tags: 1-10 个标签名称(trim 后 1-30 字符)
 */
const updateMyTagsSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(30)).min(1).max(10),
})

/**
 * PUT /api/users/me/hobby-tags
 *
 * 全量替换当前用户的兴趣标签(直接更新 users.tags 数组列)。
 *
 * - 鉴权:任意登录用户
 * - zod 校验 `tags: string[](1-10 项标签名称)`
 * - 去重后校验所有名称存在于 hobby_tags(仅 approved 状态),缺失返回 400
 * - 直接 `UPDATE users SET tags = $1`(单条 SQL,无桥接表事务)
 * - 返回 `IResponse<{ tags: string[] }>`(更新后的标签名称数组)
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function PUT(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = updateMyTagsSchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  // 3. 去重(保持首现顺序),再校验名称存在性
  const uniqueTags = Array.from(new Set(parsed.data.tags))
  const existingTags = await db
    .select({ name: hobbyTags.name })
    .from(hobbyTags)
    .where(
      and(
        inArray(hobbyTags.name, uniqueTags),
        eq(hobbyTags.status, "approved")
      )
    )
  const existingNames = new Set(existingTags.map((t) => t.name))
  const missing = uniqueTags.filter((name) => !existingNames.has(name))
  if (missing.length > 0) {
    return withCors(
      fail(400, "部分标签不存在或未通过审核", { missingTags: missing }),
      req
    )
  }

  // 4. 直接更新 users.tags 数组列
  await db
    .update(users)
    .set({ tags: uniqueTags, updatedAt: new Date() })
    .where(eq(users.id, userId))

  logger.info(LOG_PREFIX.AUTH, "user hobby tags updated", {
    userId,
    count: uniqueTags.length,
  })

  return withCors(ok({ tags: uniqueTags }), req)
}
