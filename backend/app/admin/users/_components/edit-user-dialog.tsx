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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import type { UserDTO, UserRole } from "@/types/api"

export function EditUserDialog({
  user,
  onClose,
  onSaved,
}: {
  user: UserDTO
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(user.name)
  const [role, setRole] = useState<UserRole>(user.role)
  const [phone, setPhone] = useState(user.phone ?? "")
  const [practiceYears, setPracticeYears] = useState(
    user.practiceYears === null || user.practiceYears === undefined
      ? ""
      : String(user.practiceYears)
  )
  const [activityLevel, setActivityLevel] = useState<UserDTO["activityLevel"]>(
    user.activityLevel ?? "medium"
  )
  const [allowMatch, setAllowMatch] = useState(
    user.privacySettings?.allowMatch ?? true
  )
  const [publicContact, setPublicContact] = useState(
    user.privacySettings?.publicContact ?? true
  )
  const [locationPrecision, setLocationPrecision] = useState<
    UserDTO["privacySettings"]["locationPrecision"]
  >(user.privacySettings?.locationPrecision ?? "exact")

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!name.trim()) {
      setError("请填写用户昵称")
      return
    }

    const body: Record<string, unknown> = {
      name: name.trim(),
      role,
      phone: phone.trim() === "" ? null : phone.trim(),
      activityLevel,
      privacySettings: { allowMatch, publicContact, locationPrecision },
    }
    if (practiceYears.trim() !== "") {
      const years = Number(practiceYears)
      if (!Number.isInteger(years) || years < 0 || years > 100) {
        setError("练习年限需为 0-100 的整数")
        return
      }
      body.practiceYears = years
    } else {
      body.practiceYears = null
    }

    setBusy(true)
    setError(null)
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) {
      onSaved()
    } else {
      setError(data.message || "保存失败")
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>编辑用户</DialogTitle>
          <DialogDescription>修改用户资料后保存。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>邮箱（登录账号，不可修改）</Label>
            <Input value={user.email} disabled />
          </div>

          <div className="space-y-1">
            <Label htmlFor="edit-user-name">昵称</Label>
            <Input
              id="edit-user-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="用户昵称"
              maxLength={100}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="edit-user-role">角色</Label>
              <select
                id="edit-user-role"
                className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
              >
                <option value="USER">普通用户</option>
                <option value="TEACHER">老师</option>
                <option value="ADMIN">管理员</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-user-level">活跃度</Label>
              <select
                id="edit-user-level"
                className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
                value={activityLevel}
                onChange={(e) =>
                  setActivityLevel(e.target.value as UserDTO["activityLevel"])
                }
              >
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="edit-user-phone">手机号</Label>
              <Input
                id="edit-user-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="选填"
                maxLength={30}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-user-years">练习年限</Label>
              <Input
                id="edit-user-years"
                type="number"
                min={0}
                max={100}
                value={practiceYears}
                onChange={(e) => setPracticeYears(e.target.value)}
                placeholder="选填"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>隐私设置</Label>
            <div className="flex items-center gap-5 text-sm">
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={allowMatch}
                  onChange={(e) => setAllowMatch(e.target.checked)}
                />
                允许匹配
              </label>
              <label className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={publicContact}
                  onChange={(e) => setPublicContact(e.target.checked)}
                />
                公开联系方式
              </label>
            </div>
            <select
              className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
              value={locationPrecision}
              onChange={(e) =>
                setLocationPrecision(
                  e.target.value as UserDTO["privacySettings"]["locationPrecision"]
                )
              }
            >
              <option value="exact">位置精度：精确距离</option>
              <option value="community">位置精度：社区（0.5km）</option>
              <option value="region">位置精度：区域（5km）</option>
            </select>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
