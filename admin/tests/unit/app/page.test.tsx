import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { ReactElement } from "react"

/**
 * app/page.tsx 的 Home 组件测试。
 * 重点验证：已登录非管理员不再被重定向到 /admin（避免 / ↔ /admin 死循环），
 * 而是渲染一个「无访问权限」页面。
 */

const { authMock, redirectMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  redirectMock: vi.fn(),
}))

vi.mock("@/auth", () => ({ auth: authMock }))
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    redirectMock(path)
    // 模拟 Next.js redirect() 的「抛错中止渲染」语义
    const err = new Error(`NEXT_REDIRECT:${path}`)
    ;(err as Error & { path: string }).path = path
    throw err
  },
}))

import Home from "@/app/page"

describe("app/page (Home)", () => {
  beforeEach(() => {
    authMock.mockReset()
    redirectMock.mockClear()
  })

  it("redirects unauthenticated users to /login", async () => {
    authMock.mockResolvedValue(null)
    await expect(Home()).rejects.toMatchObject({ path: "/login" })
    expect(redirectMock).toHaveBeenCalledWith("/login")
  })

  it("redirects admins to /admin", async () => {
    authMock.mockResolvedValue({
      user: { id: "u1", role: "ADMIN", email: "a@b.com", name: "A" },
      expires: "2099-01-01",
    })
    await expect(Home()).rejects.toMatchObject({ path: "/admin" })
    expect(redirectMock).toHaveBeenCalledWith("/admin")
  })

  it("renders a no-access page for logged-in non-admins (no redirect, breaks the loop)", async () => {
    authMock.mockResolvedValue({
      user: { id: "u2", role: "USER", email: "c@d.com", name: "C" },
      expires: "2099-01-01",
    })
    const el = (await Home()) as ReactElement
    // 关键断言：不应触发任何 redirect（避免与 admin/layout 形成死循环）
    expect(redirectMock).not.toHaveBeenCalled()
    render(el)
    expect(screen.getByText("无访问权限")).toBeInTheDocument()
  })
})
