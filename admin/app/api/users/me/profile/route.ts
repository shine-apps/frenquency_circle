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
 * - phone: 手机号格式(可空串清除,空串归一为 null)
 * - practiceYears: 0-100 整数
 * - activityLevel: 活跃度等级
 *
 * 全部可选,但至少要传 1 个字段(refine)。
 */
const patchProfileSchema = z
  .object({
    role: z.enum(["USER", "TEACHER"]).optional(),
    phone: z.union([z.string().regex(/^1[3-9]\d{9}$/), z.literal("")]).optional(),
    practiceYears: z.number().int().min(0).max(100).optional(),
    activityLevel: z.enum(["low", "medium", "high"]).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "至少提供一个字段",
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
 * 更新当前用户的业务资料字段(role / phone / practiceYears / activityLevel)。
 *
 * - 鉴权:任意登录用户
 * - zod 校验请求体(全部可选,至少 1 个字段)
 * - role 不允许更新为 'ADMIN'(防止越权提权)
 * - phone 空串归一为 null
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

  // 3. 组装 update payload(phone 空串归一为 null)
  const updatePayload: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  }
  if (parsed.data.role !== undefined) {
    updatePayload.role = parsed.data.role
  }
  if (parsed.data.phone !== undefined) {
    updatePayload.phone = parsed.data.phone === "" ? null : parsed.data.phone
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

  // 5. 查询用户 tags,组装 UserProfileDTO
  const userTagsList = await fetchUserTags(userId)
  const profile: UserProfileDTO = {
    ...toUserDTO(updated),
    tags: userTagsList,
  }

  return withCors(ok(profile), req)
}
