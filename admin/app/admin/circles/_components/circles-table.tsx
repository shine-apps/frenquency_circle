"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  MoreHorizontalIcon,
  EyeIcon,
  PowerOffIcon,
  AlertTriangleIcon,
  RotateCcwIcon,
  CheckIcon,
  XIcon,
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
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { CircleDTO, CertificationFile, IResponse } from "@/types/api"

/** 圈子列表项(含创建者名称和认证材料) */
type CircleListItem = CircleDTO & {
  creatorName: string
  certificationFiles?: CertificationFile[] | null
}

/** 状态筛选 Tab 值 */
type StatusFilter = "all" | "active" | "offline" | "violated" | "deleted" | "pending" | "rejected"

/** 状态 Badge variant 映射 */
function statusBadgeVariant(
  status: string
): "default" | "secondary" | "destructive" {
  if (status === "active") return "default"
  if (status === "deleted" || status === "pending") return "secondary"
  return "destructive"
}

/** 状态中文标签 */
function statusLabel(status: string): string {
  if (status === "active") return "活跃"
  if (status === "offline") return "已下线"
  if (status === "deleted") return "已删除"
  if (status === "violated") return "违规"
  if (status === "pending") return "待审核"
  if (status === "rejected") return "未通过"
  return status
}

/**
 * 调用 PATCH /api/admin/circles/:id 更新圈子状态。
 */
async function patchCircle(
  circleId: string,
  body: { status: "active" | "offline" | "violated" | "rejected"; reviewNote?: string }
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
  // 驳回弹窗状态
  const [rejectTarget, setRejectTarget] = useState<CircleListItem | null>(null)
  const [reviewNote, setReviewNote] = useState("")

  const filtered =
    filter === "all" ? items : items.filter((c) => c.status === filter)

  const counts = {
    all: items.length,
    active: items.filter((c) => c.status === "active").length,
    offline: items.filter((c) => c.status === "offline").length,
    violated: items.filter((c) => c.status === "violated").length,
    deleted: items.filter((c) => c.status === "deleted").length,
    pending: items.filter((c) => c.status === "pending").length,
    rejected: items.filter((c) => c.status === "rejected").length,
  }

  function refresh() {
    startTransition(() => {
      router.refresh()
    })
  }

  async function handleAction(
    circleId: string,
    status: "active" | "offline" | "violated" | "rejected",
    note?: string
  ) {
    setPending(true)
    const ok = await patchCircle(circleId, { status, reviewNote: note })
    setPending(false)
    if (ok) refresh()
  }

  /** 打开驳回弹窗 */
  function openRejectDialog(c: CircleListItem) {
    setRejectTarget(c)
    setReviewNote("")
  }

  /** 确认驳回 */
  async function confirmReject() {
    if (!rejectTarget) return
    await handleAction(rejectTarget.id, "rejected", reviewNote || undefined)
    setRejectTarget(null)
    setReviewNote("")
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
          <TabsTrigger value="active">活跃 ({counts.active})</TabsTrigger>
          <TabsTrigger value="rejected">未通过 ({counts.rejected})</TabsTrigger>
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
                        {c.status === "pending" ? (
                          <>
                            <DropdownMenuItem
                              onClick={() => handleAction(c.id, "active")}
                              disabled={pending}
                            >
                              <CheckIcon />
                              审核通过
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => openRejectDialog(c)}
                              disabled={pending}
                            >
                              <XIcon />
                              驳回
                            </DropdownMenuItem>
                          </>
                        ) : null}
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
                        {c.status === "offline" || c.status === "violated" || c.status === "rejected" ? (
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

      {/* 圈子详情弹窗 */}
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
              {/* 认证材料展示 */}
              {selected.certificationFiles && selected.certificationFiles.length > 0 ? (
                <>
                  <dt className="text-muted-foreground">认证材料</dt>
                  <dd className="col-span-2">
                    <div className="flex flex-wrap gap-2">
                      {selected.certificationFiles.map((f, i) => (
                        <a
                          key={i}
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
                        >
                          {f.mimeType.startsWith("image/") ? "🖼️" : "🎬"}
                          {f.originalName}
                        </a>
                      ))}
                    </div>
                  </dd>
                </>
              ) : null}
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 驳回弹窗 */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => !open && setRejectTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>驳回圈子</DialogTitle>
            <DialogDescription>
              确定驳回「{rejectTarget?.title}」?可填写驳回原因(可选)。
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="驳回原因(可选)"
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
            maxLength={500}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectTarget(null)}
              disabled={pending}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={confirmReject}
              disabled={pending}
            >
              确认驳回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
