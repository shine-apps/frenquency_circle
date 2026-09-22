import { describe, expect, it } from "vitest"
import {
  users,
  accounts,
  circles,
  checkins,
  smsVerificationCodes,
  notifications,
  interestEvents,
  courses,
  courseLessons,
  CHECKIN_STATUSES,
  COURSE_STATUSES,
  INTEREST_EVENT_TYPES,
  type UserRole,
  type CheckinStatus,
  type CourseStatus,
  type NotificationType,
  type NotificationLinkTarget,
  type NotificationEntityType,
  type InterestEventType,
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

  it("exports interestEvents table", () => {
    expect(interestEvents).toBeDefined()
  })

  it("interestEvents table has the expected columns", () => {
    const cols = Object.keys(interestEvents)
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "userId",
        "tagName",
        "eventType",
        "eventDate",
        "score",
        "createdAt",
      ])
    )
  })

  it("InterestEventType covers the three event sources", () => {
    const t: InterestEventType = "hobby_tag_save"
    expect(t).toBe("hobby_tag_save")
    const t2: InterestEventType = "tag_search"
    expect(t2).toBe("tag_search")
    const t3: InterestEventType = "circle_tag_create"
    expect(t3).toBe("circle_tag_create")
  })

  it("INTEREST_EVENT_TYPES contains exactly three types", () => {
    expect(INTEREST_EVENT_TYPES).toEqual([
      "hobby_tag_save",
      "tag_search",
      "circle_tag_create",
    ])
  })

  it("exports checkins table", () => {
    expect(checkins).toBeDefined()
  })

  it("checkins table has the expected columns", () => {
    const cols = Object.keys(checkins)
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "userId",
        "content",
        "circleId",
        "tags",
        "images",
        "videoUrl",
        "status",
        "createdAt",
        "updatedAt",
      ])
    )
  })

  it("CheckinStatus covers active and deleted", () => {
    const s: CheckinStatus = "active"
    expect(s).toBe("active")
    const s2: CheckinStatus = "deleted"
    expect(s2).toBe("deleted")
  })

  it("CHECKIN_STATUSES contains exactly two statuses", () => {
    expect(CHECKIN_STATUSES).toEqual(["active", "deleted"])
  })

  it("exports courses table with expected columns", () => {
    const cols = Object.keys(courses)
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "creatorId",
        "title",
        "description",
        "coverImages",
        "tags",
        "status",
        "reviewerId",
        "reviewedAt",
        "reviewNote",
        "createdAt",
        "updatedAt",
      ])
    )
  })

  it("exports courseLessons table with description", () => {
    const cols = Object.keys(courseLessons)
    expect(cols).toEqual(
      expect.arrayContaining([
        "id",
        "courseId",
        "title",
        "description",
        "videoUrl",
        "durationSeconds",
        "sortOrder",
        "createdAt",
        "updatedAt",
      ])
    )
  })

  it("COURSE_STATUSES has exactly five statuses", () => {
    expect(COURSE_STATUSES).toEqual([
      "pending",
      "active",
      "offline",
      "rejected",
      "deleted",
    ])
    const s: CourseStatus = "pending"
    expect(s).toBe("pending")
  })
})
