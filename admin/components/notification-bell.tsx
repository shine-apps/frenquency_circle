"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { BellIcon } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { NotificationDTO } from "@/types/api"

/** 后台通知类型 → 中文标签 */
const TYPE_LABEL: Record<NotificationDTO["type"], string> = {
  circle_review: "圈子待审核",
  circle_review_result: "审核结果",
  circle_followed: "圈子被关注",
}

export function NotificationBell() {
  const router = useRouter()
  const [unread, setUnread] = React.useState(0)
  const [open, setOpen] = React.useState(false)
  const [items, setItems] = React.useState<NotificationDTO[]>([])
  const [loading, setLoading] = React.useState(false)

  // 挂载时拉一次未读数
  React.useEffect(() => {
    fetch("/api/admin/notifications/unread-count")
      .then((r) => r.json())
      .then((res) => res?.data?.count ?? 0)
      .then(setUnread)
      .catch(() => setUnread(0))
  }, [])

  // 打开时拉列表
  const handleOpenChange = async (next: boolean) => {
    setOpen(next)
    if (!next) return
    setLoading(true)
    try {
      const res = await fetch("/api/admin/notifications?pageSize=10")
      const data = await res.json()
      const list: NotificationDTO[] = data?.data?.list ?? []
      setItems(list)
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  // 点击单条:标记已读 + 跳转
  const handleItemClick = async (n: NotificationDTO) => {
    if (!n.readAt) {
      // 乐观更新角标与该项
      setUnread((u) => Math.max(0, u - 1))
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)))
      fetch(`/api/admin/notifications/${n.id}`, { method: "PATCH" }).catch(() => {})
    }
    if (n.linkUrl) {
      setOpen(false)
      router.push(n.linkUrl)
    }
  }

  // 全部已读
  const handleMarkAll = async () => {
    setItems((list) => list.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })))
    setUnread(0)
    fetch("/api/admin/notifications/read-all", { method: "POST" }).catch(() => {})
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="通知" className="relative">
            <BellIcon className="size-5" />
            {unread > 0 ? (
              <Badge
                variant="destructive"
                className="absolute -top-1 -right-1 h-4 min-w-4 justify-center rounded-full px-1 text-[10px] leading-none"
              >
                {unread > 99 ? "99+" : unread}
              </Badge>
            ) : null}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">通知</span>
          {unread > 0 ? (
            <button
              type="button"
              onClick={handleMarkAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              全部已读
            </button>
          ) : null}
        </div>

        {loading ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            加载中…
          </div>
        ) : items.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            暂无通知
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {items.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => handleItemClick(n)}
                className="flex cursor-pointer flex-col items-start gap-0.5 px-3 py-2"
              >
                <div className="flex w-full items-center gap-2">
                  <span
                    className={cn(
                      "size-1.5 shrink-0 rounded-full",
                      n.readAt ? "bg-transparent" : "bg-primary",
                    )}
                  />
                  <span className="flex-1 truncate text-sm font-medium">
                    {n.title}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {TYPE_LABEL[n.type] ?? n.type}
                  </span>
                </div>
                <p className="line-clamp-2 pl-3.5 text-xs text-muted-foreground">
                  {n.content}
                </p>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
