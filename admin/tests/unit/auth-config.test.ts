import { describe, expect, it } from "vitest"
import { authConfig } from "@/auth.config"

/**
 * 直接测试 authConfig.callbacks 的 jwt 与 session 回调行为。
 * 这些回调是纯函数，可直接调用，无需启动 NextAuth。
 */

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
})
