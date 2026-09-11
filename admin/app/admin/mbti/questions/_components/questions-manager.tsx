"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

type MbtiQuestion = {
  id: string
  dimension: "EI" | "SN" | "TF" | "JP"
  stem: string
  optionA: string
  optionB: string
  optionAScore: string
  optionBScore: string
  sortOrder: number
  status: "active" | "disabled"
}

const DIMENSION_LABELS: Record<string, string> = {
  EI: "外向 E / 内向 I",
  SN: "实感 S / 直觉 N",
  TF: "思考 T / 情感 F",
  JP: "判断 J / 知觉 P",
}

const emptyForm = {
  dimension: "EI",
  stem: "",
  optionA: "",
  optionB: "",
  optionAScore: "E",
  optionBScore: "I",
  sortOrder: 0,
}

export function QuestionsManager() {
  const [questions, setQuestions] = useState<MbtiQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/mbti/questions")
      const body = await res.json()
      if (!res.ok || body.code !== 200) {
        throw new Error(body.message ?? "加载失败")
      }
      setQuestions(body.data.list)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setFormOpen(true)
  }

  function openEdit(q: MbtiQuestion) {
    setEditingId(q.id)
    setForm({
      dimension: q.dimension,
      stem: q.stem,
      optionA: q.optionA,
      optionB: q.optionB,
      optionAScore: q.optionAScore,
      optionBScore: q.optionBScore,
      sortOrder: q.sortOrder,
    })
    setFormOpen(true)
  }

  /** 弹窗关闭时清空编辑态,避免下次新增残留上一次的编辑内容 */
  function handleFormOpenChange(open: boolean) {
    setFormOpen(open)
    if (!open) {
      setEditingId(null)
      setForm(emptyForm)
    }
  }

  async function saveQuestion() {
    setSaving(true)
    try {
      const res = await fetch(
        editingId
          ? `/api/admin/mbti/questions/${editingId}`
          : "/api/admin/mbti/questions",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      )
      const body = await res.json()
      const expectedCode = editingId ? 200 : 201
      if (!res.ok || body.code !== expectedCode) {
        throw new Error(body.message ?? (editingId ? "更新失败" : "创建失败"))
      }
      toast.success(editingId ? "题目已更新" : "题目已创建")
      setFormOpen(false)
      setEditingId(null)
      setForm(emptyForm)
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  async function patchQuestion(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/admin/mbti/questions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    })
    const body = await res.json()
    if (!res.ok || body.code !== 200) {
      toast.error(body.message ?? "更新失败")
      return
    }
    toast.success("已更新")
    await load()
  }

  async function deleteQuestion(id: string) {
    const res = await fetch(`/api/admin/mbti/questions/${id}`, {
      method: "DELETE",
    })
    const body = await res.json()
    if (!res.ok || body.code !== 200) {
      toast.error(body.message ?? "删除失败")
      return
    }
    toast.success("已删除")
    await load()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          共 {questions.length} 题（active {questions.filter((q) => q.status === "active").length} 题）
        </p>
        <Dialog open={formOpen} onOpenChange={handleFormOpenChange}>
          <DialogTrigger render={<Button onClick={openCreate}>新增题目</Button>} />
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingId ? "编辑 MBTI 题目" : "新增 MBTI 题目"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>维度</Label>
                  <select
                    className="w-full rounded-md border bg-background px-2 py-2 text-sm"
                    value={form.dimension}
                    onChange={(e) => {
                      const dimension = e.target.value
                      const pair: Record<string, [string, string]> = {
                        EI: ["E", "I"],
                        SN: ["N", "S"],
                        TF: ["F", "T"],
                        JP: ["J", "P"],
                      }
                      const [a, b] = pair[dimension]
                      setForm((f) => ({
                        ...f,
                        dimension,
                        optionAScore: a,
                        optionBScore: b,
                      }))
                    }}
                  >
                    {Object.entries(DIMENSION_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label>排序（0 表示排到末尾）</Label>
                  <Input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>题干</Label>
                <Input
                  value={form.stem}
                  onChange={(e) => setForm((f) => ({ ...f, stem: e.target.value }))}
                  placeholder="如：周末有空时，你更倾向于——"
                />
              </div>
              <div className="space-y-1">
                <Label>选项 A（计分 {form.optionAScore}）</Label>
                <Input
                  value={form.optionA}
                  onChange={(e) => setForm((f) => ({ ...f, optionA: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>选项 B（计分 {form.optionBScore}）</Label>
                <Input
                  value={form.optionB}
                  onChange={(e) => setForm((f) => ({ ...f, optionB: e.target.value }))}
                />
              </div>
              <Button onClick={saveQuestion} disabled={saving} className="w-full">
                {saving ? "保存中…" : "保存"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead className="w-24">维度</TableHead>
              <TableHead>题干</TableHead>
              <TableHead>选项 A / B</TableHead>
              <TableHead className="w-20">状态</TableHead>
              <TableHead className="w-44">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  加载中…
                </TableCell>
              </TableRow>
            ) : questions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground">
                  暂无题目，请先执行 seed 或新增
                </TableCell>
              </TableRow>
            ) : (
              questions.map((q) => (
                <TableRow key={q.id}>
                  <TableCell>{q.sortOrder}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{q.dimension}</Badge>
                  </TableCell>
                  <TableCell className="max-w-64 truncate">{q.stem}</TableCell>
                  <TableCell className="max-w-72">
                    <div className="truncate text-sm">
                      A（{q.optionAScore}）：{q.optionA}
                    </div>
                    <div className="truncate text-sm">
                      B（{q.optionBScore}）：{q.optionB}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={q.status === "active" ? "default" : "outline"}>
                      {q.status === "active" ? "启用" : "停用"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEdit(q)}
                      >
                        编辑
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          patchQuestion(q.id, {
                            status: q.status === "active" ? "disabled" : "active",
                          })
                        }
                      >
                        {q.status === "active" ? "停用" : "启用"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => deleteQuestion(q.id)}
                      >
                        删除
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
