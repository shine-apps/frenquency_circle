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
import { LocationPicker, type LocationValue } from "@/components/location-picker"
import type { UserDTO } from "@/types/api"

/**
 * 管理员编辑用户地址弹窗。
 *
 * 地图选点逻辑(高德加载 / POI 搜索 / 逆地理编码 / 中心图钉)已抽取到
 * `components/location-picker.tsx`,本组件只保留弹窗框架与保存动作。
 */
export function EditAddressDialog({
  user,
  onClose,
  onSaved,
}: {
  user: UserDTO
  onClose: () => void
  onSaved: () => void
}) {
  const [pick, setPick] = useState<LocationValue | null>(
    user.location
      ? {
          latitude: user.location.latitude,
          longitude: user.location.longitude,
          address: user.address ?? "",
        }
      : null
  )
  const [busy, setBusy] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const hasExistingAddress = !!(user.address || user.location)

  async function handleSave() {
    if (!pick) {
      setSaveError("请先选择地址")
      return
    }
    setBusy(true)
    setSaveError(null)
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: pick.address || null,
        location: {
          latitude: pick.latitude,
          longitude: pick.longitude,
        },
      }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) {
      onSaved()
    } else {
      setSaveError(data.message || "保存失败")
    }
  }

  async function handleClear() {
    setBusy(true)
    setSaveError(null)
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: null, location: null }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) {
      onSaved()
    } else {
      setSaveError(data.message || "保存失败")
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>编辑地址</DialogTitle>
          <DialogDescription>
            修改 {user.name} 的位置，拖动地图或搜索选择地址。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* 当前地址 + 清除 */}
          <div className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm">
            <span className="min-w-0 flex-1 truncate" title={pick?.address || user.address || ""}>
              {pick?.address || user.address || "尚未设置地址"}
            </span>
            {hasExistingAddress ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive shrink-0"
                onClick={() => void handleClear()}
                disabled={busy}
              >
                清除地址
              </Button>
            ) : null}
          </div>

          <LocationPicker value={pick} onChange={setPick} heightClassName="h-[280px] sm:h-[360px]" />

          {saveError ? (
            <p className="text-sm text-destructive">{saveError}</p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void handleSave()} disabled={busy || !pick}>
            {busy ? "保存中…" : "保存地址"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
