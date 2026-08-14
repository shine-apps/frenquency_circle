import { NextResponse } from "next/server"
import { z } from "zod"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { categories } from "@/db/schema"
import { buildCategoryTree, slugify } from "@/lib/categories"
import { requireAdmin } from "@/lib/auth-utils"
import { ok, fail } from "@/lib/api"
import { LOG_PREFIX, logger } from "@/lib/logger"

export const dynamic = "force-dynamic"

const createSchema = z.object({
  name: z.string().trim().min(1).max(64),
  slug: z.string().trim().min(1).max(64).optional(),
  level: z.union([z.literal(1), z.literal(2)]),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
})

/** GET /api/admin/categories —— 管理员读取两级分类树 */
export async function GET() {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response
  try {
    const tree = await buildCategoryTree()
    return NextResponse.json({ tree })
  } catch (err) {
    logger.error(LOG_PREFIX.CATEGORY, "读取分类树失败", { error: String(err) })
    return fail(500, "get_category_tree_failed")
  }
}

/** POST /api/admin/categories —— 新建分类（一级大类或二级中类） */
export async function POST(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail(400, "请求体不是合法 JSON")
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "参数校验失败", parsed.error.flatten())
  }
  const { name, slug: slugIn, level, parentId, sortOrder } = parsed.data

  // 父子约束校验
  if (level === 1) {
    if (parentId) return fail(400, "一级大类不能有父级分类")
  } else {
    if (!parentId) return fail(400, "二级中类必须指定父级分类")
    const parent = await db.query.categories.findFirst({
      where: eq(categories.id, parentId),
    })
    if (!parent) return fail(404, "父级分类不存在")
    if (parent.level !== 1) return fail(400, "父级分类必须是一级大类")
  }

  const slug = slugIn && slugIn.length > 0 ? slugIn : slugify(name)
  if (!slug) return fail(400, "无法从名称生成 slug，请手动指定")

  const existing = await db.query.categories.findFirst({
    where: eq(categories.slug, slug),
  })
  if (existing) return fail(409, "slug 已存在")

  try {
    const [row] = await db
      .insert(categories)
      .values({
        name,
        slug,
        level,
        parentId: level === 2 ? (parentId as string) : null,
        sortOrder: sortOrder ?? 0,
      })
      .returning()
    logger.info(LOG_PREFIX.CATEGORY, "新建分类", { id: row.id, slug: row.slug, by: guard.userId })
    return ok({ category: row }, { status: 201 })
  } catch (err) {
    logger.error(LOG_PREFIX.CATEGORY, "新建分类失败", { error: String(err) })
    return fail(500, "create_category_failed")
  }
}
