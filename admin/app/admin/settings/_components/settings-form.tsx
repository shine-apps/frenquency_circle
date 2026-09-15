"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

/**
 * 单个设置项的开关行。
 * 统一 PATCH /api/admin/settings 的保存逻辑与开关样式,避免每个设置项复制一份。
 */
function SettingSwitch({
  settingKey,
  title,
  description,
  initialChecked,
}: {
  /** 与 /api/admin/settings 的白名单保持一致,避免 key 拼错直到请求 400 才暴露 */
  settingKey: "isAppDeploying" | "contentModerationEnabled"
  title: string
  description: string
  initialChecked: boolean
}) {
  const router = useRouter()
  const [checked, setChecked] = useState(initialChecked)
  const [busy, setBusy] = useState(false)

  async function handleToggle(next: boolean) {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: settingKey, value: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setChecked(next)
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
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={busy}
        onClick={() => void handleToggle(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          checked ? "bg-primary" : "bg-input"
        }`}
      >
        <span
          className={`pointer-events-none block size-5 rounded-full bg-background shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  )
}

/**
 * 系统设置表单。
 *
 * 当前提供 isAppDeploying(应用发布维护中)与
 * contentModerationEnabled(内容安全审核,先审后发,默认关闭)两个设置项,
 * 后续根据项目需求再在此扩展其他设置项。
 */
export function SettingsForm({
  initialIsAppDeploying,
  initialContentModerationEnabled,
}: {
  initialIsAppDeploying: boolean
  initialContentModerationEnabled: boolean
}) {
  return (
    <div className="space-y-3">
      <SettingSwitch
        settingKey="isAppDeploying"
        title="应用发布维护中"
        description="开启后小程序端隐藏右下角创建入口,并禁止进入创建活动 / 创建圈子 / 教师认证页面(自动跳回首页)。"
        initialChecked={initialIsAppDeploying}
      />
      <SettingSwitch
        settingKey="contentModerationEnabled"
        title="内容安全审核(先审后发)"
        description="开启后小程序端在发布圈子 / 打卡 / 活动等文本内容前先调用内容安全审核接口,命中违规内容将拦截发布;关闭时不审核,直接放行。小程序端在冷启动或下次回到前台拉取设置后生效。"
        initialChecked={initialContentModerationEnabled}
      />
    </div>
  )
}
