import { z } from "zod"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { hobbyTags, categories } from "@/db/schema"
import { fail, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { toTagDTO } from "@/lib/search/tag-search"
import { toPinyin, toPinyinInitials } from "@/lib/search/pinyin"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * 更新标签请求体 schema。
 * - status: 可选,更新为 approved / rejected
 * - categorySlug: 可选,管理员可重新归类到指定分类(一级叶子或二级中类,按 slug)
 *
 * 至少提供一个字段,否则返回 400。
 */
const updateTagSchema = z
  .object({
    name: z.string().trim().min(1).max(64).optional(),
    status: z.enum(["approved", "rejected"]).optional(),
    categorySlug: z.string().trim().min(1).max(64).optional(),
  })
  .refine(
    (data) =>
      data.name !== undefined ||
      data.status !== undefined ||
      data.categorySlug !== undefined,
    { message: "至少提供一个待更新字段" },
  )

/**
 * PATCH /api/admin/hobby-tags/:id
 *
 * 管理员更新标签(审核状态 / 重新归类)。
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

  const { name, status, categorySlug } = parsed.data

  // 组装更新字段
  const updates: Partial<typeof hobbyTags.$inferInsert> = { updatedAt: new Date() }
  if (name) {
    const pinyin = toPinyin(name)
    const pinyinInitials = toPinyinInitials(name)
    updates.name = name
    updates.pinyin = pinyin
    updates.pinyinInitials = pinyinInitials
  }
  if (status) updates.status = status
  if (categorySlug !== undefined) {
    const sub = await db.query.categories.findFirst({
      where: eq(categories.slug, categorySlug),
    })
    if (!sub) {
      return fail(400, "所属分类不存在")
    }
    updates.categoryId = sub.id
  }

  const [updated] = await db
    .update(hobbyTags)
    .set(updates)
    .where(eq(hobbyTags.id, id))
    .returning()

  if (!updated) {
    return fail(404, "标签不存在")
  }

  logger.info(LOG_PREFIX.ADMIN, "Tag updated", {
    tagId: id,
    name,
    status,
    categorySlug,
    by: guard.userId,
  })

  return ok(toTagDTO(updated))
}

/**
 * DELETE /api/admin/hobby-tags/:id
 *
 * 删除标签（物理删除）。users.tags / circles.tags 为按名称存储的 text[],
 * 不受外键约束,因此直接删除即可。
 */
export async function DELETE(_req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params

  const tag = await db.query.hobbyTags.findFirst({
    where: eq(hobbyTags.id, id),
  })
  if (!tag) return fail(404, "标签不存在")

  await db.delete(hobbyTags).where(eq(hobbyTags.id, id))
  logger.info(LOG_PREFIX.TAG, "删除标签", { id, by: guard.userId })
  return ok({ deleted: true })
}
