"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

/**
 * 系统设置表单。
 *
 * 当前仅提供 isAppDeploying(应用发布维护中)一个设置项,
 * 后续根据项目需求再在此扩展其他设置项。
 */
export function SettingsForm({
  initialIsAppDeploying,
}: {
  initialIsAppDeploying: boolean
}) {
  const router = useRouter()
  const [isAppDeploying, setIsAppDeploying] = useState(initialIsAppDeploying)
  const [busy, setBusy] = useState(false)

  async function handleToggle(next: boolean) {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "isAppDeploying", value: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setIsAppDeploying(next)
        toast.success("已保存")
        router.refresh()
      } else {
        toast.error(data.message || "保存失败")
      }
    } catch {
      toast.error("网络异常，请重试")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border bg-card p-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">应用发布维护中</p>
        <p className="mt-1 text-xs text-muted-foreground">
          开启后小程序端隐藏右下角创建入口,
          并禁止进入创建活动 / 创建圈子 / 教师认证页面(自动跳回首页)。
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={isAppDeploying}
        disabled={busy}
        onClick={() => void handleToggle(!isAppDeploying)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          isAppDeploying ? "bg-primary" : "bg-input"
        }`}
      >
        <span
          className={`pointer-events-none block size-5 rounded-full bg-background shadow-sm transition-transform ${
            isAppDeploying ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  )
}
