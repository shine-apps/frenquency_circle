"use client"

import { signOut } from "next-auth/react"
import { LogOutIcon } from "lucide-react"

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

export function SignOutButton() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          tooltip="退出登录"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOutIcon />
          <span>退出登录</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
