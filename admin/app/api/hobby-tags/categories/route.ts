import { asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { hobbyTags } from "@/db/schema"
import { corsOptions, ok, withCors } from "@/lib/api"

/**
 * 标签分类树节点(二级分类体系:category 一级大类 + name 二级分类名称)。
 */
type CategoryNode = {
  category: string
  subCategories: string[]
}

/**
 * GET /api/hobby-tags/categories
 *
 * 返回兴趣标签的六大类与二级分类树(用于兴趣选择页骨架)。
 *
 * - 仅查询 `status='approved'` 的标签
 * - 按 category 分组,每组下收集去重后的 name 列表(二级分类名称)
 *
 * 响应:`IResponse<{ categories: CategoryNode[] }>`
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  // 一次查询拉取所有 approved 标签的 (category, name) 二元组
  const rows = await db
    .select({
      category: hobbyTags.category,
      name: hobbyTags.name,
    })
    .from(hobbyTags)
    .where(eq(hobbyTags.status, "approved"))
    .orderBy(asc(hobbyTags.category), asc(hobbyTags.name))

  // 内存中按 category 分组,name 去重保序
  const map = new Map<string, string[]>()
  for (const row of rows) {
    if (!map.has(row.category)) {
      map.set(row.category, [])
    }
    const subs = map.get(row.category)!
    if (!subs.includes(row.name)) {
      subs.push(row.name)
    }
  }

  const categories: CategoryNode[] = Array.from(map.entries()).map(
    ([category, subCategories]) => ({
      category,
      subCategories,
    })
  )

  return withCors(ok({ categories }), req)
}
