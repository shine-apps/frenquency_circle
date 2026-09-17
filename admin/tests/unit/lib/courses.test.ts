import { describe, expect, it, vi } from "vitest"

// lib/courses 同时导出落库函数,import 时会拉起 @/lib/db。
// 本文件只测纯函数,把 db 打成空壳,避免无 DATABASE_URL 时连接串报错。
vi.mock("@/lib/db", () => ({ db: {} }))

import {
  assertTeacherStatusTransition,
  buildCourseUpdatePatch,
  createCourseSchema,
  deriveSortOrder,
  toCourseDTO,
  toCourseLessonDTO,
  updateCourseSchema,
} from "@/lib/courses"
import { courseLessons, type CourseLesson, type Course } from "@/db/schema"

type CourseRow = Course
type LessonRow = CourseLesson

function makeCourseRow(overrides: Partial<CourseRow> = {}): CourseRow {
  return {
    id: "course-1",
    creatorId: "user-1",
    title: "太极拳入门",
    description: "从零开始学习太极拳的基础课程",
    coverImages: [],
    tags: [],
    status: "pending",
    reviewerId: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date("2026-09-15T00:00:00.000Z"),
    updatedAt: new Date("2026-09-15T00:00:00.000Z"),
    ...overrides,
  }
}

function makeLessonRow(overrides: Partial<LessonRow> = {}): LessonRow {
  return {
    id: "lesson-1",
    courseId: "course-1",
    title: "第一课：站桩",
    description: "",
    videoUrl: "https://cos.example.com/uploads/u1/v.mp4",
    durationSeconds: 600,
    sortOrder: 0,
    createdAt: new Date("2026-09-15T00:00:00.000Z"),
    updatedAt: new Date("2026-09-15T00:00:00.000Z"),
    ...overrides,
  }
}

/** 合法的创建入参(测试里按需覆写) */
const validCreateInput = {
  title: "太极拳入门",
  description: "从零开始学习太极拳的基础课程,共十二个课时",
  coverImages: ["https://cos.example.com/cover.jpg"],
  tags: ["太极拳"],
  lessons: [
    {
      title: "第一课：站桩",
      videoUrl: "https://cos.example.com/lesson-1.mp4",
    },
  ],
}

describe("createCourseSchema", () => {
  it("accepts a valid input", () => {
    const parsed = createCourseSchema.safeParse(validCreateInput)
    expect(parsed.success).toBe(true)
  })

  it("defaults coverImages / tags / lesson description / durationSeconds", () => {
    const parsed = createCourseSchema.parse({
      title: "太极拳入门",
      description: "从零开始学习太极拳的基础课程,共十二个课时",
      lessons: [{ title: "第一课", videoUrl: "https://cos.example.com/l.mp4" }],
    })
    expect(parsed.coverImages).toEqual([])
    expect(parsed.tags).toEqual([])
    expect(parsed.lessons[0].description).toBe("")
    expect(parsed.lessons[0].durationSeconds).toBeNull()
  })

  it("rejects a too short title", () => {
    const parsed = createCourseSchema.safeParse({ ...validCreateInput, title: "太" })
    expect(parsed.success).toBe(false)
  })

  it("rejects a too long title", () => {
    const parsed = createCourseSchema.safeParse({
      ...validCreateInput,
      title: "太".repeat(101),
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects a too short description", () => {
    const parsed = createCourseSchema.safeParse({
      ...validCreateInput,
      description: "太短",
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects a too long description", () => {
    const parsed = createCourseSchema.safeParse({
      ...validCreateInput,
      description: "长".repeat(5001),
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects dangerous html fragments in description", () => {
    const parsed = createCourseSchema.safeParse({
      ...validCreateInput,
      description: "<script>alert(1)</script>这是一段足够长的介绍文字",
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects empty lessons", () => {
    const parsed = createCourseSchema.safeParse({ ...validCreateInput, lessons: [] })
    expect(parsed.success).toBe(false)
  })

  it("rejects more lessons than the max", () => {
    const lessons = Array.from({ length: 31 }, (_, i) => ({
      title: `第${i + 1}课`,
      videoUrl: `https://cos.example.com/l${i}.mp4`,
    }))
    const parsed = createCourseSchema.safeParse({ ...validCreateInput, lessons })
    expect(parsed.success).toBe(false)
  })

  it("rejects a non-url lesson video", () => {
    const parsed = createCourseSchema.safeParse({
      ...validCreateInput,
      lessons: [{ title: "第一课", videoUrl: "not-a-url" }],
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects a lesson description longer than 500", () => {
    const parsed = createCourseSchema.safeParse({
      ...validCreateInput,
      lessons: [
        { title: "第一课", videoUrl: "https://cos.example.com/l.mp4", description: "长".repeat(501) },
      ],
    })
    expect(parsed.success).toBe(false)
  })

  it("rejects a negative durationSeconds", () => {
    const parsed = createCourseSchema.safeParse({
      ...validCreateInput,
      lessons: [
        { title: "第一课", videoUrl: "https://cos.example.com/l.mp4", durationSeconds: -1 },
      ],
    })
    expect(parsed.success).toBe(false)
  })
})

describe("updateCourseSchema", () => {
  it("accepts an empty object (all optional)", () => {
    const parsed = updateCourseSchema.safeParse({})
    expect(parsed.success).toBe(true)
  })

  it("rejects empty lessons when provided", () => {
    const parsed = updateCourseSchema.safeParse({ lessons: [] })
    expect(parsed.success).toBe(false)
  })

  it("rejects a teacher-forbidden status", () => {
    const parsed = updateCourseSchema.safeParse({ status: "rejected" })
    expect(parsed.success).toBe(false)
  })

  it("accepts active / offline status", () => {
    expect(updateCourseSchema.safeParse({ status: "active" }).success).toBe(true)
    expect(updateCourseSchema.safeParse({ status: "offline" }).success).toBe(true)
  })
})

describe("buildCourseUpdatePatch", () => {
  it("includes only provided fields plus updatedAt", () => {
    const patch = buildCourseUpdatePatch({ title: "新标题" })
    expect(patch.title).toBe("新标题")
    expect(patch.description).toBeUndefined()
    expect(patch.coverImages).toBeUndefined()
    expect(patch.status).toBeUndefined()
    expect(patch.updatedAt).toBeInstanceOf(Date)
  })

  it("keeps explicit empty coverImages (clearing the list)", () => {
    const patch = buildCourseUpdatePatch({ coverImages: [] })
    expect(patch.coverImages).toEqual([])
  })
})

describe("assertTeacherStatusTransition", () => {
  const matrix: [Course["status"], Course["status"], boolean][] = [
    ["active", "offline", true],
    ["offline", "active", true],
    ["pending", "active", false],
    ["pending", "offline", false],
    ["rejected", "active", false],
    ["rejected", "offline", false],
    ["deleted", "active", false],
    ["deleted", "offline", false],
    ["active", "active", false],
    ["offline", "offline", false],
  ]

  it.each(matrix)("allows %s -> %s to be %s", (current, next, expected) => {
    expect(assertTeacherStatusTransition(current, next)).toBe(expected)
  })
})

describe("deriveSortOrder", () => {
  it("derives array index as sort order", () => {
    expect(deriveSortOrder([1, 2, 3].map((n) => ({
      title: `第${n}课`,
      description: "",
      videoUrl: "https://cos.example.com/l.mp4",
      durationSeconds: null,
    })))).toEqual([0, 1, 2])
    expect(deriveSortOrder([])).toEqual([])
  })
})

describe("toCourseLessonDTO", () => {
  it("projects timestamps to ISO strings and defaults description", () => {
    const dto = toCourseLessonDTO(makeLessonRow())
    expect(dto.id).toBe("lesson-1")
    expect(dto.description).toBe("")
    expect(dto.videoUrl).toBe("https://cos.example.com/uploads/u1/v.mp4")
    expect(dto.durationSeconds).toBe(600)
    expect(dto.sortOrder).toBe(0)
  })

  it("keeps a provided description and null duration", () => {
    const dto = toCourseLessonDTO(
      makeLessonRow({ description: "本课要点", durationSeconds: null })
    )
    expect(dto.description).toBe("本课要点")
    expect(dto.durationSeconds).toBeNull()
  })
})

describe("toCourseDTO", () => {
  it("projects timestamps to ISO strings and derives lessonCount", () => {
    // 数据库里 text[] 默认 '{}' 不会是 NULL,但 DTO 仍做兜底(与 circles 一致)
    const row = makeCourseRow({
      coverImages: null as unknown as string[],
      tags: null as unknown as string[],
    })
    const dto = toCourseDTO(row, [toCourseLessonDTO(makeLessonRow())])
    expect(dto.createdAt).toBe("2026-09-15T00:00:00.000Z")
    expect(dto.updatedAt).toBe("2026-09-15T00:00:00.000Z")
    expect(dto.coverImages).toEqual([])
    expect(dto.tags).toEqual([])
    expect(dto.lessons).toHaveLength(1)
    expect(dto.lessonCount).toBe(1)
    expect(dto.reviewedAt).toBeNull()
    expect(dto.reviewNote).toBeNull()
  })

  it("uses an explicit lessonCount when lessons are not loaded", () => {
    const dto = toCourseDTO(makeCourseRow(), [], 7)
    expect(dto.lessons).toEqual([])
    expect(dto.lessonCount).toBe(7)
  })

  it("projects reviewedAt to ISO when reviewed", () => {
    const dto = toCourseDTO(
      makeCourseRow({
        status: "active",
        reviewerId: "admin-1",
        reviewedAt: new Date("2026-09-16T08:00:00.000Z"),
        reviewNote: "已通过",
      })
    )
    expect(dto.reviewedAt).toBe("2026-09-16T08:00:00.000Z")
    expect(dto.reviewNote).toBe("已通过")
    expect(dto.status).toBe("active")
  })
})

describe("courseLessons schema columns", () => {
  it("exposes the lesson columns used by DTO mapping", () => {
    const cols = Object.keys(courseLessons)
    expect(cols).toEqual(
      expect.arrayContaining(["courseId", "title", "description", "videoUrl", "durationSeconds", "sortOrder"])
    )
  })
})
