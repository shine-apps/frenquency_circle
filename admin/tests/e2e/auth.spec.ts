import { test, expect } from "@playwright/test"

test.describe("auth flow", () => {
  test("unauthenticated user is redirected to /login when accessing /admin", async ({
    page,
  }) => {
    await page.goto("/admin")
    await expect(page).toHaveURL(/\/login/)
  })

  test("user can sign in with valid credentials and reach /admin", async ({
    page,
  }) => {
    await page.goto("/login")
    await expect(page.getByText("后台登录")).toBeVisible()

    await page.getByLabel("邮箱").fill("admin@example.com")
    await page.getByLabel("密码").fill("admin123")
    await page.getByRole("button", { name: "登录" }).click()

    await page.waitForURL(/\/admin/, { timeout: 15_000 })
    await expect(page.getByText("Dashboard")).toBeVisible()
  })
})
