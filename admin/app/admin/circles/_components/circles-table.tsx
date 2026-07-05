"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  MoreHorizontalIcon,
  EyeIcon,
  PowerOffIcon,
  AlertTriangleIcon,
  RotateCcwIcon,
} from "lucide-react"

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
import type { CircleDTO, IResponse } from "@/types/api"

/** 圈子列表项(含创建者名称) */
type CircleListItem = CircleDTO & {
  creatorName: string
}

/** 状态筛选 Tab 值 */
type StatusFilter = "all" | "active" | "offline" | "violated" | "deleted"

/** 状态 Badge variant 映射 */
function statusBadgeVariant(
  status: string
): "default" | "secondary" | "destructive" {
  if (status === "active") return "default"
  if (status === "deleted") return "secondary"
  return "destructive"
}

/** 状态中文标签 */
function statusLabel(status: string): string {
  if (status === "active") return "活跃"
  if (status === "offline") return "已下线"
  if (status === "deleted") return "已删除"
  if (status === "violated") return "违规"
  return status
}

/**
 * 调用 PATCH /api/admin/circles/:id 更新圈子状态。
 */
async function patchCircle(
  circleId: string,
  body: { status: "active" | "offline" | "violated" }
): Promise<boolean> {
  const res = await fetch(`/api/admin/circles/${circleId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) return false
  const data = (await res.json()) as IResponse<CircleDTO>
  return data.code === 200
}

export function CirclesTable({ items }: { items: CircleListItem[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [filter, setFilter] = useState<StatusFilter>("all")
  const [selected, setSelected] = useState<CircleListItem | null>(null)
  const [pending, setPending] = useState(false)

  const filtered =
    filter === "all" ? items : items.filter((c) => c.status === filter)

  const counts = {
    all: items.length,
    active: items.filter((c) => c.status === "active").length,
    offline: items.filter((c) => c.status === "offline").length,
    violated: items.filter((c) => c.status === "violated").length,
    deleted: items.filter((c) => c.status === "deleted").length,
  }

  function refresh() {
    startTransition(() => {
      router.refresh()
    })
  }

  async function handleAction(
    circleId: string,
    status: "active" | "offline" | "violated"
  ) {
    setPending(true)
    const ok = await patchCircle(circleId, { status })
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
          <TabsTrigger value="active">活跃 ({counts.active})</TabsTrigger>
          <TabsTrigger value="offline">已下线 ({counts.offline})</TabsTrigger>
          <TabsTrigger value="violated">违规 ({counts.violated})</TabsTrigger>
          <TabsTrigger value="deleted">已删除 ({counts.deleted})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Creator</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Members</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.title}</TableCell>
                <TableCell className="text-muted-foreground">
                  {c.creatorName}
                </TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant(c.status)}>
                    {statusLabel(c.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.memberCount}
                  {c.maxMembers ? ` / ${c.maxMembers}` : ""}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.createdAt.slice(0, 10)}
                </TableCell>
                <TableCell>
                  {c.status !== "deleted" ? (
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
                        <DropdownMenuItem onClick={() => setSelected(c)}>
                          <EyeIcon />
                          查看
                        </DropdownMenuItem>
                        {c.status === "active" ? (
                          <>
                            <DropdownMenuItem
                              onClick={() =>
                                handleAction(c.id, "offline")
                              }
                              disabled={pending}
                            >
                              <PowerOffIcon />
                              下线
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                handleAction(c.id, "violated")
                              }
                              disabled={pending}
                            >
                              <AlertTriangleIcon />
                              标记违规
                            </DropdownMenuItem>
                          </>
                        ) : null}
                        {c.status === "offline" || c.status === "violated" ? (
                          <DropdownMenuItem
                            onClick={() => handleAction(c.id, "active")}
                            disabled={pending}
                          >
                            <RotateCcwIcon />
                            恢复上线
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
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
            <DialogTitle>{selected?.title}</DialogTitle>
            <DialogDescription>圈子详情</DialogDescription>
          </DialogHeader>
          {selected ? (
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <dt className="text-muted-foreground">Creator</dt>
              <dd className="col-span-2">{selected.creatorName}</dd>
              <dt className="text-muted-foreground">Address</dt>
              <dd className="col-span-2">{selected.address}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd className="col-span-2">
                <Badge variant={statusBadgeVariant(selected.status)}>
                  {statusLabel(selected.status)}
                </Badge>
              </dd>
              <dt className="text-muted-foreground">Members</dt>
              <dd className="col-span-2">
                {selected.memberCount}
                {selected.maxMembers ? ` / ${selected.maxMembers}` : ""}
              </dd>
              <dt className="text-muted-foreground">Activity</dt>
              <dd className="col-span-2">
                {selected.activityTime ?? "-"}
              </dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="col-span-2">
                {selected.contactPhone ?? "-"}
              </dd>
              <dt className="text-muted-foreground">Wechat</dt>
              <dd className="col-span-2">{selected.wechat ?? "-"}</dd>
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
