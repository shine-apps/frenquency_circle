import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { users } from "@/db/schema"

/**
 * 用户兴趣标签查询工具。
 *
 * users.tags 为 text[] 数组列(直接存 hobby_tags.name),无需再 JOIN 桥接表。
 * 供 `/api/auth/me` GET 与 `/api/users/me/profile` PATCH、
 * `/api/users/[id]/profile` GET 复用。
 */

/**
 * 拉取指定用户已绑定的标签名称数组(string[])。
 *
 * @param userId 用户 ID
 * @returns 标签名称数组(无标签时返回空数组)
 */
export async function fetchUserTags(userId: string): Promise<string[]> {
  const rows = await db
    .select({ tags: users.tags })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  return rows[0]?.tags ?? []
}
