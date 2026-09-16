"use client"

import { useState } from "react"
import { Trash2Icon } from "lucide-react"

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
import { LocationPicker, type LocationValue } from "@/components/location-picker"
import { CIRCLE_TAGS_MAX } from "@/lib/form-limits"
import type { IResponse } from "@/types/api"

/** 表单初始值(新建时为 null) */
export type CircleFormInitial = {
  id: string
  title: string
  description: string
  tags: string[]
  address: string
  latitude: number
  longitude: number
  contactPhone: string | null
  wechat: string | null
  activityTime: string | null
  maxMembers: number | null
  coverImages: string[]
}

/** 与 shadcn Input 视觉一致的多行输入(项目暂未引入 textarea 组件) */
const TEXTAREA_CLASS =
  "min-h-24 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 md:text-sm dark:bg-input/30"

/**
 * 圈子新建 / 编辑表单弹窗(教师后台)。
 *
 * - 新建 → `POST /api/teacher/circles`(落 pending,等管理员审核)
 * - 编辑 → `PATCH /api/teacher/circles/:circleId`
 *
 * 提交语义为**全量**:编辑态把联系方式 / 活动时间 / 人数上限一并提交,
 * 空值表示清空(后端把 `""` / `null` 写成 NULL),因此用户删空输入框能真正生效。
 *
 * 响应式:弹窗限高 `calc(100dvh - 2rem)` 并可滚动,字段栅格窄屏单列、
 * ≥640px 双列,长字段通栏;地图选点与图片预览也各自做了窄屏适配。
 */
export function CircleFormDialog({
  initial,
  availableTags,
  onClose,
  onSaved,
}: {
  initial: CircleFormInitial | null
  /** 已通过审核的标签名称(SSR 传入,用于多选) */
  availableTags: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = initial !== null

  const [title, setTitle] = useState(initial?.title ?? "")
  const [description, setDescription] = useState(initial?.description ?? "")
  const [tags, setTags] = useState<string[]>(initial?.tags ?? [])
  const [tagFilter, setTagFilter] = useState("")
  const [pick, setPick] = useState<LocationValue | null>(
    initial
      ? {
          latitude: initial.latitude,
          longitude: initial.longitude,
          address: initial.address,
        }
      : null
  )
  const [contactPhone, setContactPhone] = useState(initial?.contactPhone ?? "")
  const [wechat, setWechat] = useState(initial?.wechat ?? "")
  const [activityTime, setActivityTime] = useState(initial?.activityTime ?? "")
  const [maxMembers, setMaxMembers] = useState(
    initial?.maxMembers != null ? String(initial.maxMembers) : ""
  )
  const [coverImages, setCoverImages] = useState<string[]>(initial?.coverImages ?? [])

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredTags = availableTags
    .filter((name) => !tags.includes(name))
    .filter((name) => (tagFilter.trim() ? name.includes(tagFilter.trim()) : false))
    .slice(0, 40)

  function toggleTag(name: string) {
    setTags((prev) =>
      prev.includes(name)
        ? prev.filter((t) => t !== name)
        : prev.length >= CIRCLE_TAGS_MAX
          ? prev
          : [...prev, name]
    )
  }

  /** 客户端必填校验:把后端 zod 的英文 "Invalid request body" 变成可读的中文提示 */
  function validate(): string | null {
    if (title.trim().length < 2 || title.trim().length > 50) {
      return "圈子名称需要 2-50 个字符"
    }
    const desc = description.trim()
    if (desc.length < 10 || desc.length > 1000) {
      return "圈子介绍需要 10-1000 个字符"
    }
    if (tags.length < 1) return "请至少选择 1 个兴趣标签"
    if (tags.length > CIRCLE_TAGS_MAX) return `标签最多 ${CIRCLE_TAGS_MAX} 个`
    if (!contactPhone.trim() && !wechat.trim()) {
      return "电话与微信号至少填写一个"
    }
    if (!pick) return "请在地图上确认圈子所在地点"
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

    // 全量提交:空串 / null 表示清空对应字段
    const payload = {
      title: title.trim(),
      description: description.trim(),
      tags,
      address: pick!.address,
      latitude: pick!.latitude,
      longitude: pick!.longitude,
      contactPhone: contactPhone.trim(),
      wechat: wechat.trim(),
      activityTime: activityTime.trim(),
      maxMembers: maxMembers.trim() ? Number(maxMembers) : null,
      coverImages,
    }

    const res = await fetch(
      isEdit ? `/api/teacher/circles/${initial.id}` : "/api/teacher/circles",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    )
    const data = (await res.json().catch(() => null)) as IResponse<unknown> | null
    setBusy(false)

    if (!res.ok) {
      const details = data?.details as { missingTags?: string[] } | undefined
      setError(
        details?.missingTags?.length
          ? `${data?.message}:${details.missingTags.join("、")}`
          : data?.message || "保存失败"
      )
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
          <DialogTitle>{isEdit ? "编辑圈子" : "新建圈子"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "修改后的圈子信息会立即生效"
              : "新建圈子提交后需要管理员审核，审核通过后对外展示"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="circle-title">圈子名称</Label>
            <Input
              id="circle-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="如：陈氏太极拳晨练班"
              maxLength={50}
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="circle-description">圈子介绍</Label>
            <textarea
              id="circle-description"
              className={TEXTAREA_CLASS}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="10-1000 字，介绍练习内容、适合人群、活动安排等"
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground">{description.length} / 1000</p>
          </div>

          {/* 标签多选 */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>
              兴趣标签（1-{CIRCLE_TAGS_MAX} 个）
            </Label>
            {tags.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggleTag(name)}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary hover:bg-primary/20"
                  >
                    {name}
                    <Trash2Icon className="size-3" />
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">尚未选择标签</p>
            )}
            <Input
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder="输入关键词搜索标签，如：太极"
            />
            {tagFilter.trim() && tags.length < CIRCLE_TAGS_MAX ? (
              <div className="max-h-32 overflow-y-auto rounded-lg border p-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {filteredTags.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => toggleTag(name)}
                      className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
                    >
                      {name}
                    </button>
                  ))}
                  {filteredTags.length === 0 ? (
                    <p className="px-1.5 py-1 text-xs text-muted-foreground">
                      没有匹配的标签
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {/* 地点选点(必须由用户确认,不会用兜底坐标充数) */}
          <div className="space-y-1.5 sm:col-span-2">
            <Label>活动地点</Label>
            <LocationPicker value={pick} onChange={setPick} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="circle-phone">联系电话</Label>
            <Input
              id="circle-phone"
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="与微信号至少填一个"
              inputMode="tel"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="circle-wechat">微信号</Label>
            <Input
              id="circle-wechat"
              value={wechat}
              onChange={(e) => setWechat(e.target.value)}
              placeholder="与电话至少填一个"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="circle-time">活动时间</Label>
            <Input
              id="circle-time"
              value={activityTime}
              onChange={(e) => setActivityTime(e.target.value)}
              placeholder="如：每周六 07:00-08:30"
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="circle-max">人数上限</Label>
            <Input
              id="circle-max"
              value={maxMembers}
              onChange={(e) => setMaxMembers(e.target.value.replace(/\D/g, ""))}
              placeholder="留空表示不限"
              inputMode="numeric"
            />
          </div>

          <CoverImagesField
            value={coverImages}
            onChange={setCoverImages}
            label="轮播图片"
          />
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
