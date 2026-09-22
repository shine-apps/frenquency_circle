"use client"

import { PlusIcon, PencilIcon, TrashIcon, EyeIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import type { CategoryNode } from "@/types/api"
import type { SelectedCategory } from "./taxonomy-manager"

export function CategoryTree({
  tree,
  selectedId,
  onSelect,
  onViewTags,
  onEdit,
  onAdd,
  onDeleted,
}: {
  tree: CategoryNode[]
  selectedId: string | null
  onSelect: (c: SelectedCategory) => void
  onViewTags: (node: CategoryNode) => void
  onEdit: (node: CategoryNode, parentId: string | null) => void
  onAdd: (parentId: string | null) => void
  onDeleted: (id: string) => void
}) {
  async function handleDelete(node: CategoryNode) {
    if (!confirm(`确认删除「${node.name}」？其下子分类与标签需先清理。`)) return
    const res = await fetch(`/api/admin/categories/${node.id}`, {
      method: "DELETE",
    })
    const data = await res.json()
    if (res.ok) {
      onDeleted(node.id)
    } else {
      alert(data.message || "删除失败")
    }
  }

  return (
    <div className="space-y-3">
      <Button onClick={() => onAdd(null)}>
        <PlusIcon /> 新建一级大类
      </Button>
      {tree.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无分类</p>
      ) : null}
      {tree.map((top) => (
        <Card
          key={top.id}
          className={selectedId === top.id ? "p-4 ring-2 ring-primary" : "p-4"}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="text-left"
              onClick={() =>
                onSelect({
                  id: top.id,
                  name: top.name,
                  slug: top.slug,
                  level: 1,
                  parentId: null,
                })
              }
            >
              <span className="font-semibold">{top.name}</span>
              <span className="ml-2 text-xs text-muted-foreground">{top.slug}</span>
            </button>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onViewTags(top)}
                aria-label="查看全部标签"
              >
                <EyeIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onEdit(top, null)}
                aria-label="编辑"
              >
                <PencilIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => onAdd(top.id)}
                aria-label="新建子分类"
              >
                <PlusIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleDelete(top)}
                aria-label="删除"
              >
                <TrashIcon />
              </Button>
            </div>
          </div>
          {top.children.length > 0 ? (
            <div className="ml-4 space-y-1 border-l pl-4">
              {top.children.map((sub) => (
                <div
                  key={sub.id}
                  className={
                    selectedId === sub.id
                      ? "flex items-center justify-between rounded bg-primary/10 py-1"
                      : "flex items-center justify-between py-1"
                  }
                >
                  <button
                    type="button"
                    className="text-left"
                    onClick={() =>
                      onSelect({
                        id: sub.id,
                        name: sub.name,
                        slug: sub.slug,
                        level: 2,
                        parentId: top.id,
                      })
                    }
                  >
                    <span>{sub.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {sub.slug}
                    </span>
                  </button>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onViewTags(sub)}
                      aria-label="查看全部标签"
                    >
                      <EyeIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onEdit(sub, top.id)}
                      aria-label="编辑"
                    >
                      <PencilIcon />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleDelete(sub)}
                      aria-label="删除"
                    >
                      <TrashIcon />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>
      ))}
    </div>
  )
}
