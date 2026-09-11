import { QuestionsManager } from "./_components/questions-manager"

export const dynamic = "force-dynamic"

export default function AdminMbtiQuestionsPage() {
  return (
    <main className="p-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">MBTI 题目管理</h1>
        <p className="text-sm text-muted-foreground">
          管理测试题库（新增 / 编辑 / 停用 / 删除）。停用的题目不参与测试与计分。
        </p>
      </div>
      <QuestionsManager />
    </main>
  )
}
