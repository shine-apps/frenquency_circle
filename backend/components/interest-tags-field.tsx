"use client"

import { useState } from "react"
import { Trash2Icon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

/** 候选项一次最多展示条数(避免输入单字就把整个标签库铺开) */
const CANDIDATE_LIMIT = 40

/**
 * 兴趣标签多选字段(受控,后台表单共用:圈子 / 课程 …)。
 *
 * 与「自由输入标签」不同,这里**只能从已审核通过的标签库中挑选**:
 * 候选由调用方(通常是 SSR 页面)查 `hobby_tags` 的 `status='approved'`
 * 传进来,避免教师手写标签导致同一个兴趣出现多种写法。
 *
 * 交互:
 * - 已选标签以 chip 展示,点击 chip 即取消;
 * - 关键词输入框筛选候选项(未输入关键词时不展开候选,避免一次铺开全部标签);
 * - 选满 `max` 个后收起候选并禁用搜索框。
 *
 * 校验(必填 / 数量上限)由调用方在提交前自行处理:
 * `value.length === 0 && required` → 提示至少选 1 个;`value.length > max` → 提示超上限。
 */
export function InterestTagsField({
  value,
  onChange,
  availableTags,
  max,
  required = false,
  label = "兴趣标签",
  error,
  className,
}: {
  value: string[]
  onChange: (next: string[]) => void
  /** 候选标签名称(调用方传入,应为已审核通过的标签) */
  availableTags: string[]
  /** 可选标签数量上限 */
  max: number
  /** 是否必填(仅影响标题文案,校验由调用方负责) */
  required?: boolean
  /** 字段名,默认「兴趣标签」 */
  label?: string
  /** 由父组件透出的错误文案(可选) */
  error?: string | null
  /** 栅格占位,默认通栏(与 CoverImagesField 一致) */
  className?: string
}) {
  const [filter, setFilter] = useState("")

  const atMax = value.length >= max
  const candidates = availableTags
    .filter((name) => !value.includes(name))
    .filter((name) => (filter.trim() ? name.includes(filter.trim()) : false))
    .slice(0, CANDIDATE_LIMIT)

  function toggleTag(name: string) {
    onChange(
      value.includes(name) ? value.filter((t) => t !== name) : [...value, name]
    )
  }

  return (
    <div className={cn("space-y-1.5", className ?? "sm:col-span-2")}>
      <Label>
        {label}（{required ? `1-${max}` : `选填，最多 ${max}`} 个）
      </Label>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((name) => (
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
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder={atMax ? `已达上限（最多 ${max} 个）` : "输入关键词搜索标签，如：太极"}
        disabled={atMax}
      />

      {!atMax && filter.trim() ? (
        <div className="max-h-32 overflow-y-auto rounded-lg border p-1.5">
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => toggleTag(name)}
                className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted"
              >
                {name}
              </button>
            ))}
            {candidates.length === 0 ? (
              <p className="px-1.5 py-1 text-xs text-muted-foreground">没有匹配的标签</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  )
}
