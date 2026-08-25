"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  MoreHorizontalIcon,
  EyeIcon,
  PencilIcon,
  MapPinIcon,
  KeyRoundIcon,
  BadgeCheckIcon,
} from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import type { UserDTO } from "@/types/api"
import { EditUserDialog } from "./edit-user-dialog"
import { EditAddressDialog } from "./edit-address-dialog"
import { EditPasswordDialog } from "./edit-password-dialog"
import { EditRoleDialog } from "./edit-role-dialog"

export function UsersTable({ items }: { items: UserDTO[] }) {
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
      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Joined</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-muted-foreground">
                  {u.email}
                </TableCell>
                <TableCell>
                  <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>
                    {u.role}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {u.createdAt.slice(0, 10)}
                </TableCell>
                <TableCell>
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
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center text-muted-foreground"
                >
                  暂无数据
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
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
            <dl className="grid grid-cols-3 gap-2 text-sm">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="col-span-2 break-all">{selected.email}</dd>
              <dt className="text-muted-foreground">Role</dt>
              <dd className="col-span-2">
                <Badge
                  variant={selected.role === "ADMIN" ? "default" : "secondary"}
                >
                  {selected.role}
                </Badge>
              </dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd className="col-span-2">{selected.createdAt}</dd>
              <dt className="text-muted-foreground">Updated</dt>
              <dd className="col-span-2">{selected.updatedAt}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd className="col-span-2">{selected.phone || "—"}</dd>
              <dt className="text-muted-foreground">Practice Years</dt>
              <dd className="col-span-2">
                {selected.practiceYears === null ||
                selected.practiceYears === undefined
                  ? "—"
                  : selected.practiceYears}
              </dd>
              <dt className="text-muted-foreground">Activity Level</dt>
              <dd className="col-span-2">{selected.activityLevel ?? "—"}</dd>
              <dt className="text-muted-foreground">Address</dt>
              <dd className="col-span-2">{selected.address || "—"}</dd>
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
