"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import type { CategoryNode } from "@/types/api"

export function CategoryDialog({
  node,
  parentId,
  flatTops,
  onClose,
  onSaved,
}: {
  node?: CategoryNode
  parentId: string | null
  flatTops: CategoryNode[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!node
  const fixedParent = !!parentId // 新建子类时父级固定
  const isTopLevelNode = node?.level === 1

  const [name, setName] = useState(node?.name ?? "")
  const [slug, setSlug] = useState(node?.slug ?? "")
  const [selectedParent, setSelectedParent] = useState<string | null>(
    node ? node.parentId : parentId,
  )
  const [sortOrder, setSortOrder] = useState<number>(node?.sortOrder ?? 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveLevel: 1 | 2 = fixedParent ? 2 : selectedParent ? 2 : 1
  const effectiveParentId = fixedParent ? parentId : selectedParent

  async function handleSubmit() {
    if (!name.trim()) {
      setError("请填写分类名称")
      return
    }
    if (effectiveLevel === 2 && !effectiveParentId) {
      setError("请选择父级分类")
      return
    }
    setBusy(true)
    setError(null)
    const body = {
      name: name.trim(),
      slug: slug.trim() || undefined,
      level: effectiveLevel,
      parentId: effectiveLevel === 2 ? effectiveParentId : null,
      sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
    }
    const url = isEdit ? `/api/admin/categories/${node!.id}` : `/api/admin/categories`
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json()
    setBusy(false)
    if (res.ok) {
      onSaved()
    } else {
      setError(data.message || "保存失败")
    }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑分类" : fixedParent ? "新建二级中类" : "新建一级大类"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "修改分类信息后保存。" : "填写名称，slug 可留空自动生成。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="cat-name">名称</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：视觉艺术"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="cat-slug">Slug（留空自动生成）</Label>
            <Input
              id="cat-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="如：visual-arts"
            />
          </div>

          {fixedParent ? (
            <div className="space-y-1">
              <Label>父级分类</Label>
              <p className="text-sm text-muted-foreground">
                {flatTops.find((t) => t.id === parentId)?.name ?? "—"}
              </p>
            </div>
          ) : isTopLevelNode ? (
            <div className="space-y-1">
              <Label>父级分类</Label>
              <p className="text-sm text-muted-foreground">（顶级分类，无父级）</p>
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="cat-parent">父级分类</Label>
              <select
                id="cat-parent"
                className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                value={selectedParent ?? ""}
                onChange={(e) => setSelectedParent(e.target.value || null)}
              >
                <option value="">— 顶级分类 —</option>
                {flatTops.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="cat-sort">排序（数字越小越靠前）</Label>
            <Input
              id="cat-sort"
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
