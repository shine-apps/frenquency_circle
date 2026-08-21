import { z } from "zod"

/**
 * 活动富文本净白名单:服务端兜底净化,拒绝明显危险片段。
 * 编辑端用 uni `<editor>`(输出 HTML),展示端 `<rich-text>`(不执行脚本);
 * 这里再做一层字符串守卫,防止绕过前端直接调 API。
 */
const DANGEROUS_HTML = /<script|<iframe| on\w+\s*=|javascript:/i

/** 富文本 HTML(净化后)校验 */
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
    contactPhone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
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
