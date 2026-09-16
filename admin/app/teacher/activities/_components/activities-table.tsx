"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { BanIcon, MoreHorizontalIcon, PencilIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

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
import type { ActivityDTO, IResponse } from "@/types/api"
import { ActivityFormDialog, type ActivityFormInitial } from "./activity-form-dialog"

/** 教师后台活动列表项 */
export type TeacherActivityItem = ActivityDTO & {
  creatorName: string
  /** 当前登录用户是否可编辑(创建者本人或 ADMIN) */
  canManage: boolean
}

/** 状态筛选 Tab 值 */
type StatusFilter = "all" | "active" | "cancelled"

/** 时间展示:YYYY-MM-DD HH:mm(本地时区) */
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toFormInitial(item: TeacherActivityItem): ActivityFormInitial {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    startTime: item.startTime,
    registrationDeadline: item.registrationDeadline,
    contactPhone: item.contactPhone,
    coverImages: item.coverImages,
  }
}

export function TeacherActivitiesTable({
  items,
  scope,
  canSwitchScope,
}: {
  items: TeacherActivityItem[]
  /** 当前数据范围:mine 仅自己 / all 全部(ADMIN) */
  scope: "mine" | "all"
  /** 是否展示「查看全部」开关(仅 ADMIN) */
  canSwitchScope: boolean
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [filter, setFilter] = useState<StatusFilter>("all")
  const [form, setForm] = useState<{ initial: ActivityFormInitial | null } | null>(null)
  const [cancelTarget, setCancelTarget] = useState<TeacherActivityItem | null>(null)
  const [pending, setPending] = useState(false)

  const filtered = filter === "all" ? items : items.filter((a) => a.status === filter)
  const counts = {
    all: items.length,
    active: items.filter((a) => a.status === "active").length,
    cancelled: items.filter((a) => a.status === "cancelled").length,
  }

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function confirmCancel() {
    if (!cancelTarget) return
    setPending(true)
    const res = await fetch(`/api/teacher/activities/${cancelTarget.id}`, {
      method: "DELETE",
    })
    const data = (await res.json().catch(() => null)) as IResponse<unknown> | null
    setPending(false)
    if (!res.ok) {
      // 失败时保留弹窗,让用户看到原因后重试
      toast.error(data?.message || "取消失败")
      return
    }
    setCancelTarget(null)
    toast.success("活动已取消")
    refresh()
  }

  return (
    <>
      {/* 顶部操作区:窄屏自动换行 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="-mx-4 max-w-full overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
            <TabsList className="w-max">
              <TabsTrigger value="all">全部 ({counts.all})</TabsTrigger>
              <TabsTrigger value="active">进行中 ({counts.active})</TabsTrigger>
              <TabsTrigger value="cancelled">已取消 ({counts.cancelled})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canSwitchScope ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  href={
                    scope === "all" ? "/teacher/activities" : "/teacher/activities?scope=all"
                  }
                />
              }
            >
              {scope === "all" ? "只看我的" : "查看全部"}
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setForm({ initial: null })}>
            <PlusIcon />
            发布活动
          </Button>
        </div>
      </div>

      {/* 桌面端:表格(≥768px) */}
      <div className="mt-4 hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>标题</TableHead>
              {scope === "all" ? <TableHead>发布者</TableHead> : null}
              <TableHead>状态</TableHead>
              <TableHead>开始时间</TableHead>
              <TableHead>报名截止</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="max-w-[260px] font-medium">
                  <span className="block truncate" title={a.title}>
                    {a.title}
                  </span>
                </TableCell>
                {scope === "all" ? (
                  <TableCell className="text-muted-foreground">{a.creatorName}</TableCell>
                ) : null}
                <TableCell>
                  <ActivityStatusBadge status={a.status} />
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDateTime(a.startTime)}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDateTime(a.registrationDeadline)}
                </TableCell>
                <TableCell>
                  <ActivityRowActions
                    item={a}
                    onEdit={() => setForm({ initial: toFormInitial(a) })}
                    onCancel={() => setCancelTarget(a)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={scope === "all" ? 6 : 5}
                  className="text-center text-muted-foreground"
                >
                  暂无数据
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>

      {/* 移动端:卡片列表(<768px) */}
      <div className="mt-4 space-y-3 md:hidden">
        {filtered.map((a) => (
          <div key={a.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={a.title}>
                  {a.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {scope === "all" ? `${a.creatorName} · ` : ""}
                  开始 {formatDateTime(a.startTime)}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  报名截止 {formatDateTime(a.registrationDeadline)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <ActivityStatusBadge status={a.status} />
                <ActivityRowActions
                  item={a}
                  onEdit={() => setForm({ initial: toFormInitial(a) })}
                  onCancel={() => setCancelTarget(a)}
                />
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">暂无数据</p>
        ) : null}
      </div>

      {form ? (
        <ActivityFormDialog
          initial={form.initial}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            toast.success(form.initial ? "活动已更新" : "活动已发布")
            refresh()
          }}
        />
      ) : null}

      {/* 取消确认(响应式:窄屏按钮整行堆叠) */}
      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>取消活动</DialogTitle>
            <DialogDescription>
              确定取消「{cancelTarget?.title}」?取消后活动不再对外展示,且无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelTarget(null)} disabled={pending}>
              再想想
            </Button>
            <Button variant="destructive" onClick={() => void confirmCancel()} disabled={pending}>
              {pending ? "处理中…" : "确认取消"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ActivityStatusBadge({ status }: { status: ActivityDTO["status"] }) {
  if (status === "active") return <Badge variant="default">进行中</Badge>
  return <Badge variant="secondary">已取消</Badge>
}

/** 行内操作(表格与卡片共用):编辑 / 取消活动 */
function ActivityRowActions({
  item,
  onEdit,
  onCancel,
}: {
  item: TeacherActivityItem
  onEdit: () => void
  onCancel: () => void
}) {
  if (!item.canManage) {
    return <span className="text-xs text-muted-foreground">无权限</span>
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="操作" />}
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <PencilIcon />
          编辑
        </DropdownMenuItem>
        {item.status === "active" ? (
          <DropdownMenuItem onClick={onCancel}>
            <BanIcon />
            取消活动
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
