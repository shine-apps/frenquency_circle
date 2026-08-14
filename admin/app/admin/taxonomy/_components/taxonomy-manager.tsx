"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { CategoryNode, CategoryDTO, TagDTO } from "@/types/api"
import { CategoryTree } from "./category-tree"
import { TagPanel } from "./tag-panel"
import { CategoryDialog } from "./category-dialog"
import { TagDialog } from "./tag-dialog"

export type SelectedCategory = {
  id: string
  name: string
  slug: string
  level: 1 | 2
  parentId: string | null
}

export function TaxonomyManager({ initialTree }: { initialTree: CategoryNode[] }) {
  const router = useRouter()
  const [tree, setTree] = useState<CategoryNode[]>(initialTree)
  const [selected, setSelected] = useState<SelectedCategory | null>(null)
  const [catDialog, setCatDialog] = useState<{
    open: boolean
    parentId?: string | null
    node?: CategoryNode
  } | null>(null)
  const [tagDialog, setTagDialog] = useState<{
    open: boolean
    tag?: TagDTO
    presetCategoryId?: string | null
  } | null>(null)

  // 一级 + 二级扁平列表,供 TagDialog 的「所属分类」下拉
  const flat: CategoryDTO[] = []
  for (const top of tree) {
    flat.push({
      id: top.id,
      name: top.name,
      slug: top.slug,
      level: 1,
      parentId: null,
      sortOrder: top.sortOrder,
    })
    for (const sub of top.children) {
      flat.push({
        id: sub.id,
        name: sub.name,
        slug: sub.slug,
        level: 2,
        parentId: top.id,
        sortOrder: sub.sortOrder,
      })
    }
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <section>
        <h2 className="mb-2 text-lg font-semibold">分类</h2>
        <CategoryTree
          tree={tree}
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          onEdit={(node, parentId) => setCatDialog({ open: true, node, parentId })}
          onAdd={(parentId) => setCatDialog({ open: true, parentId })}
          onDeleted={(id) => {
            setTree((t) =>
              t
                .filter((n) => n.id !== id)
                .map((n) => ({ ...n, children: n.children.filter((c) => c.id !== id) })),
            )
            if (selected?.id === id) setSelected(null)
          }}
        />
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">标签</h2>
        <TagPanel
          selected={selected}
          onAddTag={() =>
            setTagDialog({ open: true, presetCategoryId: selected?.id ?? null })
          }
          onEditTag={(tag) => setTagDialog({ open: true, tag })}
        />
      </section>

      {catDialog?.open ? (
        <CategoryDialog
          node={catDialog.node}
          parentId={catDialog.parentId ?? null}
          flatTops={tree}
          onClose={() => setCatDialog(null)}
          onSaved={() => {
            setCatDialog(null)
            router.refresh()
          }}
        />
      ) : null}

      {tagDialog?.open ? (
        <TagDialog
          tag={tagDialog.tag}
          categories={flat}
          presetCategoryId={tagDialog.presetCategoryId ?? null}
          onClose={() => setTagDialog(null)}
          onSaved={() => {
            setTagDialog(null)
            router.refresh()
          }}
        />
      ) : null}
    </div>
  )
}
