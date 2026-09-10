"use client"

import { useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  MoreHorizontalIcon,
  EyeIcon,
  PencilIcon,
  MapPinIcon,
  KeyRoundIcon,
  BadgeCheckIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { UserDTO } from "@/types/api"
import { EditUserDialog } from "./edit-user-dialog"
import { EditAddressDialog } from "./edit-address-dialog"
import { EditPasswordDialog } from "./edit-password-dialog"
import { EditRoleDialog } from "./edit-role-dialog"

/**
 * 行布局：窄屏（手机 / 平板）纵向堆叠为卡片式信息行，
 * 宽屏（lg 及以上）切换为表格化栅格。用 div + grid 替代 table，便于小屏自适应换行 / 伸缩。
 */
const ROW_BASE = "px-4 py-3"
const ROW_MOBILE = "flex flex-col gap-2"
const ROW_DESKTOP =
  "lg:grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.6fr)_5.5rem_6.5rem_2.25rem] lg:items-center lg:gap-4"

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

export function UsersTable({
  items,
  emptyText = "暂无数据",
}: {
  items: UserDTO[]
  emptyText?: string
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [selected, setSelected] = useState<UserDTO | null>(null)
  const [editing, setEditing] = useState<UserDTO | null>(null)
  const [editingAddress, setEditingAddress] = useState<UserDTO | null>(null)
  const [editingPassword, setEditingPassword] = useState<UserDTO | null>(null)
  const [editingRole, setEditingRole] = useState<UserDTO | null>(null)

  function refresh() {
    startTransition(() => {
      router.refresh()
    })
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
          <div>Name</div>
          <div>Phone</div>
          <div>Interests</div>
          <div>Role</div>
          <div>Joined</div>
          <div className="sr-only">操作</div>
        </div>

        <div className="divide-y">
          {items.map((u) => (
            <div key={u.id} className={cn(ROW_BASE, ROW_MOBILE, ROW_DESKTOP)}>
              <Field label="Name">
                <span className="font-medium break-words">{u.name}</span>
              </Field>

              <Field label="Phone">
                <span className="text-muted-foreground">{u.phone || "—"}</span>
              </Field>

              <Field label="Interests">
                {u.tags && u.tags.length > 0 ? (
                  <div className="flex flex-wrap justify-end gap-1 lg:max-w-64 lg:justify-start">
                    {u.tags.map((tag) => (
                      <Badge key={tag} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Field>

              <Field label="Role">
                <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>
                  {u.role}
                </Badge>
              </Field>

              <Field label="Joined">
                <span className="text-muted-foreground">
                  {u.createdAt.slice(0, 10)}
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
                    <DropdownMenuItem onClick={() => setSelected(u)}>
                      <EyeIcon />
                      查看
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditing(u)}>
                      <PencilIcon />
                      编辑
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditingAddress(u)}>
                      <MapPinIcon />
                      编辑地址
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditingPassword(u)}>
                      <KeyRoundIcon />
                      修改密码
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setEditingRole(u)}>
                      <BadgeCheckIcon />
                      设置角色
                    </DropdownMenuItem>
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

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.name}</DialogTitle>
            <DialogDescription>用户详情</DialogDescription>
          </DialogHeader>
          {selected ? (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 text-sm">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="break-all">{selected.email}</dd>
              <dt className="text-muted-foreground">Role</dt>
              <dd>
                <Badge
                  variant={selected.role === "ADMIN" ? "default" : "secondary"}
                >
                  {selected.role}
                </Badge>
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="break-words">{selected.createdAt}</dd>
              <dt className="text-muted-foreground">Updated</dt>
              <dd className="break-words">{selected.updatedAt}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{selected.phone || "—"}</dd>
              <dt className="text-muted-foreground">Practice Years</dt>
              <dd>
                {selected.practiceYears === null ||
                selected.practiceYears === undefined
                  ? "—"
                  : selected.practiceYears}
              </dd>
              <dt className="text-muted-foreground">Activity Level</dt>
              <dd>{selected.activityLevel ?? "—"}</dd>
              <dt className="text-muted-foreground">Address</dt>
              <dd className="break-words">{selected.address || "—"}</dd>
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>

      {editing ? (
        <EditUserDialog
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            refresh()
          }}
        />
      ) : null}

      {editingAddress ? (
        <EditAddressDialog
          user={editingAddress}
          onClose={() => setEditingAddress(null)}
          onSaved={() => {
            setEditingAddress(null)
            refresh()
          }}
        />
      ) : null}

      {editingPassword ? (
        <EditPasswordDialog
          user={editingPassword}
          onClose={() => setEditingPassword(null)}
          onSaved={() => {
            setEditingPassword(null)
            refresh()
          }}
        />
      ) : null}

      {editingRole ? (
        <EditRoleDialog
          user={editingRole}
          onClose={() => setEditingRole(null)}
          onSaved={() => {
            setEditingRole(null)
            refresh()
          }}
        />
      ) : null}
    </>
  )
}
