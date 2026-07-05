"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, XIcon, MoreHorizontalIcon, EyeIcon } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { TagDTO } from "@/types/api"
import type { IResponse } from "@/types/api"

/** 状态筛选 Tab 值 */
type StatusFilter = "all" | "pending" | "approved" | "rejected"

/** 状态 Badge variant 映射 */
function statusBadgeVariant(
  status: TagDTO["status"]
): "default" | "secondary" | "destructive" {
  if (status === "approved") return "default"
  if (status === "pending") return "secondary"
  return "destructive"
}

/** 状态中文标签 */
function statusLabel(status: TagDTO["status"]): string {
  if (status === "approved") return "已通过"
  if (status === "pending") return "待审核"
  return "已拒绝"
}

/**
 * 调用 PATCH /api/admin/tags/:id 更新标签状态。
 * 成功后触发 router.refresh() 让 server component 重新查询。
 */
async function patchTag(
  tagId: string,
  body: { status?: "approved" | "rejected" }
): Promise<boolean> {
  const res = await fetch(`/api/admin/tags/${tagId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) return false
  const data = (await res.json()) as IResponse<TagDTO>
  return data.code === 200
}

export function TagsTable({ items }: { items: TagDTO[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [filter, setFilter] = useState<StatusFilter>("all")
  const [selected, setSelected] = useState<TagDTO | null>(null)
  const [pending, setPending] = useState(false)

  // 按状态筛选
  const filtered =
    filter === "all" ? items : items.filter((t) => t.status === filter)

  // 各状态计数
  const counts = {
    all: items.length,
    pending: items.filter((t) => t.status === "pending").length,
    approved: items.filter((t) => t.status === "approved").length,
    rejected: items.filter((t) => t.status === "rejected").length,
  }

  function refresh() {
    startTransition(() => {
      router.refresh()
    })
  }

  async function handleApprove(tagId: string) {
    setPending(true)
    const ok = await patchTag(tagId, { status: "approved" })
    setPending(false)
    if (ok) refresh()
  }

  async function handleReject(tagId: string) {
    setPending(true)
    const ok = await patchTag(tagId, { status: "rejected" })
    setPending(false)
    if (ok) refresh()
  }

  return (
    <>
      <Tabs
        value={filter}
        onValueChange={(v) => setFilter(v as StatusFilter)}
      >
        <TabsList>
          <TabsTrigger value="all">全部 ({counts.all})</TabsTrigger>
          <TabsTrigger value="pending">待审核 ({counts.pending})</TabsTrigger>
          <TabsTrigger value="approved">已通过 ({counts.approved})</TabsTrigger>
          <TabsTrigger value="rejected">已拒绝 ({counts.rejected})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>SubCategory</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-medium">{t.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {t.category}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t.subCategory ?? "-"}
                </TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(t.status)}>
                    {statusLabel(t.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t.createdAt.slice(0, 10)}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {t.status === "pending" ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="通过"
                          disabled={pending}
                          onClick={() => handleApprove(t.id)}
                        >
                          <CheckIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="拒绝"
                          disabled={pending}
                          onClick={() => handleReject(t.id)}
                        >
                          <XIcon />
                        </Button>
                      </>
                    ) : null}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="操作"
                          />
                        }
                      >
                        <MoreHorizontalIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setSelected(t)}>
                          <EyeIcon />
                          查看
                        </DropdownMenuItem>
                        {t.status !== "pending" ? (
                          <DropdownMenuItem
                            onClick={() => handleApprove(t.id)}
                            disabled={pending}
                          >
                            <CheckIcon />
                            重新通过
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="text-center text-muted-foreground"
                >
                  暂无数据
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>标签详情</DialogDescription>
          </DialogHeader>
          {selected ? (
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <dt className="text-muted-foreground">Category</dt>
              <dd className="col-span-2">{selected.category}</dd>
              <dt className="text-muted-foreground">SubCategory</dt>
              <dd className="col-span-2">{selected.subCategory ?? "-"}</dd>
              <dt className="text-muted-foreground">Pinyin</dt>
              <dd className="col-span-2">{selected.pinyin ?? "-"}</dd>
              <dt className="text-muted-foreground">Initials</dt>
              <dd className="col-span-2">
                {selected.pinyinInitials ?? "-"}
              </dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="col-span-2">
                <Badge variant={statusBadgeVariant(selected.status)}>
                  {statusLabel(selected.status)}
                </Badge>
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="col-span-2">
                {selected.createdAt.slice(0, 10)}
              </dd>
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
