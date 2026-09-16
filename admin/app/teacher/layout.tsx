import { redirect } from "next/navigation"
import { LogOutIcon } from "lucide-react"

import { auth, signOut } from "@/auth"
import { TEACHER_AREA_ROLES } from "@/lib/user-role"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { TeacherSidebar } from "@/components/teacher-sidebar"

/**
 * 教师后台布局(server component)。
 *
 * 守卫与 `app/admin/layout.tsx` 同构,与 `proxy.ts` matcher 及
 * `auth.config.ts` 的 authorized 回调互为三重保险:
 * - 未登录 → /login
 * - 角色 ∉ TEACHER_AREA_ROLES(TEACHER / ADMIN) → /
 *
 * 响应式:header 结构照抄 admin(小屏邮箱隐藏、侧边栏走 Sheet 抽屉)。
 */
export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  // 必须同时有 id:下游页面都以 session.user.id 作为查询条件,
  // 缺 id 会拼出 `creatorId = ''` → Postgres 22P02 → 500
  if (!session?.user?.id) {
    redirect("/login")
  }
  // 已登录但角色不符 → 重定向到首页,避免越权访问教师后台
  if (!TEACHER_AREA_ROLES.includes(session.user.role)) {
    redirect("/")
  }

  return (
    <SidebarProvider>
      <TeacherSidebar />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          <div className="flex-1" />
          <div className="hidden max-w-[40vw] truncate text-sm text-muted-foreground sm:block">
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
              <span className="hidden sm:inline">登出</span>
            </Button>
          </form>
        </header>
        <div className="flex-1 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
