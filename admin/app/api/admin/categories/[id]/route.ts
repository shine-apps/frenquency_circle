import { z } from "zod"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { categories, hobbyTags } from "@/db/schema"
import { fail, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { LOG_PREFIX, logger } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

const updateSchema = z.object({
  name: z.string().trim().min(1).max(64).optional(),
  slug: z.string().trim().min(1).max(64).optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

/**
 * PATCH /api/admin/categories/:id
 * 编辑分类：名称 / slug / 排序 / 重新挂父类（支持一级↔二级互转）。
 */
export async function PATCH(req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params

  const body = await req.json().catch(() => null)
  const parsed = updateSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "参数校验失败", parsed.error.flatten())
  }
  const { name, slug: slugIn, parentId, sortOrder } = parsed.data

  const node = await db.query.categories.findFirst({ where: eq(categories.id, id) })
  if (!node) return fail(404, "分类不存在")

  // 计算新父级
  const newParentId = parentId !== undefined ? parentId : node.parentId
  if (newParentId === id) return fail(400, "不能将分类设为自身的父级")

  // 若本节点已有子分类，禁止变更父级（避免孤儿/环）
  const childCount = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.parentId, id))
    .limit(1)
  if (childCount.length > 0 && newParentId !== node.parentId) {
    return fail(400, "该分类下存在子分类，无法变更父级")
  }

  if (newParentId != null) {
    const parent = await db.query.categories.findFirst({
      where: eq(categories.id, newParentId),
    })
    if (!parent) return fail(404, "父级分类不存在")
    if (parent.level !== 1) return fail(400, "父级必须是一级大类")
  }

  const newLevel = newParentId == null ? 1 : 2

  // slug 唯一性（排除自身）
  let slug = node.slug
  if (slugIn && slugIn !== node.slug) {
    const clash = await db.query.categories.findFirst({
      where: eq(categories.slug, slugIn),
    })
    if (clash) return fail(409, "slug 已存在")
    slug = slugIn
  }

  const [updated] = await db
    .update(categories)
    .set({
      name: name ?? node.name,
      slug,
      parentId: newParentId,
      level: newLevel,
      sortOrder: sortOrder ?? node.sortOrder,
    })
    .where(eq(categories.id, id))
    .returning()

  logger.info(LOG_PREFIX.CATEGORY, "编辑分类", { id, by: guard.userId })
  return ok({ category: updated })
}

/**
 * DELETE /api/admin/categories/:id
 * 删除分类：有子分类 / 仍有标签引用时拒绝。
 */
export async function DELETE(_req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params

  const node = await db.query.categories.findFirst({ where: eq(categories.id, id) })
  if (!node) return fail(404, "分类不存在")

  const childRows = await db
    .select({ id: categories.id })
    .from(categories)
    .where(eq(categories.parentId, id))
    .limit(1)
  if (childRows.length > 0) {
    return fail(409, "请先删除该分类下的子分类")
  }

  const tagRows = await db
    .select({ id: hobbyTags.id })
    .from(hobbyTags)
    .where(eq(hobbyTags.categoryId, id))
    .limit(1)
  if (tagRows.length > 0) {
    return fail(409, "该分类下仍有标签，无法删除")
  }

  await db.delete(categories).where(eq(categories.id, id))
  logger.info(LOG_PREFIX.CATEGORY, "删除分类", { id, by: guard.userId })
  return ok({ deleted: true })
}
