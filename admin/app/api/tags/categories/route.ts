import { asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { tags } from "@/db/schema"
import { corsOptions, ok, withCors } from "@/lib/api"

/**
 * 标签分类树节点。
 */
type CategoryNode = {
  category: string
  subCategories: string[]
}

/**
 * GET /api/tags/categories
 *
 * 返回兴趣标签的六大类与二级分类树(用于兴趣选择页骨架)。
 *
 * - 仅查询 `status='approved'` 的标签
 * - 按 category 分组,每组下收集去重后的 subCategory 列表
 * - subCategory 为 null 的标签不参与二级分类(目前种子数据均有 subCategory)
 *
 * 响应:`IResponse<{ categories: CategoryNode[] }>`
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  // 一次查询拉取所有 approved 标签的 (category, subCategory) 二元组
  const rows = await db
    .select({
      category: tags.category,
      subCategory: tags.subCategory,
    })
    .from(tags)
    .where(eq(tags.status, "approved"))
    .orderBy(asc(tags.category), asc(tags.subCategory))

  // 内存中按 category 分组,subCategory 去重保序
  const map = new Map<string, string[]>()
  for (const row of rows) {
    if (!map.has(row.category)) {
      map.set(row.category, [])
    }
    if (row.subCategory === null) continue
    const subs = map.get(row.category)!
    if (!subs.includes(row.subCategory)) {
      subs.push(row.subCategory)
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
