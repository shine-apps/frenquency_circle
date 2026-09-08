import { asc } from "drizzle-orm"

import { db } from "@/lib/db"
import { systemSettings } from "@/db/schema"
import { corsOptions, ok, withCors } from "@/lib/api"
import type { SystemSettingDTO } from "@/types/api"

/**
 * GET /api/settings
 *
 * 系统设置公开接口(无需登录)。
 *
 * - 查询 `system_settings` 表,按 key 升序返回 key/value 数组;
 * - `value` 为 JSONB,原样透传(对象 / 数组 / 原始值),不做字符串化;
 * - H5 跨域需要 CORS 头,故返回 `withCors(ok(list), req)`;小程序端不受影响。
 *
 * 响应:`IResponse<SystemSettingDTO[]>`
 */
export function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function GET(req: Request) {
  const rows = await db
    .select({ key: systemSettings.key, value: systemSettings.value })
    .from(systemSettings)
    .orderBy(asc(systemSettings.key))

  const list: SystemSettingDTO[] = rows.map((row) => ({
    key: row.key,
    value: row.value,
  }))

  return withCors(ok(list), req)
}
