"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { CircleIcon, CalendarCheckIcon, LayoutDashboardIcon, AudioWaveformIcon, GraduationCapIcon } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { SignOutButton } from "@/components/sign-out-button"

/**
 * 教师后台侧边栏。
 *
 * 基于 shadcn 的 `Sidebar`,小屏(<768px)由 `useIsMobile` 自动切换为
 * `Sheet` 抽屉,由 header 里的 `SidebarTrigger` 开合,无需额外适配。
 */
const navItems = [
  { href: "/teacher", label: "概览", icon: LayoutDashboardIcon, exact: true },
  { href: "/teacher/circles", label: "我的圈子", icon: CircleIcon },
  { href: "/teacher/activities", label: "我的活动", icon: CalendarCheckIcon },
  { href: "/teacher/courses", label: "我的课程", icon: GraduationCapIcon },
]

export function TeacherSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<Link href="/teacher" />}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <AudioWaveformIcon className="size-4" />
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-medium">qulinquan</span>
                <span className="text-xs text-muted-foreground">teacher</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>导航</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + "/")
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      render={<Link href={item.href} />}
                      isActive={active}
                      tooltip={item.label}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SignOutButton />
      </SidebarFooter>
    </Sidebar>
  )
}
