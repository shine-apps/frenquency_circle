import { describe, expect, it } from "vitest"
import { authConfig } from "@/auth.config"

/**
 * 直接测试 authConfig.callbacks 的 jwt / session / authorized 回调行为。
 * 这些回调是纯函数，可直接调用，无需启动 NextAuth。
 */

/**
 * 以 `new URL` 充当 NextURL(pathname 语义一致,且可作为 `new URL("/", nextUrl)` 的 base)。
 * 回调为同步函数,直接返回 `boolean | NextResponse`。
 */
function callAuthorized(
  pathname: string,
  role: "ADMIN" | "TEACHER" | "USER" | null
): boolean | Response {
  return authConfig.callbacks.authorized!({
    auth: role
      ? ({ user: { id: "u1", role }, expires: "2099-01-01" } as never)
      : (null as never),
    request: { nextUrl: new URL(`http://localhost${pathname}`) } as never,
  }) as unknown as boolean | Response
}

function redirectLocation(result: boolean | Response): string | null {
  return result instanceof Response ? result.headers.get("location") : null
}

describe("auth.config callbacks", () => {
  describe("jwt", () => {
    it("transfers id and role from user on first login", async () => {
      const token: Record<string, unknown> = {}
      const result = await authConfig.callbacks.jwt!({
        token,
        user: { id: "u1", role: "ADMIN" } as never,
        account: null,
        profile: undefined,
        isNewUser: false,
        trigger: undefined,
        session: undefined,
      })
      expect(result.id).toBe("u1")
      expect(result.role).toBe("ADMIN")
    })

    it("transfers provider from account on first login", async () => {
      const token: Record<string, unknown> = {}
      const result = await authConfig.callbacks.jwt!({
        token,
        user: { id: "u1", role: "USER" } as never,
        account: { provider: "phone" } as never,
        profile: undefined,
        isNewUser: false,
        trigger: undefined,
        session: undefined,
      })
      expect(result.provider).toBe("phone")
    })

    it("does not set provider when account is null (token refresh)", async () => {
      const token: Record<string, unknown> = { id: "u1", role: "USER" }
      const result = await authConfig.callbacks.jwt!({
        token,
        user: undefined as never,
        account: null,
        profile: undefined,
        isNewUser: false,
        trigger: undefined,
        session: undefined,
      })
      expect(result.provider).toBeUndefined()
      // 已有字段保留
      expect(result.id).toBe("u1")
      expect(result.role).toBe("USER")
    })

    it("preserves existing provider on subsequent jwt refresh", async () => {
      const token: Record<string, unknown> = {
        id: "u1",
        role: "USER",
        provider: "credentials",
      }
      const result = await authConfig.callbacks.jwt!({
        token,
        user: undefined as never,
        account: null,
        profile: undefined,
        isNewUser: false,
        trigger: undefined,
        session: undefined,
      })
      // 回调内只在 user 真值时改 token；token refresh 时不动 provider
      expect(result.provider).toBe("credentials")
    })
  })

  describe("session", () => {
    it("transfers id / role / provider from token to session.user", async () => {
      const session = {
        user: { email: "a@b.com", name: "A" },
        expires: "2099-01-01",
      } as never
      const result = await authConfig.callbacks.session!({
        session,
        token: {
          id: "u1",
          role: "ADMIN",
          provider: "phone",
        } as never,
        user: undefined as never,
        newSession: undefined,
        trigger: undefined,
      })
      expect(result.user.id).toBe("u1")
      expect(result.user.role).toBe("ADMIN")
      expect(result.user.provider).toBe("phone")
    })

    it("leaves provider undefined when token has no provider", async () => {
      const session = {
        user: { email: "a@b.com", name: "A" },
        expires: "2099-01-01",
      } as never
      const result = await authConfig.callbacks.session!({
        session,
        token: { id: "u1", role: "USER" } as never,
        user: undefined as never,
        newSession: undefined,
        trigger: undefined,
      })
      expect(result.user.id).toBe("u1")
      expect(result.user.role).toBe("USER")
      expect(result.user.provider).toBeUndefined()
    })
  })

  describe("authorized", () => {
    describe("/admin (回归)", () => {
      it("requires login", async () => {
        expect(callAuthorized("/admin", null)).toBe(false)
      })

      it("redirects non-admins to /", async () => {
        const result = callAuthorized("/admin", "TEACHER")
        expect(result).not.toBe(true)
        expect(redirectLocation(result)).toBe("http://localhost/")
      })

      it("allows admins", async () => {
        expect(callAuthorized("/admin", "ADMIN")).toBe(true)
      })
    })

    describe("/teacher (教师后台)", () => {
      it("requires login", async () => {
        // 未登录 → 返回 false,Auth.js 会自动跳转 pages.signIn (/login)
        expect(callAuthorized("/teacher", null)).toBe(false)
      })

      it("redirects USER to /", async () => {
        const result = callAuthorized("/teacher", "USER")
        expect(result).not.toBe(true)
        expect(redirectLocation(result)).toBe("http://localhost/")
      })

      it("allows TEACHER", async () => {
        expect(callAuthorized("/teacher", "TEACHER")).toBe(true)
      })

      it("allows ADMIN (可代管)", async () => {
        expect(callAuthorized("/teacher", "ADMIN")).toBe(true)
      })

      it("covers nested teacher routes", async () => {
        expect(callAuthorized("/teacher/circles", "TEACHER")).toBe(true)
        const blocked = callAuthorized("/teacher/activities", "USER")
        expect(redirectLocation(blocked)).toBe("http://localhost/")
      })

      it("does not affect unrelated routes", async () => {
        expect(callAuthorized("/", "USER")).toBe(true)
        expect(callAuthorized("/login", null)).toBe(true)
      })
    })
  })
})
