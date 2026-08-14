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
import type { TagDTO, CategoryDTO } from "@/types/api"

export function TagDialog({
  tag,
  categories,
  presetCategoryId,
  onClose,
  onSaved,
}: {
  tag?: TagDTO
  categories: CategoryDTO[]
  presetCategoryId?: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!tag
  const defaultCategoryId = tag?.categoryId ?? presetCategoryId ?? ""

  const [name, setName] = useState(tag?.name ?? "")
  const [categoryId, setCategoryId] = useState<string>(defaultCategoryId)
  const [status, setStatus] = useState<TagDTO["status"]>(tag?.status ?? "pending")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!name.trim()) {
      setError("请填写标签名称")
      return
    }
    if (!categoryId) {
      setError("请选择所属分类")
      return
    }
    const category = categories.find((c) => c.id === categoryId)
    if (!category) {
      setError("所属分类无效")
      return
    }
    setBusy(true)
    setError(null)
    const body = {
      name: name.trim(),
      categorySlug: category.slug,
      status,
    }
    const url = isEdit ? `/api/admin/hobby-tags/${tag!.id}` : `/api/admin/hobby-tags`
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
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
          <DialogTitle>{isEdit ? "编辑标签" : "新建标签"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "修改标签信息后保存。" : "填写名称并选择所属分类。"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="tag-name">名称</Label>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如：油画"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="tag-cat">所属分类</Label>
            <select
              id="tag-cat"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">— 请选择 —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.level === 2 ? `— ${c.name}` : c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="tag-status">状态</Label>
            <select
              id="tag-status"
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as TagDTO["status"])}
            >
              <option value="pending">待审核</option>
              <option value="approved">已通过</option>
              <option value="rejected">已拒绝</option>
            </select>
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
