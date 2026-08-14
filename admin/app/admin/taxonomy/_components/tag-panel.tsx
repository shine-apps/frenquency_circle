"use client"

import { useCallback, useEffect, useState } from "react"
import { PlusIcon, PencilIcon, TrashIcon, CheckIcon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { TagDTO } from "@/types/api"
import type { SelectedCategory } from "./taxonomy-manager"

type StatusTab = "all" | "pending" | "approved" | "rejected"

const STATUS_LABEL: Record<TagDTO["status"], string> = {
  pending: "待审核",
  approved: "已通过",
  rejected: "已拒绝",
}

export function TagPanel({
  selected,
  onAddTag,
  onEditTag,
}: {
  selected: SelectedCategory | null
  onAddTag: () => void
  onEditTag: (tag: TagDTO) => void
}) {
  const [items, setItems] = useState<TagDTO[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState("")
  const [statusTab, setStatusTab] = useState<StatusTab>("all")
  const [loading, setLoading] = useState(false)
  const pageSize = 20

  const categorySlug = selected?.slug ?? ""

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("pageSize", String(pageSize))
    if (categorySlug) params.set("category", categorySlug)
    if (q.trim()) params.set("q", q.trim())
    if (statusTab !== "all") params.set("status", statusTab)
    const res = await fetch(`/api/admin/hobby-tags?${params.toString()}`)
    const data = await res.json()
    setLoading(false)
    if (res.ok) {
      setItems(data.list ?? [])
      setTotal(data.total ?? 0)
    } else {
      setItems([])
      setTotal(0)
    }
  }, [page, categorySlug, q, statusTab])

  useEffect(() => {
    load()
  }, [load])

  // 切换分类 / 状态 / 关键词时回到第 1 页
  useEffect(() => {
    setPage(1)
  }, [categorySlug, statusTab, q])

  async function patchTag(tagId: string, status: "approved" | "rejected") {
    const res = await fetch(`/api/admin/hobby-tags/${tagId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    if (res.ok) {
      load()
    } else {
      const d = await res.json().catch(() => ({}))
      alert(d.message || "操作失败")
    }
  }

  async function deleteTag(tag: TagDTO) {
    if (!confirm(`确认删除标签「${tag.name}」？`)) return
    const res = await fetch(`/api/admin/hobby-tags/${tag.id}`, {
      method: "DELETE",
    })
    if (res.ok) {
      load()
    } else {
      const d = await res.json().catch(() => ({}))
      alert(d.message || "删除失败")
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {selected ? `${selected.name} · 标签` : "全部标签"}
          {!loading ? `（共 ${total} 个）` : ""}
        </p>
        <Button onClick={onAddTag}>
          <PlusIcon /> 新建标签
        </Button>
      </div>

      <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as StatusTab)}>
        <TabsList>
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="pending">待审核</TabsTrigger>
          <TabsTrigger value="approved">已通过</TabsTrigger>
          <TabsTrigger value="rejected">已拒绝</TabsTrigger>
        </TabsList>

        <div className="mt-3 flex items-center gap-2">
          <Input
            placeholder="搜索名称 / 拼音"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="max-w-xs"
          />
        </div>

        <TabsContent value={statusTab} className="mt-3">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>分类</TableHead>
                  <TableHead>拼音</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                      {loading ? "加载中…" : "暂无标签"}
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((tag) => (
                    <TableRow key={tag.id}>
                      <TableCell className="font-medium">{tag.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {tag.subCategory ? `${tag.subCategory} / ` : ""}
                        {tag.category}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {tag.pinyin}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            tag.status === "approved"
                              ? "default"
                              : tag.status === "rejected"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {STATUS_LABEL[tag.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {tag.status !== "approved" ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => patchTag(tag.id, "approved")}
                              aria-label="通过"
                            >
                              <CheckIcon />
                            </Button>
                          ) : null}
                          {tag.status !== "rejected" ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => patchTag(tag.id, "rejected")}
                              aria-label="拒绝"
                            >
                              <XIcon />
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onEditTag(tag)}
                            aria-label="编辑"
                          >
                            <PencilIcon />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => deleteTag(tag)}
                            aria-label="删除"
                          >
                            <TrashIcon />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              第 {page} / {totalPages} 页
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
              </Button>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
