import type { NextAuthConfig } from "next-auth"
import { NextResponse } from "next/server"
import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth/session-config"

export const authConfig = {
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnAdmin = nextUrl.pathname.startsWith("/admin")
      if (isOnAdmin) {
        if (!isLoggedIn) return false
        // 角色校验下沉到路由层:非管理员直接回首页,而不是先渲染后台再被 layout 重定向。
        // 与 app/admin/layout.tsx 的守卫互为双保险。
        if (auth.user.role !== "ADMIN") {
          return NextResponse.redirect(new URL("/", nextUrl))
        }
        return true
      }
      return true
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id
        if (user.role) {
          token.role = user.role
        }
        // account 在首次登录时存在；provider 字段标注本次登录方式
        if (account?.provider) token.provider = account.provider
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        if (token.id) session.user.id = token.id as string
        if (token.role) session.user.role = token.role
        if (token.provider) session.user.provider = token.provider as string
      }
      return session
    },
  },
  // maxAge 与 Token 登录响应里的 expiresIn 同源(见 lib/auth/session-config.ts),
  // 避免前端按另一套时长判定过期
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
} satisfies NextAuthConfig
