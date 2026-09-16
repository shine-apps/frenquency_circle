import { z } from "zod"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { activities } from "@/db/schema"
import { COVER_IMAGES_MAX } from "@/lib/form-limits"
import type { ActivityDTO } from "@/types/api"

/**
 * 活动行 → ActivityDTO 投影。
 *
 * 活动列表 / 详情 / 教师后台共用同一份映射,避免多处手写导致字段漂移
 * (新增字段时只需改这里)。时间字段统一 ISO 化,coverImages 兜底空数组。
 */
export function toActivityDTO(row: typeof activities.$inferSelect): ActivityDTO {
  return {
    id: row.id,
    creatorId: row.creatorId,
    title: row.title,
    description: row.description,
    startTime: row.startTime.toISOString(),
    registrationDeadline: row.registrationDeadline.toISOString(),
    contactPhone: row.contactPhone ?? null,
    coverImages: row.coverImages ?? [],
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * 活动介绍:前端现为纯文本 textarea 提交;此处仍保留一层字符串守卫,
 * 拒绝明显危险片段,防止绕过前端直接调 API。
 */
const DANGEROUS_HTML = /<script|<iframe| on\w+\s*=|javascript:/i

/** 活动介绍(纯文本,兼容历史 HTML 数据)校验 */
export const activityDescriptionSchema = z
  .string()
  .trim()
  .min(1, "活动介绍不能为空")
  .max(50000, "活动介绍过长(上限 50000 字符)")
  .refine((v) => !DANGEROUS_HTML.test(v), {
    message: "活动介绍包含不允许的内容(脚本/iframe/内联事件)",
  })

/** 中国手机号 / 固话宽松校验(可空) */
const phoneSchema = z
  .string()
  .trim()
  .max(20, "电话过长")
  .regex(/^1[3-9]\d{9}$|^0\d{2,3}-?\d{7,8}$/, "联系电话格式不正确")

/** 创建活动输入校验(TEACHER / ADMIN 可直接发布,无需圈子) */
export const createActivitySchema = z
  .object({
    title: z.string().trim().min(1, "活动标题不能为空").max(100, "活动标题过长"),
    description: activityDescriptionSchema,
    /** ISO 8601 字符串 */
    startTime: z.string().min(1, "活动起始时间不能为空"),
    registrationDeadline: z.string().min(1, "报名截止时间不能为空"),
    contactPhone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
    /** 轮播图片 URL 数组(最多 9 张,可空) */
    coverImages: z
      .array(z.string().url("轮播图片需为有效 URL"))
      .max(COVER_IMAGES_MAX, `轮播图片最多 ${COVER_IMAGES_MAX} 张`)
      .optional(),
  })
  .superRefine((val, ctx) => {
    const start = Date.parse(val.startTime)
    const deadline = Date.parse(val.registrationDeadline)
    if (Number.isNaN(start)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["startTime"],
        message: "活动起始时间格式不正确",
      })
    }
    if (Number.isNaN(deadline)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["registrationDeadline"],
        message: "报名截止时间格式不正确",
      })
    }
    if (!Number.isNaN(start) && !Number.isNaN(deadline) && deadline >= start) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["registrationDeadline"],
        message: "报名截止时间必须早于活动起始时间",
      })
    }
  })

export type CreateActivityInput = z.infer<typeof createActivitySchema>

/** 更新活动输入校验(全部可选,部分更新) */
export const updateActivitySchema = z
  .object({
    title: z.string().trim().min(1).max(100).optional(),
    description: activityDescriptionSchema.optional(),
    startTime: z.string().min(1).optional(),
    registrationDeadline: z.string().min(1).optional(),
    // `""` 保留为字符串(而非 transform 成 undefined),使调用方能显式清空联系方式;
    // buildActivityUpdatePatch 会把 `""` 落成 NULL。
    contactPhone: phoneSchema.optional().or(z.literal("")),
    /** 轮播图片 URL 数组(最多 9 张,可空) */
    coverImages: z
      .array(z.string().url("轮播图片需为有效 URL"))
      .max(COVER_IMAGES_MAX, `轮播图片最多 ${COVER_IMAGES_MAX} 张`)
      .optional(),
  })
  .superRefine((val, ctx) => {
    // 仅在两端都提供时校验先后关系(部分更新无法单独判定)
    if (val.startTime && val.registrationDeadline) {
      const start = Date.parse(val.startTime)
      const deadline = Date.parse(val.registrationDeadline)
      if (!Number.isNaN(start) && !Number.isNaN(deadline) && deadline >= start) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["registrationDeadline"],
          message: "报名截止时间必须早于活动起始时间",
        })
      }
    }
  })

export type UpdateActivityInput = z.infer<typeof updateActivitySchema>

/**
 * 创建活动(落库)。
 *
 * 角色门槛由调用方守卫(C 端 `/api/activities` 用 `requireSession` + PUBLISH_ROLES,
 * 教师后台 `/api/teacher/activities` 用 `requireTeacher`)后调用,
 * 两条链路共用同一份落库实现,避免字段遗漏。
 */
export async function createActivity(params: {
  creatorId: string
  input: CreateActivityInput
}): Promise<typeof activities.$inferSelect> {
  const { creatorId, input } = params
  const [inserted] = await db
    .insert(activities)
    .values({
      creatorId,
      title: input.title,
      description: input.description,
      startTime: new Date(input.startTime),
      registrationDeadline: new Date(input.registrationDeadline),
      contactPhone: input.contactPhone ?? null,
      coverImages: input.coverImages ?? [],
    })
    .returning()
  return inserted
}

/**
 * 由部分更新入参构造 `update().set()` 的补丁(仅包含已提供的字段)。
 *
 * C 端与教师后台的 PATCH 共用,保证字段映射与 `updatedAt` 刷新口径一致。
 */
export function buildActivityUpdatePatch(
  input: UpdateActivityInput
): Partial<typeof activities.$inferInsert> {
  return {
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.startTime !== undefined ? { startTime: new Date(input.startTime) } : {}),
    ...(input.registrationDeadline !== undefined
      ? { registrationDeadline: new Date(input.registrationDeadline) }
      : {}),
    // "" 表示清空(落 NULL)
    ...(input.contactPhone !== undefined
      ? { contactPhone: input.contactPhone || null }
      : {}),
    ...(input.coverImages !== undefined ? { coverImages: input.coverImages } : {}),
    updatedAt: new Date(),
  }
}

/** 软取消活动(置 status=cancelled,非硬删);归属校验由调用方完成 */
export async function cancelActivity(activityId: string): Promise<void> {
  await db
    .update(activities)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(activities.id, activityId))
}
