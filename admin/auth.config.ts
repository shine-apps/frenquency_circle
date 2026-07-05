import type { NextAuthConfig } from "next-auth"

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
        if (isLoggedIn) return true
        return false
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
  session: { strategy: "jwt" },
} satisfies NextAuthConfig
