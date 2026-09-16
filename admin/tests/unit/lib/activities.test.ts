import { describe, expect, it, vi } from "vitest"

// lib/activities 现在还导出落库函数(createActivity 等),import 时会拉起 @/lib/db。
// 本文件只测纯函数,这里把 db 打成空壳,避免无 DATABASE_URL 时连接串报错。
vi.mock("@/lib/db", () => ({ db: {} }))

import {
  toActivityDTO,
  createActivitySchema,
  buildActivityUpdatePatch,
  updateActivitySchema,
} from "@/lib/activities"
import type { activities } from "@/db/schema"

/**
 * 活动共享层单测。
 *
 * `toActivityDTO` 原在两个路由(app/api/activities 的列表与详情)各有一份副本,
 * 抽取到 lib 后由单测锁定投影契约,避免字段漂移。
 */

type ActivityRow = typeof activities.$inferSelect

function makeActivityRow(overrides: Partial<ActivityRow> = {}): ActivityRow {
  return {
    id: overrides.id ?? "activity-1",
    creatorId: overrides.creatorId ?? "user-1",
    title: overrides.title ?? "社区太极展演",
    description: overrides.description ?? "<p>欢迎参加</p>",
    startTime: overrides.startTime ?? new Date("2026-09-01T10:00:00.000Z"),
    registrationDeadline:
      overrides.registrationDeadline ?? new Date("2026-08-25T10:00:00.000Z"),
    contactPhone: overrides.contactPhone ?? "13800138000",
    coverImages: overrides.coverImages ?? [],
    status: overrides.status ?? "active",
    createdAt: overrides.createdAt ?? new Date("2026-08-20T00:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-08-20T00:00:00.000Z"),
  }
}

describe("toActivityDTO", () => {
  it("projects timestamps to ISO strings", () => {
    const dto = toActivityDTO(makeActivityRow())
    expect(dto.startTime).toBe("2026-09-01T10:00:00.000Z")
    expect(dto.registrationDeadline).toBe("2026-08-25T10:00:00.000Z")
    expect(dto.createdAt).toBe("2026-08-20T00:00:00.000Z")
    expect(dto.updatedAt).toBe("2026-08-20T00:00:00.000Z")
  })

  it("keeps scalar fields as-is", () => {
    const dto = toActivityDTO(makeActivityRow())
    expect(dto.id).toBe("activity-1")
    expect(dto.creatorId).toBe("user-1")
    expect(dto.title).toBe("社区太极展演")
    expect(dto.description).toBe("<p>欢迎参加</p>")
    expect(dto.contactPhone).toBe("13800138000")
    expect(dto.status).toBe("active")
  })

  it("falls back to empty array when coverImages is null", () => {
    const row = makeActivityRow()
    // 历史数据可能存在 null(列默认值为空数组,但防御性兜底)
    const dto = toActivityDTO({ ...row, coverImages: null as unknown as string[] })
    expect(dto.coverImages).toEqual([])
  })

  it("preserves coverImages when present", () => {
    const coverImages = ["https://cdn.example.com/a.png"]
    const dto = toActivityDTO(makeActivityRow({ coverImages }))
    expect(dto.coverImages).toEqual(coverImages)
  })

  it("keeps contactPhone null when absent", () => {
    // 注意:makeActivityRow 用 ?? 兜底,显式 null 会被吞掉,这里直接覆写整行
    const dto = toActivityDTO({ ...makeActivityRow(), contactPhone: null })
    expect(dto.contactPhone).toBeNull()
  })
})

describe("createActivitySchema (回归)", () => {
  const VALID = {
    title: "社区太极展演",
    description: "<p>欢迎参加</p>",
    startTime: "2026-09-01T10:00:00.000Z",
    registrationDeadline: "2026-08-25T10:00:00.000Z",
  }

  it("accepts a valid payload", () => {
    expect(createActivitySchema.safeParse(VALID).success).toBe(true)
  })

  it("rejects deadline not earlier than startTime", () => {
    const result = createActivitySchema.safeParse({
      ...VALID,
      startTime: "2026-08-20T10:00:00.000Z",
      registrationDeadline: "2026-08-25T10:00:00.000Z",
    })
    expect(result.success).toBe(false)
  })
})

describe("buildActivityUpdatePatch", () => {
  it("only includes provided fields (并总是刷新 updatedAt)", () => {
    const patch = buildActivityUpdatePatch({ title: "新标题" })
    expect(patch.title).toBe("新标题")
    expect(patch.updatedAt).toBeInstanceOf(Date)
    // 未提供的字段不能出现在补丁里,否则会被写成 undefined 覆盖原值
    expect("description" in patch).toBe(false)
    expect("coverImages" in patch).toBe(false)
    expect("contactPhone" in patch).toBe(false)
  })

  it("converts ISO strings to Date", () => {
    const patch = buildActivityUpdatePatch({
      startTime: "2026-09-01T10:00:00.000Z",
      registrationDeadline: "2026-08-25T10:00:00.000Z",
    })
    expect(patch.startTime).toBeInstanceOf(Date)
    expect(patch.registrationDeadline).toBeInstanceOf(Date)
  })

  it("turns an empty contactPhone into null (清空)", () => {
    const patch = buildActivityUpdatePatch({ contactPhone: "" })
    expect(patch.contactPhone).toBeNull()
  })

  it("keeps a non-empty contactPhone", () => {
    const patch = buildActivityUpdatePatch({ contactPhone: "13800138000" })
    expect(patch.contactPhone).toBe("13800138000")
  })

  it("replaces coverImages wholesale", () => {
    const covers = ["https://cdn.example.com/a.png"]
    expect(buildActivityUpdatePatch({ coverImages: covers }).coverImages).toEqual(covers)
    expect(buildActivityUpdatePatch({ coverImages: [] }).coverImages).toEqual([])
  })
})

describe("updateActivitySchema (回归)", () => {
  it("keeps an empty contactPhone as empty string so callers can clear it", () => {
    const result = updateActivitySchema.safeParse({ contactPhone: "" })
    expect(result.success).toBe(true)
    if (!result.success) return
    // 不能 transform 成 undefined:那会让 PATCH 静默跳过「清空联系方式」
    expect(result.data.contactPhone).toBe("")
  })
})
