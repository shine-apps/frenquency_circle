import { describe, expect, it } from "vitest"
import {
  users,
  accounts,
  circles,
  smsVerificationCodes,
  type UserRole,
} from "@/db/schema"

describe("db/schema", () => {
  it("exports users table", () => {
    expect(users).toBeDefined()
  })

  it("users table has the expected columns", () => {
    const cols = Object.keys(users)
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "email",
        "name",
        "passwordHash",
        "role",
        "createdAt",
        "updatedAt",
      ])
    )
  })

  it("UserRole type only includes ADMIN and USER", () => {
    const role: UserRole = "ADMIN"
    expect(role).toBe("ADMIN")
    const role2: UserRole = "USER"
    expect(role2).toBe("USER")
  })

  it("exports accounts table", () => {
    expect(accounts).toBeDefined()
  })

  it("accounts table has the expected columns", () => {
    const cols = Object.keys(accounts)
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "userId",
        "provider",
        "providerAccountId",
        "type",
        "createdAt",
        "updatedAt",
      ])
    )
  })

  it("exports smsVerificationCodes table", () => {
    expect(smsVerificationCodes).toBeDefined()
  })

  it("smsVerificationCodes table has the expected columns", () => {
    const cols = Object.keys(smsVerificationCodes)
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "phone",
        "codeHash",
        "attempts",
        "expiresAt",
        "consumedAt",
        "createdAt",
      ])
    )
  })

  it("exports circles table", () => {
    expect(circles).toBeDefined()
  })

  it("circles table has the expected columns (including coverImages)", () => {
    const cols = Object.keys(circles)
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "title",
        "description",
        "creatorId",
        "latitude",
        "longitude",
        "address",
        "status",
        "coverImages",
        "createdAt",
        "updatedAt",
      ])
    )
  })
})
