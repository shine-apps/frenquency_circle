import { desc } from "drizzle-orm"

import { hobbyTags } from "@/db/schema"
import {
  selectTagsWithCategory,
  toTagDTO,
  type TagRowWithCategory,
} from "@/lib/search/tag-search"
import { TagsTable } from "./_components/tags-table"
import type { TagDTO } from "@/types/api"

// SSR 标签列表上限,防止全量加载。完整分页可通过 /api/admin/hobby-tags 接口消费。
const SSR_TAG_LIMIT = 200

export default async function AdminTagsPage() {
  const rows = await selectTagsWithCategory()
    .orderBy(desc(hobbyTags.createdAt))
    .limit(SSR_TAG_LIMIT)

  const items: TagDTO[] = (rows as TagRowWithCategory[]).map(toTagDTO)

  return (
    <main className="p-6">
      <h1 className="mb-4 text-2xl font-bold">兴趣标签管理</h1>
      <TagsTable items={items} />
    </main>
  )
}
