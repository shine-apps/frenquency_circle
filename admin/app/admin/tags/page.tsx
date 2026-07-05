import { desc, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { tags } from "@/db/schema"
import { TagsTable } from "./_components/tags-table"
import type { TagDTO } from "@/types/api"

// SSR 标签列表上限,防止全量加载。完整分页可通过 /api/admin/tags 接口消费。
const SSR_TAG_LIMIT = 200

/**
 * 管理后台标签管理页(server component)。
 * 直接从 db 查询标签(含所有状态),传入客户端组件做状态筛选 + 审核。
 */
export default async function AdminTagsPage() {
  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(tags)
      .orderBy(desc(tags.createdAt))
      .limit(SSR_TAG_LIMIT),
    db.select({ count: sql<number>`count(*)::int` }).from(tags),
  ])

  const items: TagDTO[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    subCategory: r.subCategory ?? null,
    pinyin: r.pinyin ?? null,
    pinyinInitials: r.pinyinInitials ?? null,
    status: r.status as "pending" | "approved" | "rejected",
    createdBy: r.createdBy ?? null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))

  const total = Number(count)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">标签管理</h1>
        <p className="text-sm text-muted-foreground">
          共 {total} 个标签{total > SSR_TAG_LIMIT ? `（仅展示最近 ${SSR_TAG_LIMIT} 条）` : ""}
        </p>
      </div>
      <TagsTable items={items} />
    </div>
  )
}
