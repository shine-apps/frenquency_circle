"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  PowerOffIcon,
  RotateCcwIcon,
} from "lucide-react"
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { circleStatusBadgeVariant, circleStatusLabel } from "@/lib/circle-status"
import type { CircleDTO, IResponse } from "@/types/api"
import { CircleFormDialog, type CircleFormInitial } from "./circle-form-dialog"

/** 教师后台圈子列表项 */
export type TeacherCircleItem = CircleDTO & {
  creatorName: string
  /** 圈子标签(后台表单需要,C 端 CircleDTO 不含) */
  tags: string[]
  /** 当前登录用户是否可编辑(创建者本人或 ADMIN) */
  canManage: boolean
}

/** 状态筛选 Tab 值 */
type StatusFilter = "all" | "pending" | "active" | "offline" | "rejected" | "violated"

/** 老师可自主切换的状态 */
type OwnerStatus = "active" | "offline"

/** 表单初始值:新建为 null,编辑为当前圈子 */
function toFormInitial(item: TeacherCircleItem): CircleFormInitial {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    tags: item.tags,
    address: item.address,
    latitude: item.latitude,
    longitude: item.longitude,
    contactPhone: item.contactPhone,
    wechat: item.wechat,
    activityTime: item.activityTime,
    maxMembers: item.maxMembers,
    coverImages: item.coverImages,
  }
}

export function TeacherCirclesTable({
  items,
  scope,
  canSwitchScope,
  availableTags,
}: {
  items: TeacherCircleItem[]
  /** 当前数据范围:mine 仅自己 / all 全部(ADMIN) */
  scope: "mine" | "all"
  /** 是否展示「查看全部」开关(仅 ADMIN) */
  canSwitchScope: boolean
  /** 可选标签(SSR 传入的已审核标签) */
  availableTags: string[]
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [filter, setFilter] = useState<StatusFilter>("all")
  /** null = 关闭;{ initial: null } = 新建 */
  const [form, setForm] = useState<{ initial: CircleFormInitial | null } | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const filtered = filter === "all" ? items : items.filter((c) => c.status === filter)
  const counts = {
    all: items.length,
    pending: items.filter((c) => c.status === "pending").length,
    active: items.filter((c) => c.status === "active").length,
    offline: items.filter((c) => c.status === "offline").length,
    rejected: items.filter((c) => c.status === "rejected").length,
    violated: items.filter((c) => c.status === "violated").length,
  }

  function refresh() {
    startTransition(() => router.refresh())
  }

  async function changeStatus(circleId: string, status: OwnerStatus) {
    setPendingId(circleId)
    const res = await fetch(`/api/teacher/circles/${circleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    const data = (await res.json().catch(() => null)) as IResponse<unknown> | null
    setPendingId(null)
    if (!res.ok) {
      toast.error(data?.message || "操作失败")
      return
    }
    toast.success(status === "offline" ? "圈子已下线" : "圈子已上线")
    refresh()
  }

  return (
    <>
      {/* 顶部操作区:窄屏自动换行,不产生横向溢出 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="-mx-4 max-w-full overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as StatusFilter)}>
            <TabsList className="w-max">
              <TabsTrigger value="all">全部 ({counts.all})</TabsTrigger>
              <TabsTrigger value="pending">待审核 ({counts.pending})</TabsTrigger>
              {/* 文案与 Badge(lib/circle-status)保持一致,避免同一状态两种叫法 */}
              <TabsTrigger value="active">活跃 ({counts.active})</TabsTrigger>
              <TabsTrigger value="offline">已下线 ({counts.offline})</TabsTrigger>
              <TabsTrigger value="rejected">未通过 ({counts.rejected})</TabsTrigger>
              <TabsTrigger value="violated">违规 ({counts.violated})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canSwitchScope ? (
            <Button
              variant="outline"
              size="sm"
              render={
                <Link href={scope === "all" ? "/teacher/circles" : "/teacher/circles?scope=all"} />
              }
            >
              {scope === "all" ? "只看我的" : "查看全部"}
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setForm({ initial: null })}>
            <PlusIcon />
            新建圈子
          </Button>
        </div>
      </div>

      {/* 桌面端:表格(≥768px) */}
      <div className="mt-4 hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              {scope === "all" ? <TableHead>创建者</TableHead> : null}
              <TableHead>状态</TableHead>
              <TableHead>成员</TableHead>
              <TableHead>活动时间</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="max-w-[280px] font-medium">
                  <span className="block truncate" title={c.title}>
                    {c.title}
                  </span>
                </TableCell>
                {scope === "all" ? (
                  <TableCell className="text-muted-foreground">{c.creatorName}</TableCell>
                ) : null}
                <TableCell>
                  <Badge variant={circleStatusBadgeVariant(c.status)}>
                    {circleStatusLabel(c.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.memberCount}
                  {c.maxMembers ? ` / ${c.maxMembers}` : ""}
                </TableCell>
                <TableCell className="max-w-[200px] text-muted-foreground">
                  <span className="block truncate" title={c.activityTime ?? ""}>
                    {c.activityTime ?? "-"}
                  </span>
                </TableCell>
                <TableCell>
                  <CircleRowActions
                    item={c}
                    pending={pendingId === c.id}
                    onEdit={() => setForm({ initial: toFormInitial(c) })}
                    onChangeStatus={changeStatus}
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
        {filtered.map((c) => (
          <div key={c.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={c.title}>
                  {c.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {scope === "all" ? `${c.creatorName} · ` : ""}
                  成员 {c.memberCount}
                  {c.maxMembers ? ` / ${c.maxMembers}` : ""}
                </p>
                {c.activityTime ? (
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {c.activityTime}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Badge variant={circleStatusBadgeVariant(c.status)}>
                  {circleStatusLabel(c.status)}
                </Badge>
                <CircleRowActions
                  item={c}
                  pending={pendingId === c.id}
                  onEdit={() => setForm({ initial: toFormInitial(c) })}
                  onChangeStatus={changeStatus}
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
        <CircleFormDialog
          initial={form.initial}
          availableTags={availableTags}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            toast.success(form.initial ? "圈子已更新" : "已提交审核")
            refresh()
          }}
        />
      ) : null}
    </>
  )
}

/** 行内操作(表格与卡片共用):编辑 / 上线 / 下线 */
function CircleRowActions({
  item,
  pending,
  onEdit,
  onChangeStatus,
}: {
  item: TeacherCircleItem
  pending: boolean
  onEdit: () => void
  onChangeStatus: (circleId: string, status: OwnerStatus) => void
}) {
  if (!item.canManage) {
    return <span className="text-xs text-muted-foreground">无权限</span>
  }
  // pending / rejected / violated / deleted 不可自主上下线,仅展示编辑入口
  const canToggleStatus = item.status === "active" || item.status === "offline"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="操作" />}
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit} disabled={pending}>
          <PencilIcon />
          编辑
        </DropdownMenuItem>
        {canToggleStatus && item.status === "active" ? (
          <DropdownMenuItem
            onClick={() => onChangeStatus(item.id, "offline")}
            disabled={pending}
          >
            <PowerOffIcon />
            下线
          </DropdownMenuItem>
        ) : null}
        {canToggleStatus && item.status === "offline" ? (
          <DropdownMenuItem
            onClick={() => onChangeStatus(item.id, "active")}
            disabled={pending}
          >
            <RotateCcwIcon />
            上线
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
