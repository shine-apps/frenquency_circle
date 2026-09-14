"use client"

import { useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { CheckinStatus } from "@/types/api"

/**
 * 打卡列表分页控件。
 *
 * 翻页时保留当前筛选条件（关键词 / 状态），通过 URL `page` 触发服务端分页查询。
 *
 * @param page       当前页码（服务端传入，越界时已收敛到有效范围）
 * @param totalPages 总页数
 * @param total      总记录数
 * @param keyword    当前关键词（用于翻页时保留过滤条件）
 * @param status     当前状态过滤（用于翻页时保留过滤条件）
 */
export function CheckinsPagination({
  page,
  totalPages,
  total,
  keyword = "",
  status = null,
}: {
  page: number
  totalPages: number
  total: number
  keyword?: string
  status?: CheckinStatus | null
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  // 收敛越界页码（例如手动改 URL），保证控件状态与实际展示一致
  const current = Math.min(Math.max(1, page), totalPages)

  function go(next: number) {
    const params = new URLSearchParams()
    if (keyword) params.set("q", keyword)
    if (status) params.set("status", status)
    if (next > 1) params.set("page", String(next))
    const query = params.toString()

    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname)
    })
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
      <span>
        共 {total} 条 · 第 {current} / {totalPages} 页
        {isPending ? (
          <Loader2Icon className="ml-1.5 inline size-3.5 animate-spin" />
        ) : null}
      </span>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || current <= 1}
          onClick={() => go(current - 1)}
        >
          上一页
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending || current >= totalPages}
          onClick={() => go(current + 1)}
        >
          下一页
        </Button>
      </div>
    </div>
  )
}
