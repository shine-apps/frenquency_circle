import { Suspense } from "react"
import { LoginTabs } from "./login-tabs"

export const dynamic = "force-dynamic"

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Suspense
        fallback={
          <div className="text-sm text-muted-foreground">加载中…</div>
        }
      >
        <LoginTabs />
      </Suspense>
    </main>
  )
}
