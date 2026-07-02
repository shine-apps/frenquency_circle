"use client"

import { useState } from "react"
import {
  MoreHorizontalIcon,
  EyeIcon,
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

export function UsersTable({ items }: { items: UserDTO[] }) {
  const [selected, setSelected] = useState<UserDTO | null>(null)

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
            </dl>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
