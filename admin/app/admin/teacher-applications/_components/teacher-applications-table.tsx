"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  MoreHorizontalIcon,
  EyeIcon,
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
import type { AdminTeacherApplicationItem, CertificationFile, IResponse } from "@/types/api"

type StatusFilter = "all" | "pending" | "approved" | "rejected"

function statusBadgeVariant(
  status: string
): "default" | "secondary" | "destructive" {
  if (status === "approved") return "default"
  if (status === "pending") return "secondary"
  return "destructive"
}

function statusLabel(status: string): string {
  if (status === "pending") return "待审核"
  if (status === "approved") return "已通过"
  if (status === "rejected") return "已驳回"
  return status
}

async function patchApplication(
  id: string,
  body: { status: "approved" | "rejected"; reviewNote?: string }
): Promise<boolean> {
  const res = await fetch(`/api/admin/teacher-applications/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) return false
  const data = (await res.json()) as IResponse
  return data.code === 200
}

export function TeacherApplicationsTable({
  items,
}: {
  items: AdminTeacherApplicationItem[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [filter, setFilter] = useState<StatusFilter>("all")
  const [selected, setSelected] = useState<AdminTeacherApplicationItem | null>(null)
  const [loading, setLoading] = useState(false)
  // 驳回弹窗
  const [rejectTarget, setRejectTarget] = useState<AdminTeacherApplicationItem | null>(null)
  const [reviewNote, setReviewNote] = useState("")

  const filtered =
    filter === "all" ? items : items.filter((a) => a.status === filter)

  const counts = {
    all: items.length,
    pending: items.filter((a) => a.status === "pending").length,
    approved: items.filter((a) => a.status === "approved").length,
    rejected: items.filter((a) => a.status === "rejected").length,
  }

  function refresh() {
    startTransition(() => {
      router.refresh()
    })
  }

  async function handleAction(
    id: string,
    status: "approved" | "rejected",
    note?: string
  ) {
    setLoading(true)
    const ok = await patchApplication(id, { status, reviewNote: note })
    setLoading(false)
    if (ok) refresh()
  }

  return (
    <>
      <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
        <TabsList>
          <TabsTrigger value="all">全部 ({counts.all})</TabsTrigger>
          <TabsTrigger value="pending">待审核 ({counts.pending})</TabsTrigger>
          <TabsTrigger value="approved">已通过 ({counts.approved})</TabsTrigger>
          <TabsTrigger value="rejected">已驳回 ({counts.rejected})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-md border mt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>申请人</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>材料数量</TableHead>
              <TableHead>审核人</TableHead>
              <TableHead>提交时间</TableHead>
              <TableHead className="w-[50px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  暂无数据
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((app) => (
                <TableRow key={app.id}>
                  <TableCell className="font-medium">{app.userName}</TableCell>
                  <TableCell>
                    <Badge variant={statusBadgeVariant(app.status)}>
                      {statusLabel(app.status)}
                    </Badge>
                  </TableCell>
                  <TableCell>{app.files?.length ?? 0} 个</TableCell>
                  <TableCell>{app.reviewerName ?? "-"}</TableCell>
                  <TableCell>{app.createdAt.slice(0, 10)}</TableCell>
                  <TableCell>
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
                        <DropdownMenuItem onClick={() => setSelected(app)}>
                          <EyeIcon />
                          查看
                        </DropdownMenuItem>
                        {app.status === "pending" ? (
                          <>
                            <DropdownMenuItem
                              onClick={() => handleAction(app.id, "approved")}
                              disabled={loading}
                            >
                              <CheckIcon />
                              审核通过
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setRejectTarget(app)
                                setReviewNote("")
                              }}
                              disabled={loading}
                            >
                              <XIcon />
                              驳回
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 详情弹窗 */}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>认证申请详情</DialogTitle>
            <DialogDescription>
              {selected?.userName} 的教师认证申请
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">状态</dt>
              <dd>
                <Badge variant={statusBadgeVariant(selected.status)}>
                  {statusLabel(selected.status)}
                </Badge>
              </dd>
              <dt className="text-muted-foreground">申请人</dt>
              <dd>{selected.userName}</dd>
              <dt className="text-muted-foreground">审核人</dt>
              <dd>{selected.reviewerName ?? "-"}</dd>
              <dt className="text-muted-foreground">驳回原因</dt>
              <dd>{selected.reviewNote ?? "-"}</dd>
              <dt className="text-muted-foreground">提交时间</dt>
              <dd>{selected.createdAt.slice(0, 10)}</dd>
              <dt className="text-muted-foreground">身份证</dt>
              <dd>
                <div className="flex flex-wrap gap-2">
                  {selected.idCardFront && (
                    <a
                      href={selected.idCardFront.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
                    >
                      🪪 人像面
                    </a>
                  )}
                  {selected.idCardBack && (
                    <a
                      href={selected.idCardBack.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
                    >
                      🪪 国徽面
                    </a>
                  )}
                  {!selected.idCardFront && !selected.idCardBack && "-"}
                </div>
              </dd>
              <dt className="text-muted-foreground">认证材料</dt>
              <dd>
                <div className="flex flex-wrap gap-2">
                  {selected.files?.map((f: CertificationFile, i: number) => (
                    <a
                      key={i}
                      href={f.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
                    >
                      {f.mimeType.startsWith("image/") ? "🖼️" : "🎬"}{" "}
                      {f.originalName}
                    </a>
                  ))}
                  {selected.files?.length === 0 && "-"}
                </div>
              </dd>
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
            <DialogTitle>驳回认证申请</DialogTitle>
            <DialogDescription>
              确定驳回「{rejectTarget?.userName}」的教师认证申请?可填写驳回原因(可选)。
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
              disabled={loading}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!rejectTarget) return
                await handleAction(
                  rejectTarget.id,
                  "rejected",
                  reviewNote || undefined
                )
                setRejectTarget(null)
                setReviewNote("")
              }}
              disabled={loading}
            >
              确认驳回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
