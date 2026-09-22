"use client"

import { useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2Icon, SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { CheckinStatus } from "@/types/api"

/**
 * 打卡管理筛选区：状态 Tab（全部 / 正常 / 已删除）+ 关键词搜索。
 *
 * 所有条件通过 URL 查询参数（`q` / `status`）驱动服务端分页查询，
 * 切换状态或提交搜索都会回到第 1 页（不保留 `page`）。
 *
 * @param keyword 当前关键词（来自 URL，用于刷新/回填）
 * @param status  当前状态过滤（来自 URL，null 表示全部）
 * @param counts  各状态计数（服务端按当前关键词统计，口径与列表一致）
 */
export function CheckinsFilters({
  keyword,
  status,
  counts,
}: {
  keyword: string
  status: CheckinStatus | null
  counts: { active: number; deleted: number }
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [value, setValue] = useState(keyword)
  const [isPending, startTransition] = useTransition()

  /** 统一跳转：以「输入框当前值 + 目标状态」构造 URL（都不含 page，即回到第 1 页） */
  function navigate(nextKeyword: string, nextStatus: CheckinStatus | null) {
    const params = new URLSearchParams()
    const trimmed = nextKeyword.trim()
    if (trimmed) params.set("q", trimmed)
    if (nextStatus) params.set("status", nextStatus)
    const query = params.toString()

    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname)
    })
  }

  return (
    <div className="space-y-3">
      <Tabs
        value={status ?? "all"}
        onValueChange={(next) =>
          navigate(value, next === "all" ? null : (next as CheckinStatus))
        }
      >
        <TabsList>
          <TabsTrigger value="all">
            全部 ({counts.active + counts.deleted})
          </TabsTrigger>
          <TabsTrigger value="active">正常 ({counts.active})</TabsTrigger>
          <TabsTrigger value="deleted">已删除 ({counts.deleted})</TabsTrigger>
        </TabsList>
      </Tabs>

      <form
        className="flex max-w-xl items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          navigate(value, status)
        }}
      >
        <div className="relative min-w-72 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="搜索打卡正文或作者昵称"
            aria-label="按正文或作者昵称搜索打卡"
            className="pl-8"
          />
          {value && !isPending ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="清空搜索"
              className="absolute top-1/2 right-0.5 -translate-y-1/2"
              onClick={() => setValue("")}
            >
              <XIcon />
            </Button>
          ) : null}
        </div>

        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}
          搜索
        </Button>
      </form>

      <p className="text-xs text-muted-foreground">
        关键词模糊匹配打卡正文与作者昵称，可叠加状态筛选
      </p>
    </div>
  )
}
