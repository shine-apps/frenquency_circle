import { asc } from "drizzle-orm"

import { db } from "@/lib/db"
import { systemSettings } from "@/db/schema"
import { CACHE_TTL, cacheKeys, cacheMdel, cacheWrap } from "@/lib/cache"
import type { SystemSettingDTO } from "@/types/api"

/**
 * 系统设置读取与缓存失效。
 *
 * 设置项为「低频写入、高频读取」:公开 `/api/settings`、内容审核开关、
 * 管理端设置页都从这里取数;管理员 PATCH 后调用 `invalidateSettingsCache`
 * 立即失效,其余场景由 60s TTL 兜底。
 */

/** 读取全量设置项(带缓存,按 key 升序) */
export async function getSystemSettingsCached(): Promise<SystemSettingDTO[]> {
  return cacheWrap(
    cacheKeys.settingsAll(),
    async () => {
      const rows = await db
        .select({ key: systemSettings.key, value: systemSettings.value })
        .from(systemSettings)
        .orderBy(asc(systemSettings.key))
      return rows.map<SystemSettingDTO>((row) => ({ key: row.key, value: row.value }))
    },
    CACHE_TTL.SETTINGS
  )
}

/**
 * 失效设置缓存:删除全量列表与该项单项缓存。
 * 由 `PATCH /api/admin/settings` 在写入成功后调用。
 *
 * 单项 key 当前无人写入(合规开关改直读数据库),保留删除以便后续恢复单项缓存时不漏失效。
 */
export async function invalidateSettingsCache(key: string): Promise<void> {
  await cacheMdel([cacheKeys.settingsAll(), cacheKeys.settingsItem(key)])
}
