"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EyeIcon,
  MoreHorizontalIcon,
  XIcon,
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
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
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
import { COURSE_REVIEW_NOTE_MAX } from "@/lib/form-limits"
import type { CourseDTO, IResponse } from "@/types/api"
import { CourseStatusBadge } from "@/app/teacher/courses/_components/courses-table"
import { CourseDetailDialog, type AdminCourseDetail } from "./course-detail-dialog"

/** 管理后台课程列表项 */
export type AdminCourseItem = CourseDTO & {
  creatorName: string
}

/** 状态筛选 Tab 值(已删除课程不出现在列表) */
type StatusFilter = "all" | "pending" | "active" | "offline" | "rejected"

type CourseAction = {
  status: "active" | "offline" | "rejected"
  reviewNote?: string
  successMessage: string
}

/** 时间展示:YYYY-MM-DD HH:mm(本地时区) */
function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * 课程管理表格(管理后台):状态 Tab / 桌面表格 + 移动卡片 / 通过 / 驳回 / 下线 / 恢复。
 * 所有状态流转统一走 `PATCH /api/admin/courses/:id`。
 */
export function AdminCoursesTable({ items }: { items: AdminCourseItem[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [filter, setFilter] = useState<StatusFilter>("all")
  const [detail, setDetail] = useState<AdminCourseDetail | null>(null)
  const [rejectTarget, setRejectTarget] = useState<AdminCourseItem | null>(null)
  const [reviewNote, setReviewNote] = useState("")
  const [busy, setBusy] = useState(false)

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

  async function applyAction(
    course: { id: string },
    { status, reviewNote: note, successMessage }: CourseAction
  ) {
    setBusy(true)
    const res = await fetch(`/api/admin/courses/${course.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, ...(note !== undefined ? { reviewNote: note } : {}) }),
    })
    const data = (await res.json().catch(() => null)) as IResponse<unknown> | null
    setBusy(false)
    if (!res.ok) {
      toast.error(data?.message || "操作失败")
      return false
    }
    toast.success(successMessage)
    refresh()
    return true
  }

  async function handleApprove(course: { id: string }) {
    const done = await applyAction(course, {
      status: "active",
      successMessage: "课程已通过并上线",
    })
    if (done) setDetail(null)
  }

  async function handleOffline(course: { id: string }) {
    const done = await applyAction(course, {
      status: "offline",
      successMessage: "课程已下线",
    })
    if (done) setDetail(null)
  }

  async function confirmReject() {
    if (!rejectTarget) return
    if (!reviewNote.trim()) {
      toast.error("请填写驳回原因")
      return
    }
    const done = await applyAction(rejectTarget, {
      status: "rejected",
      reviewNote: reviewNote.trim(),
      successMessage: "已驳回课程",
    })
    if (done) {
      setRejectTarget(null)
      setReviewNote("")
      setDetail(null)
    }
  }

  function toDetail(course: AdminCourseItem): AdminCourseDetail {
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      coverImages: course.coverImages,
      tags: course.tags,
      status: course.status,
      lessons: course.lessons,
      creatorName: course.creatorName,
      reviewNote: course.reviewNote,
      reviewedAt: course.reviewedAt,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
    }
  }

  return (
    <>
      {/* 状态筛选:窄屏可横滑 */}
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

      {/* 桌面端:表格(≥768px) */}
      <div className="mt-4 hidden rounded-lg border md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>标题</TableHead>
              <TableHead>创建者</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>课时数</TableHead>
              <TableHead>提交时间</TableHead>
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
                <TableCell className="text-muted-foreground">
                  {course.creatorName}
                </TableCell>
                <TableCell>
                  <CourseStatusBadge status={course.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {course.lessonCount}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground">
                  {formatDateTime(course.createdAt)}
                </TableCell>
                <TableCell>
                  <CourseRowActions
                    course={course}
                    busy={busy}
                    onView={() => setDetail(toDetail(course))}
                    onApprove={() => void handleApprove(course)}
                    onReject={() => {
                      setReviewNote(course.reviewNote ?? "")
                      setRejectTarget(course)
                    }}
                    onOffline={() => void handleOffline(course)}
                  />
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
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
                  {course.creatorName} · {course.lessonCount} 个课时 ·{" "}
                  {formatDateTime(course.createdAt)}
                </p>
              </div>
              <CourseStatusBadge status={course.status} />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDetail(toDetail(course))}
              >
                <EyeIcon />
                查看详情
              </Button>
              {course.status === "pending" || course.status === "rejected" ? (
                <>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleApprove(course)}
                  >
                    通过
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      setReviewNote(course.reviewNote ?? "")
                      setRejectTarget(course)
                    }}
                  >
                    驳回
                  </Button>
                </>
              ) : null}
              {course.status === "active" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void handleOffline(course)}
                >
                  <ArrowDownIcon />
                  下线
                </Button>
              ) : null}
              {course.status === "offline" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => void handleApprove(course)}
                >
                  <ArrowUpIcon />
                  恢复上线
                </Button>
              ) : null}
            </div>
          </div>
        ))}
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">暂无数据</p>
        ) : null}
      </div>

      {/* 审核详情 */}
      {detail ? (
        <CourseDetailDialog
          course={detail}
          busy={busy}
          onClose={() => setDetail(null)}
          onApprove={() => void handleApprove(items.find((c) => c.id === detail.id) ?? detail)}
          onReject={() => {
            const target = items.find((c) => c.id === detail.id)
            if (!target) return
            setReviewNote(target.reviewNote ?? "")
            setRejectTarget(target)
          }}
        />
      ) : null}

      {/* 驳回确认(响应式:窄屏按钮整行堆叠) */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => !open && setRejectTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>驳回课程</DialogTitle>
            <DialogDescription>
              填写驳回原因，创建者在教师后台可以看到并据此修改。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="course-review-note">驳回原因</Label>
            <textarea
              id="course-review-note"
              className="min-h-24 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:text-sm dark:bg-input/30"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="如：视频不清晰 / 课时内容与标题不符"
              maxLength={COURSE_REVIEW_NOTE_MAX}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectTarget(null)} disabled={busy}>
              取消
            </Button>
            <Button variant="destructive" onClick={() => void confirmReject()} disabled={busy}>
              {busy ? "处理中…" : "确认驳回"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** 行内操作(桌面表格):查看详情 + 按状态给出可执行项 */
function CourseRowActions({
  course,
  busy,
  onView,
  onApprove,
  onReject,
  onOffline,
}: {
  course: AdminCourseItem
  busy: boolean
  onView: () => void
  onApprove: () => void
  onReject: () => void
  onOffline: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label="操作" />}
      >
        <MoreHorizontalIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onView}>
          <EyeIcon />
          查看详情
        </DropdownMenuItem>
        {course.status === "pending" || course.status === "rejected" ? (
          <>
            <DropdownMenuItem onClick={onApprove} disabled={busy}>
              <ArrowUpIcon />
              通过
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onReject} disabled={busy} className="text-destructive">
              <XIcon />
              驳回
            </DropdownMenuItem>
          </>
        ) : null}
        {course.status === "active" ? (
          <DropdownMenuItem onClick={onOffline} disabled={busy}>
            <ArrowDownIcon />
            下线
          </DropdownMenuItem>
        ) : null}
        {course.status === "offline" ? (
          <DropdownMenuItem onClick={onApprove} disabled={busy}>
            <ArrowUpIcon />
            恢复上线
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
