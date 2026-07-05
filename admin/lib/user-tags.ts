import { eq, inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import { tags, userTags } from "@/db/schema"
import { toTagDTO } from "@/lib/search/tag-search"
import type { TagDTO } from "@/types/api"

/**
 * 用户兴趣标签查询工具。
 *
 * 集中在此处实现,供 `/api/auth/me` GET 与 `/api/users/me/profile` PATCH
 * 复用,避免重复实现 user_tags JOIN tags 的查询逻辑。
 */

/**
 * 拉取指定用户已绑定的标签列表(TagDTO[])。
 *
 * 实现策略:先查 `user_tags` 拿到 tagId 列表,再批量查 `tags` 表。
 * 避免在 drizzle 中写显式 JOIN,保持类型推断友好。
 *
 * @param userId 用户 ID
 * @returns TagDTO 数组(无标签时返回空数组)
 */
export async function fetchUserTags(userId: string): Promise<TagDTO[]> {
  const userTagRows = await db
    .select({ tagId: userTags.tagId })
    .from(userTags)
    .where(eq(userTags.userId, userId))
  if (userTagRows.length === 0) return []

  const tagIds = userTagRows.map((r) => r.tagId)
  const tagRows = await db
    .select()
    .from(tags)
    .where(inArray(tags.id, tagIds))

  return tagRows.map(toTagDTO)
}
