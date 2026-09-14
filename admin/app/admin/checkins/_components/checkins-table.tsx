"use client"

import { useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  EyeIcon,
  MoreHorizontalIcon,
  RotateCcwIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { CHECKIN_STATUS_LABEL } from "@/lib/checkin-status"
import { cn } from "@/lib/utils"
import type { AdminCheckinItem, CheckinStatus } from "@/types/api"

/**
 * 行布局：窄屏（手机 / 平板）纵向堆叠为卡片式信息行，
 * 宽屏（lg 及以上）切换为表格化栅格。用 div + grid 替代 table，
 * 便于正文/标签在窄屏下自适应换行（与 users 页保持同一响应式策略）。
 */
const ROW_BASE = "px-4 py-3"
const ROW_MOBILE = "flex flex-col gap-2"
const ROW_DESKTOP =
  "lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_5.5rem_minmax(0,0.9fr)_5.5rem_6.5rem_2.25rem] lg:items-center lg:gap-4"

/**
 * 字段容器：窄屏显示「标签 + 值」两端对齐，宽屏仅显示值（依赖表头列名）。
 */
function Field({
  label,
  className,
  children,
}: {
  label: string
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 lg:block",
        className
      )}
    >
      <span className="shrink-0 text-xs text-muted-foreground lg:hidden">
        {label}
      </span>
      <div className="min-w-0 text-right lg:text-left">{children}</div>
    </div>
  )
}

/** 媒体摘要：视频 / 图片张数 / 纯文字 */
function mediaLabel(item: AdminCheckinItem): string {
  if (item.videoUrl) return "视频"
  if (item.images.length > 0) return `${item.images.length} 张图片`
  return "纯文字"
}

/** 调用 PATCH /api/admin/checkins/:id 下架 / 恢复打卡；失败返回可读错误信息 */
async function patchCheckinStatus(
  id: string,
  status: CheckinStatus
): Promise<string | null> {
  const res = await fetch(`/api/admin/checkins/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  })
  const body = (await res.json().catch(() => null)) as {
    code?: number
    message?: string
  } | null
  if (!res.ok || body?.code !== 200) {
    return body?.message ?? "操作失败，请稍后重试"
  }
  return null
}

export function CheckinsTable({
  items,
  emptyText = "暂无数据",
}: {
  items: AdminCheckinItem[]
  emptyText?: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  // 详情弹窗
  const [selected, setSelected] = useState<AdminCheckinItem | null>(null)
  // 下架 / 恢复二次确认
  const [target, setTarget] = useState<{
    item: AdminCheckinItem
    status: CheckinStatus
  } | null>(null)
  const [pending, setPending] = useState(false)

  function refresh() {
    startTransition(() => {
      router.refresh()
    })
  }

  async function confirmAction() {
    if (!target) return
    setPending(true)
    const error = await patchCheckinStatus(target.item.id, target.status)
    setPending(false)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(target.status === "deleted" ? "已下架该打卡" : "已恢复该打卡")
    setTarget(null)
    refresh()
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        {/* 表头：仅宽屏显示，窄屏由每个字段自带的标签代替 */}
        <div
          className={cn(
            ROW_BASE,
            ROW_DESKTOP,
            "hidden border-b bg-muted/40 py-2.5 text-sm font-medium lg:grid"
          )}
        >
          <div>作者</div>
          <div>内容</div>
          <div>媒体</div>
          <div>圈子</div>
          <div>状态</div>
          <div>发布时间</div>
          <div className="sr-only">操作</div>
        </div>

        <div className="divide-y">
          {items.map((item) => (
            <div key={item.id} className={cn(ROW_BASE, ROW_MOBILE, ROW_DESKTOP)}>
              <Field label="作者">
                <span className="font-medium break-words">
                  {item.author.name}
                </span>
              </Field>

              <Field label="内容">
                {item.content ? (
                  <span className="line-clamp-2 break-words text-muted-foreground">
                    {item.content}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Field>

              <Field label="媒体">
                <span className="text-muted-foreground">
                  {mediaLabel(item)}
                </span>
              </Field>

              <Field label="圈子">
                <span className="break-words text-muted-foreground">
                  {item.circleTitle ?? "—"}
                </span>
              </Field>

              <Field label="状态">
                <Badge
                  variant={item.status === "active" ? "default" : "secondary"}
                >
                  {CHECKIN_STATUS_LABEL[item.status]}
                </Badge>
              </Field>

              <Field label="发布时间">
                <span className="text-muted-foreground">
                  {item.createdAt.slice(0, 10)}
                </span>
              </Field>

              <div className="flex justify-end lg:justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button variant="ghost" size="icon-sm" aria-label="操作" />
                    }
                  >
                    <MoreHorizontalIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setSelected(item)}>
                      <EyeIcon />
                      查看
                    </DropdownMenuItem>
                    {item.status === "active" ? (
                      <DropdownMenuItem
                        onClick={() => setTarget({ item, status: "deleted" })}
                      >
                        <Trash2Icon />
                        下架
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => setTarget({ item, status: "active" })}
                      >
                        <RotateCcwIcon />
                        恢复
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}

          {items.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              {emptyText}
            </div>
          ) : null}
        </div>
      </div>

      {/* 详情弹窗 */}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>打卡详情</DialogTitle>
            <DialogDescription>
              {selected?.author.name} 的打卡记录
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">作者</dt>
              <dd className="break-words">{selected.author.name}</dd>
              <dt className="text-muted-foreground">状态</dt>
              <dd>
                <Badge
                  variant={selected.status === "active" ? "default" : "secondary"}
                >
                  {CHECKIN_STATUS_LABEL[selected.status]}
                </Badge>
              </dd>
              <dt className="text-muted-foreground">圈子</dt>
              <dd className="break-words">{selected.circleTitle ?? "—"}</dd>
              <dt className="text-muted-foreground">标签</dt>
              <dd>
                {selected.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {selected.tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </dd>
              <dt className="text-muted-foreground">正文</dt>
              <dd className="break-words whitespace-pre-wrap">
                {selected.content || "—"}
              </dd>
              <dt className="text-muted-foreground">媒体</dt>
              <dd>
                {selected.videoUrl ? (
                  <a
                    href={selected.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted"
                  >
                    查看视频
                  </a>
                ) : selected.images.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selected.images.map((url, index) => (
                      <a
                        key={`${index}-${url}`}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- COS 外链图片，后台审核需直接查看，无需 next/image 优化 */}
                        <img
                          src={url}
                          alt={`打卡图片 ${index + 1}`}
                          loading="lazy"
                          className="size-20 rounded border object-cover"
                        />
                      </a>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">纯文字打卡</span>
                )}
              </dd>
              <dt className="text-muted-foreground">发布时间</dt>
              <dd className="break-words">{selected.createdAt}</dd>
              <dt className="text-muted-foreground">更新时间</dt>
              <dd className="break-words">{selected.updatedAt}</dd>
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* 下架 / 恢复二次确认弹窗 */}
      <Dialog
        open={target !== null}
        onOpenChange={(open) => !open && setTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {target?.status === "deleted" ? "下架打卡" : "恢复打卡"}
            </DialogTitle>
            <DialogDescription>
              {target?.status === "deleted"
                ? `确定下架「${target?.item.author.name}」的这条打卡？下架后将不再出现在广场、我的打卡与圈子打卡中。`
                : `确定恢复「${target?.item.author.name}」的这条打卡？恢复后将重新出现在各打卡列表中。注意：该记录也可能是作者本人删除的，恢复等于替作者重新公开内容，请确认后再操作。`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTarget(null)}
              disabled={pending}
            >
              取消
            </Button>
            <Button
              variant={target?.status === "deleted" ? "destructive" : "default"}
              onClick={confirmAction}
              disabled={pending}
            >
              {target?.status === "deleted" ? "确认下架" : "确认恢复"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
