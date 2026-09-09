import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { systemSettings } from "@/db/schema"
import { SettingsForm } from "./_components/settings-form"

export const dynamic = "force-dynamic"

export default async function AdminSettingsPage() {
  const [setting] = await db
    .select()
    .from(systemSettings)
    .where(eq(systemSettings.key, "isAppDeploying"))
    .limit(1)

  return (
    <main className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">系统设置</h1>
        <p className="text-sm text-muted-foreground">
          管理小程序端运行时读取的系统设置项,保存后小程序端在下次拉取设置时生效。
        </p>
      </div>
      <SettingsForm initialIsAppDeploying={setting?.value === true} />
    </main>
  )
}
