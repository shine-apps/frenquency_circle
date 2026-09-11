import Link from "next/link"

import { Button } from "@/components/ui/button"
import { ScoresManager } from "./_components/scores-manager"

export const dynamic = "force-dynamic"

export default function AdminMbtiScoresPage() {
  return (
    <main className="p-6">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">MBTI 兴趣推荐概率矩阵</h1>
          <p className="text-sm text-muted-foreground">
            每个兴趣对 16 种人格各有一个推荐概率（0-100）。测试结果按该型的概率降序推荐。
            支持「按类型」或「按标签」两种视角配置。
          </p>
        </div>
        <Button variant="outline" render={<Link href="/admin/mbti/questions" />}>
          题库管理
        </Button>
      </div>
      <ScoresManager />
    </main>
  )
}
