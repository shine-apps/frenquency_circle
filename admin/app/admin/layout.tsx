import { redirect } from "next/navigation"
import { auth, signOut } from "@/auth"
import { LogOutIcon } from "lucide-react"

import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { AppSidebar } from "@/components/app-sidebar"
import { NotificationBell } from "@/components/notification-bell"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session?.user) {
    redirect("/login")
  }
  // 已登录但非管理员 → 重定向到首页，避免越权访问后台
  if (session.user.role !== "ADMIN") {
    redirect("/")
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex-1" />
          <NotificationBell />
          <div className="hidden text-sm text-muted-foreground sm:block">
            {session.user.email}
          </div>
          <form
            action={async () => {
              "use server"
              await signOut({ redirectTo: "/login" })
            }}
          >
            <Button variant="ghost" size="sm" type="submit" title="退出登录">
              <LogOutIcon />
              登出
            </Button>
          </form>
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
