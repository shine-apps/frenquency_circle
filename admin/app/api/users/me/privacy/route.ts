import { eq } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/lib/db"
import { users } from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"
import type { PrivacySettings } from "@/types/api"

/**
 * 隐私设置请求体 schema。
 * 与 `PrivacySettings` 类型对齐:
 * - allowMatch: 是否允许出现在他人的"同频的人"匹配结果
 * - publicContact: 是否对外公开联系方式
 * - locationPrecision: 位置精度脱敏等级('exact' | 'community' | 'region')
 */
const privacySettingsSchema = z.object({
  allowMatch: z.boolean(),
  publicContact: z.boolean(),
  locationPrecision: z.enum(["exact", "community", "region"]),
})

/**
 * PUT /api/users/me/privacy
 *
 * 更新当前用户的隐私设置(写入 `users.privacySettings` JSONB 字段)。
 *
 * - 鉴权:任意登录用户
 * - zod 校验 `PrivacySettings` schema
 * - 更新 `users.privacySettings` JSONB 字段(同时更新 updatedAt)
 * - 返回 `IResponse<{ privacySettings: PrivacySettings }>`
 *
 * `allowMatch=false` 时该用户不出现在他人的"同频的人"匹配结果
 * (由匹配引擎在查询时过滤,本接口仅负责持久化)。
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function PUT(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = privacySettingsSchema.safeParse(body)
  if (!parsed.success) {
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  const privacySettings: PrivacySettings = parsed.data

  // 3. 写入 users.privacySettings(JSONB)
  const [updated] = await db
    .update(users)
    .set({
      privacySettings,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning()

  if (!updated) {
    return withCors(fail(404, "User not found"), req)
  }

  logger.info(LOG_PREFIX.AUTH, "privacy settings updated", {
    userId,
    locationPrecision: privacySettings.locationPrecision,
  })

  return withCors(
    ok({
      privacySettings:
        (updated.privacySettings as PrivacySettings | null) ??
        privacySettings,
    }),
    req
  )
}
