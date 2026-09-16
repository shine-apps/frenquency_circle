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
import type { IResponse } from "@/types/api"

/** 活动表单初始值(新建时为 null) */
export type ActivityFormInitial = {
  id: string
  title: string
  description: string
  startTime: string
  registrationDeadline: string
  contactPhone: string | null
  coverImages: string[]
}

/** 与 shadcn Input 视觉一致的多行输入 */
const TEXTAREA_CLASS =
  "min-h-32 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:text-sm dark:bg-input/30"

/**
 * ISO 字符串 → `<input type="datetime-local" step="1">` 需要的本地时间字符串。
 *
 * 保留到秒:否则「只改标题」的编辑也会把秒/毫秒截断回写,造成无意义的数据变更。
 */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/** `<input type="datetime-local">` 的本地时间字符串 → ISO 字符串 */
function toIso(localValue: string): string | null {
  if (!localValue) return null
  const d = new Date(localValue)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/**
 * 活动新建 / 编辑表单弹窗(教师后台)。
 *
 * - 新建 → `POST /api/teacher/activities`
 * - 编辑 → `PATCH /api/teacher/activities/:activityId`
 *
 * 响应式:弹窗限高可滚动,字段窄屏单列、≥640px 双列,长字段通栏。
 */
export function ActivityFormDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: ActivityFormInitial | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = initial !== null

  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [startTime, setStartTime] = useState(
    initial ? toLocalInput(initial.startTime) : ""
  )
  const [deadline, setDeadline] = useState(
    initial ? toLocalInput(initial.registrationDeadline) : ""
  )
  const [contactPhone, setContactPhone] = useState(initial?.contactPhone ?? "")
  const [coverImages, setCoverImages] = useState<string[]>(initial?.coverImages ?? [])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** 客户端必填校验:把后端 zod 的英文 "Invalid request body" 变成可读的中文提示 */
  function validate(): { startIso: string; deadlineIso: string } | string {
    if (!title.trim()) return "活动标题不能为空"
    if (title.trim().length > 100) return "活动标题过长（最多 100 字）"
    if (!description.trim()) return "活动介绍不能为空"
    const startIso = toIso(startTime)
    const deadlineIso = toIso(deadline)
    if (!startIso || !deadlineIso) return "请填写活动开始时间与报名截止时间"
    if (Date.parse(deadlineIso) >= Date.parse(startIso)) {
      return "报名截止时间必须早于活动开始时间"
    }
    return { startIso, deadlineIso }
  }

  async function handleSubmit() {
    const checked = validate()
    if (typeof checked === "string") {
      setError(checked)
      return
    }
    setBusy(true)
    setError(null)

    const payload = {
      title: title.trim(),
      description: description.trim(),
      startTime: checked.startIso,
      registrationDeadline: checked.deadlineIso,
      // "" 表示清空联系方式
      contactPhone: contactPhone.trim(),
      coverImages,
    }

    const res = await fetch(
      isEdit ? `/api/teacher/activities/${initial.id}` : "/api/teacher/activities",
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
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "编辑活动" : "发布活动"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "修改后的活动信息会立即生效" : "活动发布后立即对外展示，可随时取消"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="activity-title">活动标题</Label>
            <Input
              id="activity-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：社区太极展演"
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="activity-description">活动介绍</Label>
            <textarea
              id="activity-description"
              className={TEXTAREA_CLASS}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="介绍活动内容、流程、注意事项等"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="activity-start">活动开始时间</Label>
            <Input
              id="activity-start"
              type="datetime-local"
              step="1"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="activity-deadline">报名截止时间</Label>
            <Input
              id="activity-deadline"
              type="datetime-local"
              step="1"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="activity-phone">联系电话</Label>
            <Input
              id="activity-phone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="选填，手机号或固话；留空表示不展示联系方式"
              inputMode="tel"
            />
          </div>

          <CoverImagesField
            value={coverImages}
            onChange={setCoverImages}
            label="活动图片"
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? "保存中…" : isEdit ? "保存修改" : "发布活动"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
