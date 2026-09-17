"use client"

import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CosVideoField } from "@/components/cos-video-field"
import {
  COURSE_LESSONS_MAX,
  LESSON_DESCRIPTION_MAX,
  LESSON_TITLE_MAX,
} from "@/lib/form-limits"

/** 课时草稿(表单本地状态;顺序即数组顺序,提交时派生 sortOrder) */
export type LessonDraft = {
  title: string
  description: string
  videoUrl: string
  durationSeconds: number | null
}

/**
 * 课时编辑器:课时的增 / 删 / 上移下移 + 标题 / 简介 / 视频上传。
 *
 * 窄屏单列排布,视频预览宽度自适应,无横向滚动。
 */
export function LessonEditor({
  lessons,
  onChange,
}: {
  lessons: LessonDraft[]
  onChange: (next: LessonDraft[]) => void
}) {
  function update(index: number, patch: Partial<LessonDraft>) {
    onChange(lessons.map((lesson, i) => (i === index ? { ...lesson, ...patch } : lesson)))
  }

  function remove(index: number) {
    onChange(lessons.filter((_, i) => i !== index))
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= lessons.length) return
    const next = [...lessons]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  function add() {
    if (lessons.length >= COURSE_LESSONS_MAX) return
    onChange([
      ...lessons,
      { title: "", description: "", videoUrl: "", durationSeconds: null },
    ])
  }

  return (
    <div className="space-y-3 sm:col-span-2">
      <div className="flex items-center justify-between gap-2">
        <Label>
          课时（{lessons.length}/{COURSE_LESSONS_MAX}）
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={lessons.length >= COURSE_LESSONS_MAX}
        >
          <PlusIcon />
          添加课时
        </Button>
      </div>

      {lessons.map((lesson, index) => (
        <div key={index} className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">课时 {index + 1}</span>
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="上移"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="下移"
                disabled={index === lessons.length - 1}
                onClick={() => move(index, 1)}
              >
                <ArrowDownIcon />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-destructive"
                aria-label="删除课时"
                disabled={lessons.length <= 1}
                onClick={() => remove(index)}
              >
                <Trash2Icon />
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`lesson-title-${index}`}>课时标题</Label>
            <Input
              id={`lesson-title-${index}`}
              value={lesson.title}
              onChange={(e) => update(index, { title: e.target.value })}
              placeholder={`如：第 ${index + 1} 课 站桩`}
              maxLength={LESSON_TITLE_MAX}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`lesson-description-${index}`}>课时简介（选填）</Label>
            <textarea
              id={`lesson-description-${index}`}
              className="min-h-16 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:text-sm dark:bg-input/30"
              value={lesson.description}
              onChange={(e) => update(index, { description: e.target.value })}
              placeholder="介绍本课时要点"
              maxLength={LESSON_DESCRIPTION_MAX}
            />
          </div>

          <CosVideoField
            value={lesson.videoUrl ? { videoUrl: lesson.videoUrl, durationSeconds: lesson.durationSeconds } : null}
            onChange={(next) =>
              update(index, {
                videoUrl: next?.videoUrl ?? "",
                durationSeconds: next?.durationSeconds ?? null,
              })
            }
          />
        </div>
      ))}

      {lessons.length === 0 ? (
        <p className="text-xs text-muted-foreground">尚未添加课时，点击「添加课时」开始</p>
      ) : null}
    </div>
  )
}
