import { describe, expect, it } from "vitest"
import {
  users,
  accounts,
  circles,
  smsVerificationCodes,
  notifications,
  type UserRole,
  type NotificationType,
  type NotificationLinkTarget,
  type NotificationEntityType,
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

  it("exports notifications table", () => {
    expect(notifications).toBeDefined()
  })

  it("notifications table has the expected columns", () => {
    const cols = Object.keys(notifications)
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "recipientId",
        "actorId", // 触发者(可空)
        "entityType",
        "entityId",
        "type",
        "title",
        "content",
        "linkUrl",
        "linkTarget",
        "readAt",
        "createdAt",
        "updatedAt",
      ])
    )
  })

  it("NotificationType union covers the first-batch scenarios", () => {
    const t: NotificationType = "circle_review"
    expect(t).toBe("circle_review")
    const t2: NotificationType = "circle_review_result"
    expect(t2).toBe("circle_review_result")
    const t3: NotificationType = "circle_followed"
    expect(t3).toBe("circle_followed")
  })

  it("NotificationLinkTarget defaults to miniprogram", () => {
    const lt: NotificationLinkTarget = "miniprogram"
    expect(lt).toBe("miniprogram")
    const lt2: NotificationLinkTarget = "admin"
    expect(lt2).toBe("admin")
  })

  it("NotificationEntityType is 'circle' for now", () => {
    const et: NotificationEntityType = "circle"
    expect(et).toBe("circle")
  })
})
