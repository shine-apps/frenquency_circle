import { buildCategoryTree } from "@/lib/categories"
import { TaxonomyManager } from "./_components/taxonomy-manager"

export const dynamic = "force-dynamic"

export default async function AdminTaxonomyPage() {
  const tree = await buildCategoryTree()
  return (
    <main className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">兴趣分类与标签</h1>
        <p className="text-sm text-muted-foreground">
          左侧管理分类（大类 / 中类），选中分类后右侧管理其下标签。
        </p>
      </div>
      <TaxonomyManager initialTree={tree} />
    </main>
  )
}
