"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"
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

type PageTab = "tags" | "categories"

export function TaxonomyManager({ initialTree }: { initialTree: CategoryNode[] }) {
  const router = useRouter()
  const [tree, setTree] = useState<CategoryNode[]>(initialTree)
  const [activeTab, setActiveTab] = useState<PageTab>("tags")
  const [selectedCategory, setSelectedCategory] = useState<SelectedCategory | null>(null)
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

  // 扁平化分类,供 TagDialog 的「所属分类」下拉
  const flat: CategoryDTO[] = useMemo(() => {
    const list: CategoryDTO[] = []
    for (const top of tree) {
      list.push({
        id: top.id,
        name: top.name,
        slug: top.slug,
        level: 1,
        parentId: null,
        sortOrder: top.sortOrder,
      })
      for (const sub of top.children) {
        list.push({
          id: sub.id,
          name: sub.name,
          slug: sub.slug,
          level: 2,
          parentId: top.id,
          sortOrder: sub.sortOrder,
        })
      }
    }
    return list
  }, [tree])

  // 标签管理 tab 用的分类选择器选项(一级 + 二级,带层级展示)
  const categoryOptions = useMemo(() => {
    const opts: { id: string; label: string; level: number }[] = []
    for (const top of tree) {
      opts.push({ id: top.id, label: top.name, level: 1 })
      for (const sub of top.children) {
        opts.push({ id: sub.id, label: `${top.name} / ${sub.name}`, level: 2 })
      }
    }
    return opts
  }, [tree])

  function handleViewTags(node: CategoryNode) {
    setSelectedCategory({
      id: node.id,
      name: node.name,
      slug: node.slug,
      level: node.level as 1 | 2,
      parentId: node.parentId,
    })
    setActiveTab("tags")
  }

  function handleSelectCategory(id: string) {
    if (!id) {
      setSelectedCategory(null)
      return
    }
    const node = flat.find((c) => c.id === id)
    if (!node) {
      setSelectedCategory(null)
      return
    }
    setSelectedCategory({
      id: node.id,
      name: node.name,
      slug: node.slug,
      level: node.level as 1 | 2,
      parentId: node.parentId,
    })
  }

  return (
    <div className="space-y-4">
      {/* 顶部两个 Tab */}
      <div className="inline-flex rounded-lg border bg-muted p-1">
        <button
          type="button"
          onClick={() => setActiveTab("tags")}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            activeTab === "tags"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          标签管理
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("categories")}
          className={cn(
            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            activeTab === "categories"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          分类管理
        </button>
      </div>

      {activeTab === "tags" ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Label htmlFor="cat-select" className="shrink-0">
              所属分类
            </Label>
            <select
              id="cat-select"
              className="h-9 w-full max-w-sm rounded-md border bg-background px-2 text-sm"
              value={selectedCategory?.id ?? ""}
              onChange={(e) => handleSelectCategory(e.target.value)}
            >
              <option value="">全部标签</option>
              {categoryOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.level === 2 ? `— ${o.label}` : o.label}
                </option>
              ))}
            </select>
          </div>

          <TagPanel
            selected={selectedCategory}
            onAddTag={() =>
              setTagDialog({ open: true, presetCategoryId: selectedCategory?.id ?? null })
            }
            onEditTag={(tag) => setTagDialog({ open: true, tag })}
          />
        </div>
      ) : (
        <CategoryTree
          tree={tree}
          selectedId={selectedCategory?.id ?? null}
          onSelect={(c) => setSelectedCategory(c)}
          onViewTags={handleViewTags}
          onEdit={(node, parentId) => setCatDialog({ open: true, node, parentId })}
          onAdd={(parentId) => setCatDialog({ open: true, parentId })}
          onDeleted={(id) => {
            setTree((t) =>
              t
                .filter((n) => n.id !== id)
                .map((n) => ({ ...n, children: n.children.filter((c) => c.id !== id) })),
            )
            if (selectedCategory?.id === id) setSelectedCategory(null)
          }}
        />
      )}

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
