import { z } from "zod"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { tags } from "@/db/schema"
import { fail, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { toTagDTO } from "@/lib/search/tag-search"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * 更新标签请求体 schema。
 * - status: 可选,更新为 approved / rejected
 * - category: 可选,管理员可重新分类(1-30 字符)
 * - subCategory: 可选,二级分类(可清空为空字符串)
 *
 * 至少提供一个字段,否则返回 400。
 */
const updateTagSchema = z
  .object({
    status: z.enum(["approved", "rejected"]).optional(),
    category: z.string().trim().min(1).max(30).optional(),
    subCategory: z.string().trim().max(30).optional(),
  })
  .refine(
    (data) =>
      data.status !== undefined ||
      data.category !== undefined ||
      data.subCategory !== undefined,
    { message: "至少提供一个待更新字段" }
  )

/**
 * PATCH /api/admin/tags/:id
 *
 * 管理员更新标签(审核状态 / 重新分类)。
 *
 * 响应:`TagDTO`(更新后的标签)
 */
export async function PATCH(req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params

  const body = await req.json().catch(() => null)
  const parsed = updateTagSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }

  const { status, category, subCategory } = parsed.data

  // 组装更新字段
  const updates: Partial<typeof tags.$inferInsert> = { updatedAt: new Date() }
  if (status) updates.status = status
  if (category) updates.category = category
  // subCategory 允许显式传空字符串清空
  if (subCategory !== undefined) updates.subCategory = subCategory || null

  const [updated] = await db
    .update(tags)
    .set(updates)
    .where(eq(tags.id, id))
    .returning()

  if (!updated) {
    return fail(404, "标签不存在")
  }

  logger.info(LOG_PREFIX.ADMIN, "Tag updated", {
    tagId: id,
    status,
    category,
    by: guard.userId,
  })

  return ok(toTagDTO(updated))
}
