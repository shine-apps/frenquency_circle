# 视频课程子系统 Implementation Plan

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement.

**Goal:** 教师 / 管理员在 Web 后台创建与审核「视频课程」(课程 + 多课时),所有图片与视频统一 COS 直传。

**Architecture:** 数据层 `courses` + `course_lessons` 两表(Drizzle);业务逻辑集中在 `lib/courses.ts`(schema/DTO/事务化落库/状态机),路由只做薄壳;上传层复用既有 `GET /api/upload/cos-credentials`,新增 admin 侧客户端直传实现,`CoverImagesField` 换内部实现实现"图片统一 COS 直传"。

**Tech Stack:** Next.js 16 App Router、Auth.js v5(cookie session)、Drizzle ORM(Postgres)、zod、vitest、`cos-js-sdk-v5`(动态 import)。

**设计文档:** `docs/plans/2026-09-16-video-course-design.md`(rev.2)

**与设计文档的偏差(实现时确定的简化,已回写设计文档):**
1. 列表页 SSR 直接加载全部课时(`inArray` 一次查出),`lessonCount` 直接取 `lessons.length` —— 不再需要单独的聚合 count 查询,API 面保持 4 个端点不变;
2. `lesson.editor` 的排序由**数组下标派生**(`sortOrder = index`),客户端不上传 sortOrder 字段;
3. 管理端 PATCH 写 `reviewerId` / `reviewedAt` 对所有状态变更生效(不仅是审核场景),作为审计字段。

---

## Task 1: 数据表与迁移

**Files:**
- Modify: `admin/db/schema.ts`(追加在 `checkins` 之后)
- Test: `admin/tests/unit/db/schema.test.ts`(追加 describe)
- Generate: `admin/drizzle/00XX_*.sql`

**Step 1.1 — 写失败测试**(追加到 `tests/unit/db/schema.test.ts`,import 区新增 `courses, courseLessons, COURSE_STATUSES, type CourseStatus`):

```ts
  it("exports courses table with expected columns", () => {
    const cols = Object.keys(courses)
    expect(cols).toEqual(
      expect.arrayContaining([
        "id", "creatorId", "title", "description", "coverImages", "tags",
        "status", "reviewerId", "reviewedAt", "reviewNote", "createdAt", "updatedAt",
      ])
    )
  })

  it("exports courseLessons table with description", () => {
    const cols = Object.keys(courseLessons)
    expect(cols).toEqual(
      expect.arrayContaining([
        "id", "courseId", "title", "description", "videoUrl",
        "durationSeconds", "sortOrder", "createdAt", "updatedAt",
      ])
    )
  })

  it("COURSE_STATUSES has exactly five statuses", () => {
    expect(COURSE_STATUSES).toEqual(["pending", "active", "offline", "rejected", "deleted"])
    const s: CourseStatus = "pending"
    expect(s).toBe("pending")
  })
```

**Step 1.2 — 实现 schema**(追加到 `admin/db/schema.ts` 末尾):

```ts
// ============================================================================
// 视频课程模块(courses / course_lessons)
// ============================================================================

/**
 * 课程状态字面量联合:
 * - `pending`  待审核(新建默认,管理员审核通过前不可见)
 * - `active`   已上线(审核通过,或教师 / 管理员恢复上线)
 * - `offline`  已下线(教师自主下线,或管理员下线 —— 两种来源共用同一状态)
 * - `rejected` 审核驳回(教师可修改内容,重新上线需管理员放行)
 * - `deleted`  创建者软删除(终态)
 *
 * 与 CIRCLE_STATUSES 同构,但不含 `violated`:对课程而言"管理员下线"与
 * `offline` 是同一可观察状态,不引入语义重叠。沿用项目 `text + TS 联合` 惯例。
 */
export const COURSE_STATUSES = ["pending", "active", "offline", "rejected", "deleted"] as const
export type CourseStatus = (typeof COURSE_STATUSES)[number]

/**
 * 视频课程(主表,由 TEACHER / ADMIN 创建)。
 *
 * - `tags` 存 hobby_tags.name 名称快照(与 circles / checkins 惯例一致,不设外键);
 * - `coverImages` 为 COS 直传后的公网 URL 数组(0-9 张);
 * - 审核字段(reviewerId / reviewedAt / reviewNote)由管理员 PATCH 时写入。
 */
export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 课程标题(2-100 字) */
    title: text("title").notNull(),
    /** 课程简介(纯文本,10-5000 字,落库前过危险片段守卫) */
    description: text("description").notNull(),
    /** 封面 / 轮播图 URL 数组(0-9 张,默认空数组) */
    coverImages: text("cover_images").array().notNull().default(sql`'{}'::text[]`),
    /** 兴趣标签名称数组(存 hobby_tags.name,0-5 个) */
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    status: text("status").$type<CourseStatus>().notNull().default("pending"),
    /** 审核人(可空,管理员操作时写入) */
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    /** 审核时间(可空) */
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** 审核备注 / 驳回原因(可空,≤500) */
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // 教师后台主路径:按创建者 + 状态过滤
    index("courses_creator_status_idx").on(table.creatorId, table.status),
    // 管理后台按状态筛选 + 时间倒序
    index("courses_status_created_idx").on(table.status, table.createdAt),
    // 数组包含查询 "标签 X ∈ courses.tags" 走 GIN 索引
    index("courses_tags_gin_idx").using("gin", table.tags),
  ]
)

export type Course = typeof courses.$inferSelect
export type NewCourse = typeof courses.$inferInsert

/**
 * 课程课时(从表,一个课程 1-30 个,数量约束在应用层)。
 * 课程删除时级联删除课时(`onDelete: cascade`)。
 */
export const courseLessons = pgTable(
  "course_lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    /** 课时标题(1-100 字) */
    title: text("title").notNull(),
    /** 课时简介(可选填,≤500 字,默认空串) */
    description: text("description").notNull().default(""),
    /** 课时视频 COS 公网 URL */
    videoUrl: text("video_url").notNull(),
    /** 视频时长(秒,可空;浏览器 onLoadedMetadata 探测后写入) */
    durationSeconds: integer("duration_seconds"),
    /** 排序(由提交顺序派生,0 起) */
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // 读路径:课程详情 / 编辑按课程 + 排序取课时
    index("course_lessons_course_sort_idx").on(table.courseId, table.sortOrder),
    // 约束:时长非负
    check(
      "course_lessons_duration_check",
      sql`"duration_seconds" is null or "duration_seconds" >= 0`
    ),
    // 约束:排序非负
    check("course_lessons_sort_order_check", sql`"sort_order" >= 0`),
  ]
)

export type CourseLesson = typeof courseLessons.$inferSelect
export type NewCourseLesson = typeof courseLessons.$inferInsert
```

**Step 1.3 — 跑测试**
```bash
cd admin && node node_modules/vitest/vitest.mjs run tests/unit/db/schema.test.ts --reporter=dot
```
Expected: PASS。

**Step 1.4 — 生成并人工审阅迁移**
```bash
cd admin && pnpm db:generate
```
人工核对生成的 SQL:两张 `CREATE TABLE`、3 个索引、2 个 CHECK、外键 `cascade` / `set null` 正确,然后 `pnpm db:migrate`。

---

## Task 2: 表单限额常量

**Files:**
- Modify: `admin/lib/form-limits.ts`(追加常量)

```ts
/** 课程标题长度上限 */
export const COURSE_TITLE_MAX = 100
/** 课程简介长度上限 */
export const COURSE_DESCRIPTION_MAX = 5000
/** 课程审核备注长度上限 */
export const COURSE_REVIEW_NOTE_MAX = 500
/** 单个课程课时数上限 */
export const COURSE_LESSONS_MAX = 30
/** 课时标题长度上限 */
export const LESSON_TITLE_MAX = 100
/** 课时简介长度上限 */
export const LESSON_DESCRIPTION_MAX = 500
/** 单个课时视频体积上限(MB),客户端预校验避免超大文件白传 */
export const COURSE_VIDEO_MAX_MB = 500
```

无独立测试(纯常量,由 Task 3 的 zod 上限测试间接覆盖)。

---

## Task 3: `lib/courses.ts`(校验 / DTO / 落库 / 状态机)

**Files:**
- Create: `admin/lib/courses.ts`
- Modify: `admin/lib/logger.ts`(LOG_PREFIX 追加 `COURSE: "COURSE"`)
- Modify: `admin/types/api.ts`(追加 DTO)
- Test: `admin/tests/unit/lib/courses.test.ts`

**Step 3.1 — 写失败测试** `tests/unit/lib/courses.test.ts`(无需 mock db,只测纯函数;zod 独立):

覆盖点:
1. `createCourseSchema`:合法输入通过;title 1 字 / 101 字拒绝;description 9 字拒绝 / 5001 字拒绝 / 含 `<script` 拒绝;lessons 空数组拒绝 / 31 个拒绝;lesson.videoUrl 非 URL 拒绝;lesson.description 501 字拒绝;lesson.description 缺省 → `""`;durationSeconds 为负数拒绝;
2. `updateCourseSchema`:空对象通过(全可选);lessons 提供但为空数组拒绝;status 仅接受 `active|offline`;
3. `buildCourseUpdatePatch`:只含已提供字段 + `updatedAt`;未提供字段不出现在结果里;
4. `assertTeacherStatusTransition` 全状态矩阵:`active→offline` true / `offline→active` true / `pending→active` false / `pending→offline` false / `rejected→active` false / `deleted→*` false / 同态 false;
5. `toCourseLessonDTO` / `toCourseDTO`:时间 ISO 化、`coverImages` / `tags` 兜底空数组、`lessonCount` 取 `lessons.length`、`lessonCount` 用显式入参覆盖、`description` 兜底空串;
6. `deriveSortOrder`:输入数组顺序 → `[0,1,2...]`。

**Step 3.2 — 实现** `admin/lib/courses.ts`:

```ts
import { z } from "zod"
import { asc, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { courseLessons, courses, type CourseStatus } from "@/db/schema"
import {
  CIRCLE_TAGS_MAX,
  COVER_IMAGES_MAX,
  COURSE_DESCRIPTION_MAX,
  COURSE_LESSONS_MAX,
  COURSE_REVIEW_NOTE_MAX,
  COURSE_TITLE_MAX,
  LESSON_DESCRIPTION_MAX,
  LESSON_TITLE_MAX,
} from "@/lib/form-limits"
import type { CourseDTO, CourseLessonDTO } from "@/types/api"

/** 课程简介危险片段守卫(与 lib/activities.ts 同款正则) */
const DANGEROUS_HTML = /<script|<iframe| on\w+\s*=|javascript:/i

export const courseDescriptionSchema = z
  .string()
  .trim()
  .min(10, "课程简介至少 10 字")
  .max(COURSE_DESCRIPTION_MAX, `课程简介过长(上限 ${COURSE_DESCRIPTION_MAX} 字)`)
  .refine((v) => !DANGEROUS_HTML.test(v), {
    message: "课程简介包含不允许的内容(脚本/iframe/内联事件)",
  })

const coverImagesSchema = z
  .array(z.string().url("封面图片需为有效 URL"))
  .max(COVER_IMAGES_MAX, `封面图片最多 ${COVER_IMAGES_MAX} 张`)

const tagsSchema = z
  .array(z.string().trim().min(1, "标签不能为空").max(50, "标签过长"))
  .max(CIRCLE_TAGS_MAX, `兴趣标签最多 ${CIRCLE_TAGS_MAX} 个`)

/**
 * 课时输入。`sortOrder` 不由客户端提交,由提交顺序派生(见 deriveSortOrder)。
 */
export const courseLessonInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "课时标题不能为空")
    .max(LESSON_TITLE_MAX, `课时标题过长(上限 ${LESSON_TITLE_MAX} 字)`),
  description: z
    .string()
    .trim()
    .max(LESSON_DESCRIPTION_MAX, `课时简介过长(上限 ${LESSON_DESCRIPTION_MAX} 字)`)
    .default(""),
  /** COS 直传后的公网 URL */
  videoUrl: z.string().url("课时视频需为有效 URL"),
  durationSeconds: z
    .number()
    .int("视频时长必须是整数")
    .min(0, "视频时长不能为负")
    .max(24 * 3600, "视频时长过长")
    .nullable()
    .default(null),
})

export type CourseLessonInput = z.infer<typeof courseLessonInputSchema>

const lessonsSchema = z
  .array(courseLessonInputSchema)
  .min(1, "至少需要 1 个课时")
  .max(COURSE_LESSONS_MAX, `课时最多 ${COURSE_LESSONS_MAX} 个`)

/** 创建课程输入(status 恒为 pending,不接受客户端指定) */
export const createCourseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "课程标题至少 2 字")
    .max(COURSE_TITLE_MAX, `课程标题过长(上限 ${COURSE_TITLE_MAX} 字)`),
  description: courseDescriptionSchema,
  coverImages: coverImagesSchema.default([]),
  tags: tagsSchema.default([]),
  lessons: lessonsSchema,
})

export type CreateCourseInput = z.infer<typeof createCourseSchema>

/** 更新课程输入(全可选;lessons 提供即全量替换,status 见 teacherCourseStatusSchema) */
export const updateCourseSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "课程标题至少 2 字")
    .max(COURSE_TITLE_MAX, `课程标题过长(上限 ${COURSE_TITLE_MAX} 字)`)
    .optional(),
  description: courseDescriptionSchema.optional(),
  coverImages: coverImagesSchema.optional(),
  tags: tagsSchema.optional(),
  lessons: lessonsSchema.optional(),
  status: z.enum(["active", "offline"]).optional(),
})

export type UpdateCourseInput = z.infer<typeof updateCourseSchema>

/** 管理端状态流转入参(deleted 由创建者 DELETE 触发,pending 由创建时自动设置) */
export const adminCourseStatusSchema = z.object({
  status: z.enum(["active", "offline", "rejected"]),
  reviewNote: z
    .string()
    .trim()
    .max(COURSE_REVIEW_NOTE_MAX, `审核备注过长(上限 ${COURSE_REVIEW_NOTE_MAX} 字)`)
    .optional(),
})

/** 教师可发起的状态流转(只允许在已上线的课程间上下线) */
const TEACHER_TRANSITIONS: Record<CourseStatus, CourseStatus[]> = {
  pending: [],
  active: ["offline"],
  offline: ["active"],
  rejected: [],
  deleted: [],
}

/**
 * 教师侧状态流转守卫。
 * 返回 false 的场景(调用方回 403):
 * - 把 `pending` 变 `active`(绕过审核);
 * - 把 `rejected` 变 `active`(需管理员重新放行);
 * - 对 `deleted` 的任何操作(终态)。
 */
export function assertTeacherStatusTransition(
  current: CourseStatus,
  next: CourseStatus
): boolean {
  return TEACHER_TRANSITIONS[current]?.includes(next) ?? false
}

/** 提交顺序 → sortOrder(表单即真相,数组下标即展示顺序) */
export function deriveSortOrder(lessons: CourseLessonInput[]): number[] {
  return lessons.map((_, index) => index)
}

/** 课时行 → DTO */
export function toCourseLessonDTO(row: typeof courseLessons.$inferSelect): CourseLessonDTO {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    videoUrl: row.videoUrl,
    durationSeconds: row.durationSeconds ?? null,
    sortOrder: row.sortOrder,
  }
}

/**
 * 课程行 → DTO。
 * - `lessons` 由调用方传入(编辑 / 详情场景加载了课时;列表场景也已加载);
 * - `lessonCount` 默认取 lessons 数量,列表只想要计数时可显式传入。
 */
export function toCourseDTO(
  row: typeof courses.$inferSelect,
  lessons: CourseLessonDTO[] = [],
  lessonCount?: number
): CourseDTO {
  return {
    id: row.id,
    creatorId: row.creatorId,
    title: row.title,
    description: row.description,
    coverImages: row.coverImages ?? [],
    tags: row.tags ?? [],
    status: row.status,
    lessons,
    lessonCount: lessonCount ?? lessons.length,
    reviewNote: row.reviewNote ?? null,
    reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** 由部分更新入参构造 `update().set()` 的补丁(仅含已提供字段 + updatedAt) */
export function buildCourseUpdatePatch(
  input: UpdateCourseInput
): Partial<typeof courses.$inferInsert> {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.coverImages !== undefined ? { coverImages: input.coverImages } : {}),
    ...(input.tags !== undefined ? { tags: input.tags } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
    updatedAt: new Date(),
  }
}

/** 创建课程(事务:课程 + 课时同成败),status 恒为 pending */
export async function createCourse(params: {
  creatorId: string
  input: CreateCourseInput
}): Promise<{
  course: typeof courses.$inferSelect
  lessons: (typeof courseLessons.$inferSelect)[]
}> {
  const { creatorId, input } = params
  return db.transaction(async (tx) => {
    const [course] = await tx
      .insert(courses)
      .values({
        creatorId,
        title: input.title,
        description: input.description,
        coverImages: input.coverImages ?? [],
        tags: input.tags ?? [],
        status: "pending",
      })
      .returning()

    const lessonRows = await tx
      .insert(courseLessons)
      .values(
        input.lessons.map((lesson, index) => ({
          courseId: course.id,
          title: lesson.title,
          description: lesson.description ?? "",
          videoUrl: lesson.videoUrl,
          durationSeconds: lesson.durationSeconds ?? null,
          sortOrder: index,
        }))
      )
      .returning()

    return { course, lessons: lessonRows }
  })
}

/**
 * 更新课程(事务)。`lessons` 提供时全量替换(删旧插新),顺序按数组下标。
 */
export async function updateCourse(params: {
  courseId: string
  patch: Partial<typeof courses.$inferInsert>
  lessons?: CourseLessonInput[]
}): Promise<{
  course: typeof courses.$inferSelect
  lessons: (typeof courseLessons.$inferSelect)[]
}> {
  const { courseId, patch, lessons } = params
  return db.transaction(async (tx) => {
    const [course] = await tx
      .update(courses)
      .set(patch)
      .where(eq(courses.id, courseId))
      .returning()

    let lessonRows = await tx
      .select()
      .from(courseLessons)
      .where(eq(courseLessons.courseId, courseId))
      .orderBy(asc(courseLessons.sortOrder))

    if (lessons) {
      await tx.delete(courseLessons).where(eq(courseLessons.courseId, courseId))
      if (lessons.length > 0) {
        lessonRows = await tx
          .insert(courseLessons)
          .values(
            lessons.map((lesson, index) => ({
              courseId,
              title: lesson.title,
              description: lesson.description ?? "",
              videoUrl: lesson.videoUrl,
              durationSeconds: lesson.durationSeconds ?? null,
              sortOrder: index,
            }))
          )
          .returning()
      } else {
        lessonRows = []
      }
    }

    return { course, lessons: lessonRows }
  })
}

/** 软删除课程(status=deleted,终态);归属校验由调用方完成 */
export async function softDeleteCourse(courseId: string): Promise<void> {
  await db
    .update(courses)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(eq(courses.id, courseId))
}

/** 按课程加载课时(按 sortOrder 升序) */
export async function listCourseLessons(
  courseId: string
): Promise<(typeof courseLessons.$inferSelect)[]> {
  return db
    .select()
    .from(courseLessons)
    .where(eq(courseLessons.courseId, courseId))
    .orderBy(asc(courseLessons.sortOrder))
}
```

**DTO 追加到 `admin/types/api.ts`**(放在 `ActivityDTO` 之后):

```ts
// ---- 视频课程（courses / course_lessons） ----

/** 课程状态:pending 待审核 / active 已上线 / offline 已下线 / rejected 已驳回 / deleted 已删除 */
export type CourseStatus = "pending" | "active" | "offline" | "rejected" | "deleted"

/** 课时 DTO */
export type CourseLessonDTO = {
  id: string
  title: string
  /** 课时简介(可选填,默认空串) */
  description: string
  /** 课时视频 COS 公网 URL */
  videoUrl: string
  /** 视频时长(秒,可空) */
  durationSeconds: number | null
  /** 展示顺序(0 起) */
  sortOrder: number
}

/** 视频 课程 DTO(教师 / 管理后台共用) */
export type CourseDTO = {
  id: string
  creatorId: string
  title: string
  description: string
  /** 封面 / 轮播图 URL 数组(0-9 张) */
  coverImages: string[]
  /** 兴趣标签名称快照 */
  tags: string[]
  status: CourseStatus
  /** 课时(列表与编辑场景均已加载,按 sortOrder 升序) */
  lessons: CourseLessonDTO[]
  /** 课时数 */
  lessonCount: number
  /** 审核备注 / 驳回原因(可空) */
  reviewNote: string | null
  /** 审核时间(可空,ISO) */
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}
```

**Step 3.3 — 跑测试**
```bash
node node_modules/vitest/vitest.mjs run tests/unit/lib/courses.test.ts --reporter=dot
```
Expected: PASS。

---

## Task 4: COS 直传客户端 —— `lib/cos/object-key.ts`

**Files:**
- Create: `admin/lib/cos/object-key.ts`
- Test: `admin/tests/unit/lib/cos/object-key.test.ts`

实现与 `frontend_uniapp/src/utils/cos-key.ts` 同算法(复制其 `MIME_TO_EXT` / `ALLOWED_EXTS` / `pickExt` / `buildCosObjectKey` / `buildCosPublicUrl`,4 空格缩进与 admin 一致,注释中"小程序"相关内容删去;`uuid()` 直接用 `crypto.randomUUID()`,Node 20+ / 浏览器均有)。

**测试覆盖:**
- `pickExt`:`image/jpeg`→`.jpg`;`video/mp4`→`.mp4`;空 MIME + `a.PNG`→`.png`;未知 → `.bin`;
- `buildCosObjectKey`:段拼接 `uploads/<userId>/<yyyy>/<mm>/<uuid>.<ext>`;keyPrefix 为空时无前缀段;yyyy/mm 为 UTC;
- `buildCosPublicUrl`:base 尾斜杠与 key 头斜杠都归一为单斜杠。

---

## Task 5: COS 直传客户端 —— credentials / cos-client / upload

**Files:**
- Create: `admin/lib/cos/credentials.ts`
- Create: `admin/lib/cos/cos-client.ts`
- Create: `admin/lib/cos/upload.ts`
- Test: `admin/tests/unit/lib/cos/upload.test.ts`

### `credentials.ts`

```ts
import type { CosCredentials } from "@/lib/cos/sts"
import type { IResponse } from "@/types/api"

/**
 * 凭证提前刷新阈值:到期前 5 分钟视为失效。
 */
const CREDS_REFRESH_THRESHOLD_SECONDS = 300

let cachedCredentials: CosCredentials | null = null

/** 凭证是否需要刷新(null / 已过期 / 即将过期) */
export function needsCredentialsRefresh(
  creds: CosCredentials | null,
  nowSeconds: number
): boolean {
  if (!creds) return true
  return creds.expiredTime - nowSeconds <= CREDS_REFRESH_THRESHOLD_SECONDS
}

/**
 * 同源拉取 scoped STS 凭证。
 *
 * `GET /api/upload/cos-credentials` 的 `readUserFromToken` 底层是 `@auth/core`
 * 的 `getToken`,先读 cookie 再读 Bearer,因此浏览器同源请求无需额外带 token。
 */
export async function fetchCosCredentials(): Promise<CosCredentials> {
  const res = await fetch("/api/upload/cos-credentials", {
    method: "GET",
    credentials: "same-origin",
  })
  const data = (await res.json().catch(() => null)) as IResponse<CosCredentials> | null
  if (!res.ok || !data?.data) {
    throw new Error(data?.message || "获取上传凭证失败")
  }
  return data.data
}

/** 取(可能刷新的)凭证;刷新失败把错误信息转成可读中文 */
export async function getValidCredentials(): Promise<CosCredentials> {
  const nowSeconds = () => Math.floor(Date.now() / 1000)
  if (!needsCredentialsRefresh(cachedCredentials, nowSeconds())) {
    return cachedCredentials as CosCredentials
  }
  let fresh = await fetchCosCredentials()
  // 防御:后端返回的凭证本身已 / 即将过期(可能为后端缓存),主动重拉一次
  if (needsCredentialsRefresh(fresh, nowSeconds())) {
    fresh = await fetchCosCredentials()
  }
  cachedCredentials = fresh
  return fresh
}

/** 测试钩子:重置凭证缓存 */
export function __resetCosCredentialsForTest(): void {
  cachedCredentials = null
}
```

> `import type { CosCredentials } from "@/lib/cos/sts"` 在编译期被擦除,不会把 `qcloud-cos-sts`(Node 侧)打进浏览器 bundle。

### `cos-client.ts`

```ts
import type { CosCredentials } from "@/lib/cos/sts"

/**
 * COS SDK 单例管理(按凭证缓存),与 frontend_uniapp/src/utils/cos-client.ts 同构。
 *
 * - 用动态 `await import("cos-js-sdk-v5")`:该包是浏览器 UMD 包,
 *   静态 import 会在 SSR(Node)侧执行模块顶层代码导致崩溃,同时拖大首屏 bundle;
 * - 同一凭证(secretId 相同)复用同一实例,凭证刷新时重建。
 */

type CosSdkCallback = (err: unknown, data?: unknown) => void

/** 本项目用到的最小 SDK 调用面 */
export interface CosSdkLike {
  putObject(
    params: Record<string, unknown>,
    callback?: (err: unknown, data?: { statusCode?: number }) => void
  ): unknown
}

interface CachedClient {
  secretId: string
  sdk: CosSdkLike
}

let cachedClient: CachedClient | null = null

/** 归一 SDK 错误为 Error(保留 COS 返回的 message) */
export function normalizeCosError(err: unknown): Error {
  const e = err as { error?: { message?: string } | string; message?: string; code?: string }
  const detail =
    (typeof e?.error === "object" && e.error?.message) ||
    (typeof e?.error === "string" ? e.error : undefined) ||
    e?.message ||
    JSON.stringify(err)
  return new Error(detail)
}

/** 加载(并缓存)与给定凭证绑定的 SDK 实例 */
export async function getCosClient(creds: CosCredentials): Promise<CosSdkLike> {
  if (cachedClient && cachedClient.secretId === creds.secretId) {
    return cachedClient.sdk
  }
  const mod = await import("cos-js-sdk-v5")
  const CosConstructor = (mod.default ?? mod) as new (options: {
    SecretId: string
    SecretKey: string
    SecurityToken: string
  }) => CosSdkLike

  const sdk = new CosConstructor({
    SecretId: creds.secretId,
    SecretKey: creds.secretKey,
    SecurityToken: creds.sessionToken,
  })
  cachedClient = { secretId: creds.secretId, sdk }
  return sdk
}

/** 测试钩子:重置 SDK 缓存 */
export function __resetCosClientForTest(): void {
  cachedClient = null
}

export type { CosSdkCallback }
```

### `upload.ts`

```ts
import { buildCosObjectKey, buildCosPublicUrl } from "@/lib/cos/object-key"
import { getValidCredentials } from "@/lib/cos/credentials"
import { getCosClient, normalizeCosError, type CosSdkLike } from "@/lib/cos/cos-client"

/** 与后端 STS scope / 小程序端一致的返回结构 */
export interface CosUploadResult {
  url: string
  key: string
  size: number
  mimeType: string
  originalName: string
}

export interface CosUploadInput {
  file: File
  /** 上传进度(0-100) */
  onProgress?: (percent: number) => void
}

/**
 * 上传到 COS 的 Cache-Control:1 年 + immutable(与小程序端一致)。
 * key 含 uuid,天然满足"同 key 永不复用"。
 */
export const COS_CACHE_CONTROL_PERMANENT = "public, max-age=31536000, immutable"

/**
 * COS 直传(后台唯一上传通道)。
 *
 * 失败时抛出携带可读信息的 Error,由字段组件展示,不静默。
 */
export async function uploadFileToCos(input: CosUploadInput): Promise<CosUploadResult> {
  const { file } = input
  if (!file) throw new Error("请选择要上传的文件")

  const creds = await getValidCredentials()
  const sdk: CosSdkLike = await getCosClient(creds)

  const mimeType = file.type || "application/octet-stream"
  const originalName = file.name || "upload.bin"
  const key = buildCosObjectKey({ keyPrefix: creds.keyPrefix, userId: creds.userId, mimeType, originalName })

  try {
    await new Promise<void>((resolve, reject) => {
      sdk.putObject(
        {
          Bucket: creds.bucket,
          Region: creds.region,
          Key: key,
          Body: file,
          ContentType: mimeType,
          CacheControl: COS_CACHE_CONTROL_PERMANENT,
          ...(input.onProgress
            ? {
                onProgress: (info: unknown) => {
                  const percent = (info as { percent?: number } | undefined)?.percent
                  if (typeof percent === "number") input.onProgress?.(Math.round(percent))
                },
              }
            : {}),
        },
        (err) => {
          if (err) {
            reject(normalizeCosError(err))
            return
          }
          resolve()
        }
      )
    })
  } catch (e) {
    if (e instanceof Error) throw e
    throw new Error(`COS 上传失败: ${String(e)}`)
  }

  return {
    url: buildCosPublicUrl(creds.publicBaseUrl, key),
    key,
    size: file.size,
    mimeType,
    originalName,
  }
}
```

**Step 5.1 — 测试** `tests/unit/lib/cos/upload.test.ts`:

- mock `@/lib/cos/object-key`(返回固定 key/url)与 `@/lib/cos/cos-client`(`getCosClient` 返回 fake sdk,记录 `putObject` 入参);
- mock 全局 `fetch` 返回 `IResponse<CosCredentials>`;
- 断言:
  1. 首次上传先 fetch 凭证,再次上传命中缓存(fetch 只调 1 次);
  2. `expiredTime - now <= 300` 时重新 fetch;
  3. `putObject` 收到 `Bucket/Region/Key/Body/ContentType/CacheControl`;
  4. `onProgress` 透传 sdk 的 `percent`(89.4 → 89);
  5. sdk 回调 err(`{error: {message: "AccessDenied"}}`)→ 抛出含该 message 的 Error;
  6. 返回 `url = buildCosPublicUrl(...)`、`size = file.size`;
  7. 无 file → 抛 "请选择要上传的文件";
  8. 凭证 401(fetch 返回非 ok)→ 抛 "获取上传凭证失败"。
- 测试前后调用 `__resetCosCredentialsForTest()` / `__resetCosClientForTest()`。

---

## Task 6: 教师端课程 API

**Files:**
- Create: `admin/app/api/teacher/courses/route.ts`(POST)
- Create: `admin/app/api/teacher/courses/[courseId]/route.ts`(PATCH / DELETE)
- Test: `admin/tests/integration/api/teacher-courses.test.ts`

### `route.ts`

```ts
import { fail, ok } from "@/lib/api"
import { requireTeacher } from "@/lib/auth-utils"
import { createCourse, createCourseSchema, toCourseDTO, toCourseLessonDTO, type CreateCourseInput } from "@/lib/courses"
import { logger, LOG_PREFIX } from "@/lib/logger"

/**
 * POST /api/teacher/courses
 *
 * 教师在后台创建视频课程(status 恒为 pending,需管理员审核)。
 * 课程与课时在同一事务内写入,任一失败整体回滚。
 */
export async function POST(req: Request) {
  const guard = await requireTeacher()
  if (!guard.ok) return guard.response

  const body = await req.json().catch(() => null)
  const parsed = createCourseSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }
  const input = parsed.data as CreateCourseInput

  const created = await createCourse({ creatorId: guard.userId, input })

  logger.info(LOG_PREFIX.COURSE, "Teacher created course", {
    courseId: created.course.id,
    lessonCount: created.lessons.length,
    creatorId: guard.userId,
    role: guard.role,
  })

  return ok(toCourseDTO(created.course, created.lessons.map(toCourseLessonDTO)), { status: 201 })
}
```

### `[courseId]/route.ts`

```ts
import { fail, isUuid, ok } from "@/lib/api"
import { requireTeacher } from "@/lib/auth-utils"
import {
  assertTeacherStatusTransition,
  buildCourseUpdatePatch,
  listCourseLessons,
  softDeleteCourse,
  toCourseDTO,
  toCourseLessonDTO,
  updateCourse,
  updateCourseSchema,
  type UpdateCourseInput,
} from "@/lib/courses"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ courseId: string }> }

/**
 * 教师后台课程操作公共前置:鉴权 + id 合法性 + 查课程 + 归属校验。
 * 归属规则与活动 / 圈子一致:创建者本人,或 ADMIN(代管)。
 */
async function loadManageableCourse(courseId: string) {
  const guard = await requireTeacher()
  if (!guard.ok) return { ok: false as const, response: guard.response }

  // 路径参数必须是 uuid,否则 Postgres 抛 22P02 → 500
  if (!isUuid(courseId)) {
    return { ok: false as const, response: fail(400, "courseId 格式不正确") }
  }

  const { getCourseWithLessons } = await import("@/lib/courses")
  const loaded = await getCourseWithLessons(courseId)
  if (!loaded) {
    return { ok: false as const, response: fail(404, "课程不存在") }
  }
  if (loaded.course.creatorId !== guard.userId && guard.role !== "ADMIN") {
    return { ok: false as const, response: fail(403, "只有课程创建者可以操作课程") }
  }
  return { ok: true as const, ...loaded, userId: guard.userId, role: guard.role }
}
```

> 实现时把 `getCourseWithLessons` 直接放进顶部 import(在 `lib/courses.ts` 增加):
> ```ts
> /** 加载课程及其课时(不存在返回 null) */
> export async function getCourseWithLessons(courseId: string) {
>   const [course] = await db.select().from(courses).where(eq(courses.id, courseId))
>   if (!course) return null
>   const lessons = await listCourseLessons(courseId)
>   return { course, lessons }
> }
> ```

PATCH 逻辑:
```ts
export async function PATCH(req: Request, context: RouteContext) {
  const { courseId } = await context.params
  const loaded = await loadManageableCourse(courseId)
  if (!loaded.ok) return loaded.response

  const body = await req.json().catch(() => null)
  const parsed = updateCourseSchema.safeParse(body)
  if (!parsed.success) return fail(400, "Invalid request body", parsed.error.flatten())
  const input = parsed.data as UpdateCourseInput
  if (Object.keys(input).length === 0) return fail(400, "没有提供任何更新字段")

  // 教师不能把 pending 改成 active(绕过审核),也不能把 rejected 改成 active
  if (input.status && !assertTeacherStatusTransition(loaded.course.status, input.status)) {
    return fail(403, "当前状态不允许该操作")
  }

  const updated = await updateCourse({
    courseId,
    patch: buildCourseUpdatePatch(input),
    ...(input.lessons !== undefined ? { lessons: input.lessons } : {}),
  })

  logger.info(LOG_PREFIX.COURSE, "Teacher updated course", { courseId, by: loaded.userId, role: loaded.role })
  return ok(toCourseDTO(updated.course, updated.lessons.map(toCourseLessonDTO)))
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { courseId } = await context.params
  const loaded = await loadManageableCourse(courseId)
  if (!loaded.ok) return loaded.response

  await softDeleteCourse(courseId)
  logger.info(LOG_PREFIX.COURSE, "Teacher deleted course", { courseId, by: loaded.userId, role: loaded.role })
  return ok({ id: courseId, status: "deleted" })
}
```

**Step 6.1 — 集成测试** `tests/integration/api/teacher-courses.test.ts`,仿 `tests/integration/api/teacher-activities.test.ts` 的 hoisted mock 结构,**新增 `transaction` mock**:

```ts
const mockDb = {
  select: vi.fn(() => makeSelectChain(selectResultsQueue.shift() ?? [])),
  insert: vi.fn(() => chainInsert),
  update: vi.fn(() => chainUpdate),
  delete: vi.fn(() => chainDelete),
  transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(mockDb)),
}
```
(`chainDelete` 形如 `chainUpdate` 但无 `returning`。)

覆盖:
| 用例 | 期望 |
|---|---|
| POST 未登录 | 401 |
| POST USER 角色 | 403 |
| POST lessons 为空数组 | 400 |
| POST 成功 | 201,`data.status === "pending"`,`data.lessonCount === lessons.length`,`data.lessons[0].sortOrder === 0` |
| PATCH 未登录 | 401 |
| PATCH courseId 非 uuid | 400 |
| PATCH 不存在 | 404 |
| PATCH 非创建者且非 ADMIN | 403 |
| PATCH `pending→active` | 403 |
| PATCH `active→offline` | 200,`data.status === "offline"` |
| PATCH ADMIN 代管 | 200 |
| PATCH 只带 lessons(全量替换) | 200,事务内出现 delete + insert |
| DELETE 非创建者 | 403 |
| DELETE 成功 | 200,`data.status === "deleted"` |

---

## Task 7: 管理端课程审核 API

**Files:**
- Create: `admin/app/api/admin/courses/[id]/route.ts`(PATCH)
- Test: `admin/tests/integration/api/admin-courses.test.ts`

```ts
import { fail, isUuid, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import {
  adminCourseStatusSchema,
  getCourseWithLessons,
  toCourseDTO,
  toCourseLessonDTO,
} from "@/lib/courses"
import { db } from "@/lib/db"
import { courses } from "@/db/schema"
import { eq } from "drizzle-orm"
import { logger, LOG_PREFIX } from "@/lib/logger"

type RouteContext = { params: Promise<{ id: string }> }

/**
 * PATCH /api/admin/courses/:id
 *
 * 管理员审核 / 上下线课程:
 * - pending → active:通过(写 reviewerId / reviewedAt)
 * - → rejected:驳回(写 reviewerId / reviewedAt / reviewNote)
 * - active ⇄ offline:下线 / 恢复上线
 *
 * 不发审核结果通知:通知的 admin 铃铛只服务 ADMIN,教师读不到,
 * 且小程序端本期没有课程页(见设计文档 §3 决策 7)。
 */
export async function PATCH(req: Request, context: RouteContext) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const { id } = await context.params
  if (!isUuid(id)) return fail(400, "id 格式不正确")

  const body = await req.json().catch(() => null)
  const parsed = adminCourseStatusSchema.safeParse(body)
  if (!parsed.success) return fail(400, "Invalid request body", parsed.error.flatten())

  const { status, reviewNote } = parsed.data
  const loaded = await getCourseWithLessons(id)
  if (!loaded) return fail(404, "课程不存在")

  const [updated] = await db
    .update(courses)
    .set({
      status,
      reviewerId: guard.userId,
      reviewedAt: new Date(),
      ...(reviewNote !== undefined ? { reviewNote: reviewNote || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(courses.id, id))
    .returning()

  logger.info(LOG_PREFIX.COURSE, "Admin updated course status", {
    courseId: id,
    status,
    by: guard.userId,
  })

  return ok(toCourseDTO(updated, loaded.lessons.map(toCourseLessonDTO)))
}
```

**集成测试覆盖:** 401 / 403(TEACHER 也 403)/ 400(非 uuid、非法 status)/ 404 / 200 `pending→active` 写 `reviewerId`+`reviewedAt` / 200 `→rejected` 写 `reviewNote` / 200 `active→offline`。

---

## Task 8: `CoverImagesField` 切换 COS 直传

**Files:**
- Modify: `admin/components/cover-images-field.tsx`
- 回归: 既有全部测试(`POST /api/upload` 路由测试必须保持绿)

改动点(只动网络层,props / 交互 / 上限 / 文案不变):
1. import 增加 `import { uploadFileToCos } from "@/lib/cos/upload"`,删除 `IResponse` import;
2. 文件头注释改为:
   ```
   /**
    * 图片上传字段(受控,圈子 / 活动 / 课程表单共用)。
    *
    * 统一走 COS 直传(`lib/cos/upload.ts`):文件字节不进 Next.js 进程,
    * 与小程序端共用同一存储桶与 STS scope(`uploads/<userId>/*`)。
    * `POST /api/upload` 本地通道保留作兜底,后台 UI 已不再调用。
    */
   ```
3. `handleUpload` 的 for 循环体替换为:
   ```ts
   for (const file of Array.from(files)) {
     try {
       const result = await uploadFileToCos({ file })
       uploaded.push(result.url)
     } catch (e) {
       setUploadError(e instanceof Error ? e.message : "图片上传失败")
       break
     }
   }
   ```
4. 预览 `<img>` 上方的注释「用户上传的图片走 /uploads 静态目录」改为「图片为 COS 公网 URL,直接用原生 img 即可」。

**验证:** `pnpm test` 全绿(重点 `tests/integration/api/upload.test.ts`、圈子 / 活动表单相关测试)。

---

## Task 9: `CosVideoField` 视频上传字段

**Files:**
- Create: `admin/components/cos-video-field.tsx`

```tsx
"use client"

import { useRef, useState } from "react"
import { Loader2Icon, Trash2Icon, UploadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { COURSE_VIDEO_MAX_MB } from "@/lib/form-limits"
import { uploadFileToCos } from "@/lib/cos/upload"

/** 视频字段值:url 为 COS 公网地址;durationSeconds 由 <video> 元数据探测 */
export type CosVideoValue = { videoUrl: string; durationSeconds: number | null }

/**
 * 视频上传字段(受控):选择文件 → 客户端预校验体积 → COS 直传(带进度)
 * → <video> 预览(元数据回调回传时长)→ 替换 / 移除。
 */
export function CosVideoField({
  value,
  onChange,
  label = "课时视频",
  error,
}: {
  value: CosVideoValue | null
  onChange: (next: CosVideoValue | null) => void
  label?: string
  error?: string | null
}) {
  const [progress, setProgress] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (file.size > COURSE_VIDEO_MAX_MB * 1024 * 1024) {
      setUploadError(`视频不能超过 ${COURSE_VIDEO_MAX_MB} MB`)
      return
    }
    setUploadError(null)
    setProgress(0)
    try {
      const result = await uploadFileToCos({
        file,
        onProgress: (percent) => setProgress(percent),
      })
      // 先取时长探测占位,元数据加载后再回传真实时长
      onChange({ videoUrl: result.url, durationSeconds: null })
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "视频上传失败")
    } finally {
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  // ...渲染:Label;value ? <video controls src> + 替换/移除按钮 : "尚未上传视频" + 上传按钮;
  // progress !== null 时渲染进度条(<div> 两层结构);uploadError || error 时渲染错误文案
}
```

实现注意:
- `<video>` 加 `preload="metadata"`、`className="w-full rounded-lg border"`、`controls`;
- `onLoadedMetadata={(e) => { const d = e.currentTarget.duration; if (Number.isFinite(d)) onChange({ videoUrl: value.videoUrl, durationSeconds: Math.round(d) }) }}`;
- 上传中禁用「选择视频」按钮;`accept="video/*"`;
- 进度条:`<div className="h-1.5 w-full overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>` + 右侧 `${progress}%` 文本。

---

## Task 10: 教师端页面 `/teacher/courses`

**Files:**
- Create: `admin/app/teacher/courses/page.tsx`
- Create: `admin/app/teacher/courses/_components/courses-table.tsx`
- Create: `admin/app/teacher/courses/_components/course-form-dialog.tsx`
- Create: `admin/app/teacher/courses/_components/lesson-editor.tsx`
- Modify: `admin/components/teacher-sidebar.tsx`(navItems 追加 `{ href: "/teacher/courses", label: "我的课程", icon: GraduationCapIcon }`,import `GraduationCapIcon`)

### `page.tsx`(SSR,仿 `teacher/activities/page.tsx`)

```tsx
import { redirect } from "next/navigation"
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm"

import { auth } from "@/auth"
import { db } from "@/lib/db"
import { courseLessons, courses, users } from "@/db/schema"
import { toCourseDTO, toCourseLessonDTO } from "@/lib/courses"
import { TeacherCoursesTable, type TeacherCourseItem } from "./_components/courses-table"

const SSR_COURSE_LIMIT = 200

/**
 * 教师后台「我的课程」页(server component)。
 * 已删除课程不出现在列表(终态,同 circles 概览口径);ADMIN 可 ?scope=all 代管。
 */
export default async function TeacherCoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string }>
}) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) redirect("/login")
  const isAdmin = session?.user?.role === "ADMIN"

  const { scope: scopeParam } = await searchParams
  const scope: "mine" | "all" = isAdmin && scopeParam === "all" ? "all" : "mine"

  const rows = await db
    .select({ course: courses, creatorName: users.name })
    .from(courses)
    .innerJoin(users, eq(users.id, courses.creatorId))
    .where(
      and(
        ne(courses.status, "deleted"),
        scope === "all" ? undefined : eq(courses.creatorId, userId)
      )
    )
    .orderBy(desc(courses.createdAt))
    .limit(SSR_COURSE_LIMIT)

  // 一次查出本页课程全部课时,避免编辑表单再发请求
  const courseIds = rows.map((r) => r.course.id)
  const lessonRows = courseIds.length
    ? await db
        .select()
        .from(courseLessons)
        .where(inArray(courseLessons.courseId, courseIds))
        .orderBy(asc(courseLessons.sortOrder))
    : []
  const lessonsByCourse = new Map<string, (typeof courseLessons.$inferSelect)[]>()
  for (const lesson of lessonRows) {
    const list = lessonsByCourse.get(lesson.courseId) ?? []
    list.push(lesson)
    lessonsByCourse.set(lesson.courseId, list)
  }

  const items: TeacherCourseItem[] = rows.map(({ course, creatorName }) => ({
    ...toCourseDTO(course, (lessonsByCourse.get(course.id) ?? []).map(toCourseLessonDTO)),
    creatorName,
    canManage: course.creatorId === userId || isAdmin,
  }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">我的课程</h1>
        <p className="text-sm text-muted-foreground">
          {scope === "all" ? "全部课程" : "你创建的课程"}，共 {items.length} 个
          {items.length >= SSR_COURSE_LIMIT ? `（仅展示最近 ${SSR_COURSE_LIMIT} 条）` : ""}
        </p>
      </div>
      <TeacherCoursesTable items={items} scope={scope} canSwitchScope={isAdmin} />
    </div>
  )
}
```

### `courses-table.tsx`(client,仿 `teacher/activities/_components/activities-table.tsx`)

- `export type TeacherCourseItem = CourseDTO & { creatorName: string; canManage: boolean }`
- `StatusFilter = "all" | "pending" | "active" | "offline" | "rejected"`,Tab 计数同款写法,Tab 包 `-mx-4 max-w-full overflow-x-auto px-4 sm:mx-0 sm:px-0`;
- 顶部右侧:「查看全部 / 只看我的」(canSwitchScope)+「新建课程」按钮;
- 桌面表格列:标题 / (scope=all)创建者 / 状态 / 课时数 / 更新时间 / 操作;
- 移动卡片:标题 + `N 个课时 · 更新时间` + 状态徽标 + 操作;
- `CourseStatusBadge`:pending→待审核(secondary)、active→已上线(default)、offline→已下线(outline)、rejected→已驳回(destructive)、deleted→已删除(secondary);
- `CourseRowActions`:canManage 为 false 显示「无权限」;否则 DropdownMenu:编辑(恒)、上线(`offline→active`)、下线(`active→offline`)、删除(非 deleted);
- 删除确认弹窗文案:「确定删除「{title}」?删除后课程不再对外展示,且无法恢复。」;
- 弹窗状态:`form: { initial: CourseFormInitial | null } | null`、`deleteTarget`、`pending`;
- 状态切换走 `PATCH /api/teacher/courses/{id}` body `{ status }`,成功 `toast` + `router.refresh()`。

### `course-form-dialog.tsx`(client,新建 / 编辑共用)

- `export type CourseFormInitial = { id: string; title: string; description: string; coverImages: string[]; tags: string[]; status: CourseStatus; lessons: CourseLessonDTO[] }`
- 状态:`title / description / coverImages / tags / lessons`(本地数组状态,含 `{title, description, videoUrl, durationSeconds}`),`busy / error`;
- 提交前 `validate()`:
  - 标题 2-100;简介 10-5000;
  - `lessons.length === 0` → "至少添加 1 个课时";
  - 每个课时:标题非空 ≤100、必须有 `videoUrl`(否则"请为第 N 个课时上传视频");
- 新建 POST `/api/teacher/courses`;编辑 PATCH `/api/teacher/courses/{id}`,body 含 `lessons`(title/description/videoUrl/durationSeconds,不含 sortOrder);
- 编辑时若 `status === "rejected"`,顶部展示 `reviewNote`(amber 提示条):「驳回原因:{reviewNote}」,描述文案改为「修改后需管理员重新审核」;
- 弹窗 `className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl"`,字段栅格 `grid grid-cols-1 gap-4 sm:grid-cols-2`,标题 / 简介 / 封面 / 标签 `sm:col-span-2`;
- 标签用多选 Input 逗号分隔解析(`tags.join("，")` ↔ `split(/[，,]/)`)或在既有 `TagPicker` 组件存在时复用(**实现时先确认 `components/tag-picker.tsx` 是否存在,存在则复用其 props**)。

### `lesson-editor.tsx`(client)

- props:`lessons: LessonDraft[]`,`onChange: (next: LessonDraft[]) => void`;
- `type LessonDraft = { title: string; description: string; videoUrl: string; durationSeconds: number | null }`;
- 每个课时一张卡片(`rounded-lg border p-3 space-y-3`),头部「课时 N」+ 上移 / 下移(`ArrowUpIcon/ArrowDownIcon`,首末禁用)+ 删除(`Trash2Icon`);
- 字段:标题 Input;简介 textarea(`min-h-16`);`<CosVideoField value={lesson.videoUrl ? { videoUrl, durationSeconds } : null} onChange={...} />`;已有时长显示「时长 x 分 y 秒」;
- 底部「添加课时」按钮(达到 `COURSE_LESSONS_MAX` 时禁用并显示「最多 N 个课时」);
- 窄屏单列(`space-y-3`),无横向滚动。

---

## Task 11: 管理端页面 `/admin/courses`

**Files:**
- Create: `admin/app/admin/courses/page.tsx`
- Create: `admin/app/admin/courses/_components/courses-table.tsx`
- Create: `admin/app/admin/courses/_components/course-detail-dialog.tsx`
- Modify: `admin/components/app-sidebar.tsx`(navItems 追加 `{ href: "/admin/courses", label: "课程管理", icon: GraduationCapIcon }`)

### `page.tsx`

与 `page.tsx`(教师端)同构,但:
- 无 scope 分支,`where(and(ne(courses.status, "deleted")))`;
- 标题「课程管理」,副标题「共 N 个课程」;
- 传给 `AdminCoursesTable`,item 类型 `AdminCourseItem = CourseDTO & { creatorName: string }`。

### `courses-table.tsx`(client)

- Tab:`all / pending / active / offline / rejected`,计数同款;
- 桌面表格列:标题 / 创建者 / 状态 / 课时数 / 提交时间 / 操作;
- 行操作(按当前状态给出可执行项,统一走 `PATCH /api/admin/courses/{id}`):
  - `pending`:查看详情、通过(`status:"active"`)、驳回(弹窗填 `reviewNote`,必填校验「请填写驳回原因」);
  - `active`:查看详情、下线(`status:"offline"`);
  - `offline`:查看详情、恢复上线(`status:"active"`);
  - `rejected`:查看详情、通过(`status:"active"` —— 管理员修改后放行);
- 驳回弹窗:textarea(≤500)+ 确认按钮,确认时 body `{ status: "rejected", reviewNote }`;
- 每次操作成功 `toast.success` + `router.refresh()`。

### `course-detail-dialog.tsx`(client)

- props:`course: AdminCourseItem`,`onClose`;
- 展示:标题、状态徽标、创建者、提交 / 审核时间、`reviewNote`(有则展示)、标签 Badge 列表、简介(whitespace-pre-wrap,`max-h-40 overflow-y-auto`)、封面图网格(同 `CoverImagesField` 预览样式,只读);
- 「课时内容」区块:按 `sortOrder` 列出每个课时 —— 标题、简介(有则)、时长、`<video controls preload="metadata" src={lesson.videoUrl} className="w-full rounded-lg border" />`(审核必须能看到视频内容);
- 弹窗 `max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl`,底部按钮:通过 / 驳回(仅 pending 时),其余状态只显示「关闭」。

---

## Task 12: 质量门

```bash
cd admin
node node_modules/vitest/vitest.mjs run --reporter=dot    # 全部测试
npx tsc --noEmit
pnpm lint
```
全部通过后:

```bash
cd admin && pnpm db:generate && pnpm db:migrate
```

人工核对迁移 SQL 后执行。若 `pnpm build` 因离线拉取 Google Fonts 失败,按 `AGENTS.md` 豁免。

---

## 验收自查清单(实现完成后逐项核对)

- [ ] 教师可新建课程 → `status=pending`,课时 1-30,`sortOrder` 按顺序;
- [ ] 教师不能 `pending→active` / `rejected→active`(403);能 `active⇄offline`;能软删除;
- [ ] ADMIN 可通过 / 驳回(带原因)/ 下线 / 恢复上线,`reviewerId` / `reviewedAt` 被写入;
- [ ] 封面图(圈子 / 活动 / 课程)与课时视频全部走 COS 直传,`POST /api/upload` 无后台调用方;
- [ ] 圈子 / 活动表单回归:props 与提示文案未变,既有测试全绿;
- [ ] 两个课程页 375-1440px 无横向滚动,`<768px` 卡片视图;
- [ ] 审核详情弹窗内可直接播放课时视频。
