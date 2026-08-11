import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/lib/db"
import { users, DEFAULT_PRIVACY_SETTINGS } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"
import { fetchUserTags } from "@/lib/user-tags"
import type {
  UserDTO,
  UserProfileDTO,
  UserRole,
  PrivacySettings,
} from "@/types/api"

/**
 * 用户业务资料更新请求体 schema。
 * - role: 仅允许 'USER' | 'TEACHER'(禁止 'ADMIN',防止越权提权)
 * - 注意:phone 不在本 schema 内,手机号变更必须走短信验证流程
 *   (POST /api/users/me/phone/verify),禁止经本接口直接设置
 * - address: 地址文本(可空串清除,空串归一为 null,最长 200 字符)
 * - latitude / longitude: 定位坐标(成对出现,与 address 一起由地址选择组件回填)
 * - practiceYears: 0-100 整数
 * - activityLevel: 活跃度等级
 *
 * 全部可选,但至少要传 1 个字段(refine)。
 */
const patchProfileSchema = z
  .object({
    role: z.enum(["USER", "TEACHER"]).optional(),
    address: z.union([z.string().trim().max(200), z.literal("")]).optional(),
    latitude: z.union([z.number().min(-90).max(90), z.null()]).optional(),
    longitude: z.union([z.number().min(-180).max(180), z.null()]).optional(),
    practiceYears: z.number().int().min(0).max(100).optional(),
    activityLevel: z.enum(["low", "medium", "high"]).optional(),
  })
  .superRefine((d, ctx) => {
    if (Object.keys(d).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "至少提供一个字段",
      })
    }
    // 经纬度必须成对出现(允许只更新 address 不带坐标)
    if (d.latitude !== undefined && d.longitude === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["longitude"],
        message: "longitude 不能为空",
      })
    }
    if (d.longitude !== undefined && d.latitude === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["latitude"],
        message: "latitude 不能为空",
      })
    }
  })

/**
 * 将 users 表行映射为 UserProfileDTO(不含 tags,需调用方拼接)。
 */
function toUserDTO(row: typeof users.$inferSelect): UserDTO {
  const privacySettings =
    (row.privacySettings as PrivacySettings | null) ?? DEFAULT_PRIVACY_SETTINGS
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    avatarUrl: row.avatarUrl ?? null,
    phone: row.phone ?? null,
    practiceYears: row.practiceYears ?? null,
    activityLevel: row.activityLevel as UserDTO["activityLevel"],
    privacySettings,
    location:
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude }
        : null,
    address: row.address ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * PATCH /api/users/me/profile
 *
 * 更新当前用户的业务资料字段(role / address / latitude / longitude /
 * practiceYears / activityLevel)。
 *
 * - 鉴权:任意登录用户
 * - zod 校验请求体(全部可选,至少 1 个字段)
 * - role 不允许更新为 'ADMIN'(防止越权提权)
 * - phone 不在本接口范围内,手机号变更必须走短信验证码流程
 *   (POST /api/users/me/phone/verify)
 * - address 空串归一为 null
 * - latitude / longitude 成对出现(由地址选择组件回填,可仅更新 address)
 * - 更新 users 表对应字段
 * - 返回 `IResponse<UserProfileDTO>`(包含 tags 列表)
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function PATCH(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = patchProfileSchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  // 3. 组装 update payload(phone 不在本接口范围内,由短信验证流程处理)
  const updatePayload: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  }
  if (parsed.data.role !== undefined) {
    updatePayload.role = parsed.data.role
  }
  if (parsed.data.address !== undefined) {
    updatePayload.address = parsed.data.address === "" ? null : parsed.data.address
  }
  if (parsed.data.latitude !== undefined) {
    updatePayload.latitude = parsed.data.latitude
  }
  if (parsed.data.longitude !== undefined) {
    updatePayload.longitude = parsed.data.longitude
  }
  if (parsed.data.practiceYears !== undefined) {
    updatePayload.practiceYears = parsed.data.practiceYears
  }
  if (parsed.data.activityLevel !== undefined) {
    updatePayload.activityLevel = parsed.data.activityLevel
  }

  // 4. 更新 users 表
  const [updated] = await db
    .update(users)
    .set(updatePayload)
    .where(eq(users.id, userId))
    .returning()

  if (!updated) {
    return withCors(fail(404, "User not found"), req)
  }

  logger.info(LOG_PREFIX.AUTH, "user profile updated", {
    userId,
    fields: Object.keys(parsed.data),
  })

  // 6. 查询用户 tags,组装 UserProfileDTO
  const userTagsList = await fetchUserTags(userId)
  const profile: UserProfileDTO = {
    ...toUserDTO(updated),
    tags: userTagsList,
  }

  return withCors(ok(profile), req)
}
