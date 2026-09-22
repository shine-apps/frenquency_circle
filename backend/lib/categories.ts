import { db } from "@/lib/db"
import { categories } from "@/db/schema"
import { CACHE_TTL, cacheKeys, cacheMdel, cacheWrap } from "@/lib/cache"
import type { CategoryNode } from "@/types/api"

/**
 * 将中文/混合名称转换为 URL 安全的 slug：
 * 转小写、空白转连字符、去除非字母数字连字符字符、折叠重复连字符、去首尾连字符。
 */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * 组装两级分类树（level 1 大类 → level 2 中类）。
 * 返回按 sortOrder、name 排序的树；不抛错，业务层负责捕获异常。
 */
export async function buildCategoryTree(): Promise<CategoryNode[]> {
  const rows = await db
    .select()
    .from(categories)
    .orderBy(categories.sortOrder, categories.name)

  const byId = new Map<string, CategoryNode>()
  for (const r of rows) {
    byId.set(r.id, {
      id: r.id,
      name: r.name,
      slug: r.slug,
      level: r.level,
      parentId: r.parentId,
      sortOrder: r.sortOrder,
      children: [],
    })
  }

  const tree: CategoryNode[] = []
  for (const node of byId.values()) {
    if (node.parentId && byId.has(node.parentId)) {
      byId.get(node.parentId)!.children.push(node)
    } else {
      tree.push(node)
    }
  }

  return sortTree(tree)
}

/** 原地递归排序（sortOrder 升序，其次 name 字典序）。 */
export function sortTree(tree: CategoryNode[]): CategoryNode[] {
  tree.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
  for (const node of tree) sortTree(node.children)
  return tree
}

/**
 * 带缓存的分类树读取(管理端 / 公开分类树骨架共用)。
 * 分类属于低频变更数据,缓存 10 分钟;分类或标签增删改后由
 * {@link invalidateCategoryCaches} 立即失效。
 */
export async function getCategoryTreeCached(): Promise<CategoryNode[]> {
  return cacheWrap(
    cacheKeys.categoryTree(),
    () => buildCategoryTree(),
    CACHE_TTL.CATEGORY_TREE
  )
}

/**
 * 失效分类相关缓存:分类树 + 公开分类树。
 * 凡是改动 `categories` 或影响公开树内容的 `hobby_tags`(approved 标签增删改)
 * 写入接口,都必须调用本函数。
 */
export async function invalidateCategoryCaches(): Promise<void> {
  await cacheMdel([cacheKeys.categoryTree(), cacheKeys.categoryPublic()])
}
