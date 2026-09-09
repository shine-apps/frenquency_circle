import { z } from "zod"

import { db } from "@/lib/db"
import { systemSettings } from "@/db/schema"
import { fail, ok } from "@/lib/api"
import { requireAdmin } from "@/lib/auth-utils"
import { logger, LOG_PREFIX } from "@/lib/logger"

/**
 * 更新系统设置请求体 schema。
 * - key: 设置项主键,白名单枚举(新增设置项时在此扩展)
 * - value: 按 key 约束类型(isAppDeploying 为 boolean)
 */
const updateSettingSchema = z.object({
  key: z.enum(["isAppDeploying"]),
  value: z.boolean(),
})

/**
 * PATCH /api/admin/settings
 *
 * 管理员更新(或新增)系统设置项,upsert 语义。
 * 例如 isAppDeploying:管理员切换后,小程序端在下次拉取 /api/settings 时生效。
 *
 * 响应:`SystemSettingDTO`(更新后的设置项)
 */
export async function PATCH(req: Request) {
  const guard = await requireAdmin()
  if (!guard.ok) return guard.response

  const body = await req.json().catch(() => null)
  const parsed = updateSettingSchema.safeParse(body)
  if (!parsed.success) {
    return fail(400, "Invalid request body", parsed.error.flatten())
  }

  const { key, value } = parsed.data

  const [updated] = await db
    .insert(systemSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value, updatedAt: new Date() },
    })
    .returning()

  logger.info(LOG_PREFIX.ADMIN, "System setting updated", {
    key,
    by: guard.userId,
  })

  return ok({ key: updated.key, value: updated.value })
}
