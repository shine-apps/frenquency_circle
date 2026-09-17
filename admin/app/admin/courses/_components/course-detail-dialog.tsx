"use client"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { CourseStatusBadge } from "@/app/teacher/courses/_components/courses-table"

/** 与教师端列表项同构(无 canManage 概念) */
export type AdminCourseDetail = {
  id: string
  title: string
  description: string
  coverImages: string[]
  tags: string[]
  status: "pending" | "active" | "offline" | "rejected" | "deleted"
  lessons: {
    id: string
    title: string
    description: string
    videoUrl: string
    durationSeconds: number | null
    sortOrder: number
  }[]
  creatorName: string
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

/** 时间展示:YYYY-MM-DD HH:mm(本地时区) */
function formatDateTime(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 秒 → 「x 分 y 秒」 */
function formatDuration(seconds: number | null): string {
  if (seconds === null) return "时长未知"
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`
}

/**
 * 课程审核详情弹窗(管理后台)。
 *
 * 审核前必须能看到内容:展示课程全部字段,课时视频可直接播放。
 */
export function CourseDetailDialog({
  course,
  onClose,
  onApprove,
  onReject,
  busy,
}: {
  course: AdminCourseDetail
  onClose: () => void
  onApprove: () => void
  onReject: () => void
  busy: boolean
}) {
  const canDecide = course.status === "pending" || course.status === "rejected"

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">{course.title}</span>
            <CourseStatusBadge status={course.status} />
          </DialogTitle>
          <DialogDescription>
            创建者 {course.creatorName} · 提交于 {formatDateTime(course.createdAt)}
            {course.reviewedAt ? ` · 审核于 ${formatDateTime(course.reviewedAt)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {course.reviewNote ? (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              审核备注：{course.reviewNote}
            </div>
          ) : null}

          {course.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {course.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}

          <div>
            <p className="mb-1 text-sm font-medium">课程简介</p>
            <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border p-3 text-sm text-muted-foreground">
              {course.description}
            </p>
          </div>

          {course.coverImages.length > 0 ? (
            <div>
              <p className="mb-1 text-sm font-medium">封面图</p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {course.coverImages.map((url, index) => (
                  // 图片为 COS 公网 URL,直接用原生 img 即可
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${url}-${index}`}
                    src={url}
                    alt={`封面图 ${index + 1}`}
                    className="h-20 w-full rounded-lg border object-cover"
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium">课时内容（{course.lessons.length}）</p>
            <div className="space-y-3">
              {course.lessons.map((lesson) => (
                <div key={lesson.id} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium">
                      课时 {lesson.sortOrder + 1}：{lesson.title}
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDuration(lesson.durationSeconds)}
                    </span>
                  </div>
                  {lesson.description ? (
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {lesson.description}
                    </p>
                  ) : null}
                  <video
                    controls
                    preload="metadata"
                    src={lesson.videoUrl}
                    className="w-full rounded-lg border"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          {canDecide ? (
            <>
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                关闭
              </Button>
              <Button variant="outline" onClick={onReject} disabled={busy}>
                驳回
              </Button>
              <Button onClick={onApprove} disabled={busy}>
                {busy ? "处理中…" : "通过"}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose} disabled={busy}>
              关闭
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
