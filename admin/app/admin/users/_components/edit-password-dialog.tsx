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
import type { UserDTO } from "@/types/api"

export function EditPasswordDialog({
  user,
  onClose,
  onSaved,
}: {
  user: UserDTO
  onClose: () => void
  onSaved: () => void
}) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (password.length < 6) {
      setError("密码至少 6 位")
      return
    }
    if (password.length > 72) {
      setError("密码最多 72 位")
      return
    }
    if (password !== confirm) {
      setError("两次输入的密码不一致")
      return
    }

    setBusy(true)
    setError(null)
    const res = await fetch(`/api/users/${user.id}/password`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    })
    const data = await res.json().catch(() => ({}))
    setBusy(false)
    if (res.ok) {
      onSaved()
    } else {
      setError(data.message || "修改失败")
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
          <DialogTitle>修改密码</DialogTitle>
          <DialogDescription>
            重置 {user.name}（{user.email}）的登录密码，保存后旧密码立即失效。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="edit-password-new">新密码</Label>
            <Input
              id="edit-password-new"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6-72 位"
              minLength={6}
              maxLength={72}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-password-confirm">确认新密码</Label>
            <Input
              id="edit-password-confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="再次输入新密码"
              minLength={6}
              maxLength={72}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={busy}>
            {busy ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
