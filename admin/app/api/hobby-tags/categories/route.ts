import { and, asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { hobbyTags, categories } from "@/db/schema"
import { buildCategoryTree } from "@/lib/categories"
import type { CategoryNode as ApiCategoryNode } from "@/types/api"
import { corsOptions, ok, withCors } from "@/lib/api"

/**
 * 标签分类树节点(最多两级分类体系:一级大类 → 可选二级中类 → 叶子标签)。
 * 一级大类也可作为「叶子分类」直接承载标签。
 */
type TagBrief = {
  id: string
  name: string
  pinyin: string | null
  pinyinInitials: string | null
}

type SubCategoryNode = {
  /** 二级中类名称(如"武术养生");叶子一级大类时为同名 */
  name: string
  /** 中类 / 叶子大类节点 id(指向 categories.id) */
  categoryId: string
  /** 该中类 / 叶子大类的稳定 slug,供前端回传后端定位分类 */
  slug: string
  /** 该节点下的叶子标签列表 */
  tags: TagBrief[]
}

type CategoryNode = {
  /** 一级大类(如"传统与民族文化") */
  category: string
  /** 一级大类节点 id(指向 categories.id) */
  categoryId: string
  /** 该大类下的二级中类列表(含直挂本大类的叶子节点) */
  subCategories: SubCategoryNode[]
}

/**
 * GET /api/hobby-tags/categories
 *
 * 返回兴趣标签的分类树(最多两级,用于兴趣选择页骨架)。
 *
 * 分类骨架由 `categories` 树表驱动(运营可动态维护),叶子标签从 `hobby_tags`
 * 按 `category_id` 关联填充,只返回 `status='approved'` 的标签。
 *
 * 响应:`IResponse<{ categories: CategoryNode[] }>`
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  // 1. 读取分类树骨架(复用共享 helper):一级大类 + 其下二级中类
  const tree = await buildCategoryTree()
  // 二级中类按 parentId 分组
  const subByParent = new Map<string, ApiCategoryNode[]>()
  for (const top of tree) {
    for (const sub of top.children) {
      if (!subByParent.has(top.id)) subByParent.set(top.id, [])
      subByParent.get(top.id)!.push(sub)
    }
  }

  // 2. 读取 approved 叶子标签,按 category_id(二级中类) 分组
  const tagRows = await db
    .select({
      id: hobbyTags.id,
      name: hobbyTags.name,
      categoryId: hobbyTags.categoryId,
      pinyin: hobbyTags.pinyin,
      pinyinInitials: hobbyTags.pinyinInitials,
    })
    .from(hobbyTags)
    .where(eq(hobbyTags.status, "approved"))

  const tagsBySub = new Map<string, TagBrief[]>()
  for (const t of tagRows) {
    if (!t.categoryId) continue
    if (!tagsBySub.has(t.categoryId)) tagsBySub.set(t.categoryId, [])
    tagsBySub.get(t.categoryId)!.push({
      id: t.id,
      name: t.name,
      pinyin: t.pinyin,
      pinyinInitials: t.pinyinInitials,
    })
  }
  // 每个中类内的标签按名称排序(保证稳定顺序)
  for (const arr of tagsBySub.values()) {
    arr.sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))
  }

  // 3. 组装分类树(兼容旧 subCategory 为空的标签:归属到 category_id 对应中类)
  //    分类灵活化:标签可直挂 level=1 叶子大类;此类大类以其自身同名节点呈现直挂标签。
  const categoriesNode: CategoryNode[] = tree.map((top) => {
    const children = (subByParent.get(top.id) ?? []).sort(
      (a, b) => a.sortOrder - b.sortOrder
    )
    const subNodes: SubCategoryNode[] = children.map((sub) => ({
      name: sub.name,
      categoryId: sub.id,
      slug: sub.slug,
      tags: tagsBySub.get(sub.id) ?? [],
    }))
    // 一级大类自身若直接承载标签(叶子大类),以同名节点呈现其直挂标签
    const directTags = tagsBySub.get(top.id) ?? []
    if (directTags.length > 0) {
      subNodes.push({
        name: top.name,
        categoryId: top.id,
        slug: top.slug,
        tags: directTags,
      })
    }
    return {
      category: top.name,
      categoryId: top.id,
      subCategories: subNodes,
    }
  })

  return withCors(ok({ categories: categoriesNode }), req)
}
