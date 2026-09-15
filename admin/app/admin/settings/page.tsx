import { inArray } from "drizzle-orm"

import { db } from "@/lib/db"
import { systemSettings } from "@/db/schema"
import { SettingsForm } from "./_components/settings-form"

export const dynamic = "force-dynamic"

/** 本页展示的设置项 key 列表(新增设置项时在此扩展) */
const SETTING_KEYS = ["isAppDeploying", "contentModerationEnabled"]

export default async function AdminSettingsPage() {
  const rows = await db
    .select()
    .from(systemSettings)
    .where(inArray(systemSettings.key, SETTING_KEYS))

  const isAppDeploying =
    rows.find((row) => row.key === "isAppDeploying")?.value === true
  const contentModerationEnabled =
    rows.find((row) => row.key === "contentModerationEnabled")?.value === true

  return (
    <main className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">系统设置</h1>
        <p className="text-sm text-muted-foreground">
          管理小程序端运行时读取的系统设置项,保存后小程序端在下次拉取设置时生效。
        </p>
      </div>
      <SettingsForm
        initialIsAppDeploying={isAppDeploying}
        initialContentModerationEnabled={contentModerationEnabled}
      />
    </main>
  )
}
