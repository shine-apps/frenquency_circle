import type { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: "ADMIN" | "USER" | "TEACHER"
      provider?: string
    } & DefaultSession["user"]
  }

  interface User {
    role?: "ADMIN" | "USER" | "TEACHER"
    provider?: string
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: "ADMIN" | "USER" | "TEACHER"
    provider?: string
  }
}
