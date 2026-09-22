"use client"

import { useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CoverImagesField } from "@/components/cover-images-field"
import { InterestTagsField } from "@/components/interest-tags-field"
import { LessonEditor, type LessonDraft } from "./lesson-editor"
import {
  COURSE_DESCRIPTION_MAX,
  COURSE_LESSONS_MAX,
  COURSE_TAGS_MAX,
  COURSE_TITLE_MAX,
  LESSON_DESCRIPTION_MAX,
  LESSON_TITLE_MAX,
} from "@/lib/form-limits"
import type { CourseLessonDTO, CourseStatus, IResponse } from "@/types/api"

/** 课程表单初始值(新建时为 null) */
export type CourseFormInitial = {
  id: string
  title: string
  description: string
  coverImages: string[]
  tags: string[]
  status: CourseStatus
  lessons: CourseLessonDTO[]
  /** 驳回原因(仅 rejected 状态展示) */
  reviewNote: string | null
}

/** 与 shadcn Input 视觉一致的多行输入 */
const TEXTAREA_CLASS =
  "min-h-32 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:text-sm dark:bg-input/30"

/** LessonDraft → 请求体课时(不含 sortOrder,由后端按顺序派生) */
function toLessonPayload(lessons: LessonDraft[]) {
  return lessons.map((lesson) => ({
    title: lesson.title.trim(),
    description: lesson.description.trim(),
    videoUrl: lesson.videoUrl,
    durationSeconds: lesson.durationSeconds,
  }))
}

/**
 * 课程新建 / 编辑表单弹窗(教师后台)。
 *
 * - 新建 → `POST /api/teacher/courses`(落 pending,待管理员审核)
 * - 编辑 → `PATCH /api/teacher/courses/:courseId`(lessons 全量替换)
 *
 * 兴趣标签为多选(仅可从已审核通过的标签库中挑选),与圈子表单口径一致。
 * 课时**可为空**:支持先建课、后补课时,新建时默认不预置空白课时。
 *
 * 响应式:弹窗限高可滚动,字段窄屏单列、≥640px 双列,长字段通栏。
 */
export function CourseFormDialog({
  initial,
  availableTags,
  onClose,
  onSaved,
}: {
  initial: CourseFormInitial | null
  /** 已通过审核的标签名称(SSR 传入,用于多选) */
  availableTags: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = initial !== null

  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [coverImages, setCoverImages] = useState<string[]>(initial?.coverImages ?? [])
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  // 新建时不给空白课时(课时可后补);编辑态直接铺开已有课时
  const [lessons, setLessons] = useState<LessonDraft[]>(
    initial?.lessons.map((lesson) => ({
      title: lesson.title,
      description: lesson.description,
      videoUrl: lesson.videoUrl,
      durationSeconds: lesson.durationSeconds,
    })) ?? []
  )

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** 客户端必填校验:把后端 zod 的英文 "Invalid request body" 变成可读的中文提示 */
  function validate(): string | null {
    if (!title.trim()) return "课程标题不能为空"
    if (title.trim().length < 2) return "课程标题至少 2 字"
    if (title.trim().length > COURSE_TITLE_MAX) return `课程标题过长（最多 ${COURSE_TITLE_MAX} 字）`
    if (!description.trim()) return "课程简介不能为空"
    if (description.trim().length < 10) return "课程简介至少 10 字"
    if (description.trim().length > COURSE_DESCRIPTION_MAX) {
      return `课程简介过长（最多 ${COURSE_DESCRIPTION_MAX} 字）`
    }
    // 课时可为空(先建课、后补课时),仅在填写了课时时逐条校验
    if (lessons.length > COURSE_LESSONS_MAX) return `课时最多 ${COURSE_LESSONS_MAX} 个`
    for (let i = 0; i < lessons.length; i += 1) {
      const lesson = lessons[i]
      if (!lesson.title.trim()) return `第 ${i + 1} 个课时的标题不能为空`
      if (lesson.title.trim().length > LESSON_TITLE_MAX) {
        return `第 ${i + 1} 个课时的标题过长`
      }
      if (lesson.description.length > LESSON_DESCRIPTION_MAX) {
        return `第 ${i + 1} 个课时的简介过长`
      }
      if (!lesson.videoUrl) return `请为第 ${i + 1} 个课时上传视频`
    }
    // 标签选填,但数量不得超上限(toggleTag 已拦截,此处兜底)
    if (tags.length > COURSE_TAGS_MAX) return `兴趣标签最多 ${COURSE_TAGS_MAX} 个`
    return null
  }

  async function handleSubmit() {
    const invalid = validate()
    if (invalid) {
      setError(invalid)
      return
    }
    setBusy(true)
    setError(null)

    const payload = {
      title: title.trim(),
      description: description.trim(),
      coverImages,
      tags,
      lessons: toLessonPayload(lessons),
    }

    const res = await fetch(
      isEdit ? `/api/teacher/courses/${initial.id}` : "/api/teacher/courses",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    const data = (await res.json().catch(() => null)) as IResponse<unknown> | null
    setBusy(false)

    if (!res.ok) {
      setError(data?.message || "保存失败")
      return
    }
    onSaved()
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑课程" : "新建课程"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? initial?.status === "rejected"
                ? "课程曾被驳回，修改后需管理员重新审核"
                : "修改后的课程信息立即生效"
              : "课程创建后进入待审核状态，管理员审核通过后对外展示"}
          </DialogDescription>
        </DialogHeader>

        {isEdit && initial?.status === "rejected" && initial.reviewNote ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
            驳回原因：{initial.reviewNote}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="course-title">课程标题</Label>
            <Input
              id="course-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：太极拳入门十二讲"
              maxLength={COURSE_TITLE_MAX}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="course-description">课程简介</Label>
            <textarea
              id="course-description"
              className={TEXTAREA_CLASS}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="介绍课程内容、适合人群、学习收获等（至少 10 字）"
            />
          </div>

          {/* 兴趣标签多选(公共字段组件:只能从已审核通过的标签库中挑选) */}
          <InterestTagsField
            value={tags}
            onChange={setTags}
            availableTags={availableTags}
            max={COURSE_TAGS_MAX}
          />

          <CoverImagesField
            value={coverImages}
            onChange={setCoverImages}
            label="课程封面"
          />

          <LessonEditor lessons={lessons} onChange={setLessons} />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? "保存中…" : isEdit ? "保存修改" : "提交审核"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
