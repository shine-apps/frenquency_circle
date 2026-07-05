import { eq, inArray } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/lib/db"
import { tags, userTags } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { toTagDTO } from "@/lib/search/tag-search"
import { logger, LOG_PREFIX } from "@/lib/logger"

/**
 * UUID 字符串校验(zod 内置 uuid)。
 */
const uuidSchema = z.string().uuid()

/**
 * 用户标签更新请求体 schema。
 * - tagIds: 1-10 个 uuid 字符串
 */
const updateMyTagsSchema = z.object({
  tagIds: z.array(uuidSchema).min(1).max(10),
})

/**
 * PUT /api/users/me/tags
 *
 * 全量替换当前用户的兴趣标签关联。
 *
 * - 鉴权:任意登录用户
 * - zod 校验 `tagIds: string[](1-10 项 uuid)`
 * - 校验 tagIds 中的 tag 是否存在(批量查询 tags 表,若任一不存在返回 400)
 * - 全量替换:
 *   1. DELETE FROM user_tags WHERE userId = 当前用户
 *   2. INSERT INTO user_tags (userId, tagId) VALUES ...(批量)
 * - 返回 `IResponse<{ tags: TagDTO[] }>`(更新后的标签列表)
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

  const { tagIds } = parsed.data

  // 3. 校验所有 tagId 是否存在(批量查询)
  //    使用 inArray 一次性查询,避免 N+1
  const existingTags = await db
    .select({ id: tags.id })
    .from(tags)
    .where(inArray(tags.id, tagIds))
  const existingIds = new Set(existingTags.map((t) => t.id))
  const missing = tagIds.filter((id) => !existingIds.has(id))
  if (missing.length > 0) {
    return withCors(
      fail(400, "部分标签不存在", { missingTagIds: missing }),
      req
    )
  }

  // 4. 全量替换:先删后插(事务保证原子性)
  await db.transaction(async (tx) => {
    await tx.delete(userTags).where(eq(userTags.userId, userId))
    if (tagIds.length > 0) {
      await tx.insert(userTags).values(
        tagIds.map((tagId) => ({
          userId,
          tagId,
        }))
      )
    }
  })

  // 5. 查询更新后的 user_tags JOIN tags,返回 TagDTO[]
  //    不需要 JOIN,直接根据 userId 查 user_tags 拿到 tagId 列表,
  //    再查 tags 表即可(避免 drizzle JOIN 语法复杂度)。
  const userTagRows = await db
    .select({ tagId: userTags.tagId })
    .from(userTags)
    .where(eq(userTags.userId, userId))
  const userTagIds = userTagRows.map((r) => r.tagId)

  // tagIds 为空时(理论不会发生,因为 schema min(1)),直接返回空数组
  let tagRows: typeof tags.$inferSelect[] = []
  if (userTagIds.length > 0) {
    tagRows = await db
      .select()
      .from(tags)
      .where(inArray(tags.id, userTagIds))
  }

  // 按 tagIds 入参顺序保留顺序(便于前端展示)
  const tagById = new Map(tagRows.map((r) => [r.id, r]))
  const orderedTags = tagIds
    .map((id) => tagById.get(id))
    .filter((t): t is typeof tags.$inferSelect => t !== undefined)

  logger.info(LOG_PREFIX.AUTH, "user tags updated", {
    userId,
    count: tagIds.length,
  })

  return withCors(ok({ tags: orderedTags.map(toTagDTO) }), req)
}
