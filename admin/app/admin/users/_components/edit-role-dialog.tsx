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
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { USER_ROLE_OPTIONS } from "@/lib/user-role"
import type { UserDTO, UserRole } from "@/types/api"

export function EditRoleDialog({
  user,
  onClose,
  onSaved,
}: {
  user: UserDTO
  onClose: () => void
  onSaved: () => void
}) {
  const [role, setRole] = useState<UserRole>(user.role)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
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
          <DialogTitle>设置用户角色</DialogTitle>
          <DialogDescription>
            修改 {user.name}（{user.email}）的角色权限，保存后立即生效。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Label htmlFor="edit-role">角色</Label>
          <select
            id="edit-role"
            className="h-8 w-full rounded-lg border bg-background px-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            {USER_ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

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
