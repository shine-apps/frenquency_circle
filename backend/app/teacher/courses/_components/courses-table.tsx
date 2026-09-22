"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
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
import type { CourseDTO, CourseStatus, IResponse } from "@/types/api"
import { CourseFormDialog, type CourseFormInitial } from "./course-form-dialog"

/** 教师后台课程列表项 */
export type TeacherCourseItem = CourseDTO & {
  creatorName: string
  /** 当前登录用户是否可操作(创建者本人或 ADMIN) */
  canManage: boolean
}

/** 状态筛选 Tab 值(已删除课程不出现在列表,无对应 Tab) */
type StatusFilter = "all" | "pending" | "active" | "offline" | "rejected"

/** 时间展示:YYYY-MM-DD HH:mm(本地时区) */
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function toFormInitial(item: TeacherCourseItem): CourseFormInitial {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    coverImages: item.coverImages,
    tags: item.tags,
    status: item.status,
    lessons: item.lessons,
    reviewNote: item.reviewNote,
  }
}

export function TeacherCoursesTable({
  items,
  scope,
  canSwitchScope,
  availableTags,
}: {
  items: TeacherCourseItem[]
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
  const [form, setForm] = useState<{ initial: CourseFormInitial | null } | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<TeacherCourseItem | null>(null)
  const [pending, setPending] = useState(false)

  const filtered = filter === "all" ? items : items.filter((c) => c.status === filter)
  const counts = {
    all: items.length,
    pending: items.filter((c) => c.status === "pending").length,
    active: items.filter((c) => c.status === "active").length,
    offline: items.filter((c) => c.status === "offline").length,
    rejected: items.filter((c) => c.status === "rejected").length,
  }

  function refresh() {
    startTransition(() => router.refresh())
  }

  /** 上线 / 下线(教师仅允许 active ⇄ offline,后端另有守卫) */
  async function updateStatus(item: TeacherCourseItem, status: "active" | "offline") {
    setPending(true)
    const res = await fetch(`/api/teacher/courses/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    const data = (await res.json().catch(() => null)) as IResponse<unknown> | null
    setPending(false)
    if (!res.ok) {
      toast.error(data?.message || "操作失败")
      return
    }
    toast.success(status === "active" ? "课程已上线" : "课程已下线")
    refresh()
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    setPending(true)
    const res = await fetch(`/api/teacher/courses/${deleteTarget.id}`, {
      method: "DELETE",
    })
    const data = (await res.json().catch(() => null)) as IResponse<unknown> | null
    setPending(false)
    if (!res.ok) {
      // 失败时保留弹窗,让用户看到原因后重试
      toast.error(data?.message || "删除失败")
      return
    }
    setDeleteTarget(null)
    toast.success("课程已删除")
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
              <TabsTrigger value="pending">待审核 ({counts.pending})</TabsTrigger>
              <TabsTrigger value="active">已上线 ({counts.active})</TabsTrigger>
              <TabsTrigger value="offline">已下线 ({counts.offline})</TabsTrigger>
              <TabsTrigger value="rejected">已驳回 ({counts.rejected})</TabsTrigger>
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
                  href={scope === "all" ? "/teacher/courses" : "/teacher/courses?scope=all"}
                />
              }
            >
              {scope === "all" ? "只看我的" : "查看全部"}
            </Button>
          ) : null}
          <Button size="sm" onClick={() => setForm({ initial: null })}>
            <PlusIcon />
            新建课程
          </Button>
        </div>
      </div>

      {/* 桌面端:表格(≥768px) */}
      <div className="mt-4 hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>标题</TableHead>
              {scope === "all" ? <TableHead>创建者</TableHead> : null}
              <TableHead>状态</TableHead>
              <TableHead>课时数</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((course) => (
              <TableRow key={course.id}>
                <TableCell className="max-w-[260px] font-medium">
                  <span className="block truncate" title={course.title}>
                    {course.title}
                  </span>
                </TableCell>
                {scope === "all" ? (
                  <TableCell className="text-muted-foreground">
                    {course.creatorName}
                  </TableCell>
                ) : null}
                <TableCell>
                  <CourseStatusBadge status={course.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {course.lessonCount}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDateTime(course.updatedAt)}
                </TableCell>
                <TableCell>
                  <CourseRowActions
                    item={course}
                    onEdit={() => setForm({ initial: toFormInitial(course) })}
                    onToggle={(status) => void updateStatus(course, status)}
                    onDelete={() => setDeleteTarget(course)}
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
        {filtered.map((course) => (
          <div key={course.id} className="rounded-lg border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium" title={course.title}>
                  {course.title}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {scope === "all" ? `${course.creatorName} · ` : ""}
                  {course.lessonCount} 个课时 · 更新 {formatDateTime(course.updatedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <CourseStatusBadge status={course.status} />
                <CourseRowActions
                  item={course}
                  onEdit={() => setForm({ initial: toFormInitial(course) })}
                  onToggle={(status) => void updateStatus(course, status)}
                  onDelete={() => setDeleteTarget(course)}
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
        <CourseFormDialog
          initial={form.initial}
          availableTags={availableTags}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            toast.success(form.initial ? "课程已更新" : "课程已提交审核")
            refresh()
          }}
        />
      ) : null}

      {/* 删除确认(响应式:窄屏按钮整行堆叠) */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除课程</DialogTitle>
            <DialogDescription>
              确定删除「{deleteTarget?.title}」？删除后课程不再对外展示，且无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={pending}>
              再想想
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={pending}
            >
              {pending ? "处理中…" : "确认删除"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** 状态徽标(pending / active / offline / rejected / deleted) */
export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  if (status === "active") return <Badge variant="default">已上线</Badge>
  if (status === "pending") return <Badge variant="secondary">待审核</Badge>
  if (status === "rejected") return <Badge variant="destructive">已驳回</Badge>
  if (status === "deleted") return <Badge variant="secondary">已删除</Badge>
  return <Badge variant="outline">已下线</Badge>
}

/** 行内操作(表格与卡片共用):编辑 / 上线 / 下线 / 删除 */
function CourseRowActions({
  item,
  onEdit,
  onToggle,
  onDelete,
}: {
  item: TeacherCourseItem
  onEdit: () => void
  onToggle: (status: "active" | "offline") => void
  onDelete: () => void
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
        {item.status === "offline" ? (
          <DropdownMenuItem onClick={() => onToggle("active")}>
            <ArrowUpIcon />
            上线
          </DropdownMenuItem>
        ) : null}
        {item.status === "active" ? (
          <DropdownMenuItem onClick={() => onToggle("offline")}>
            <ArrowDownIcon />
            下线
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={onDelete} className="text-destructive">
          <Trash2Icon />
          删除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
