"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/** 单条概率矩阵记录(双视角共用结构) */
type MbtiScoreRow = {
  id: string
  hobbyTagId: string
  tagName: string
  categoryName: string | null
  typeCode: string
  matchProbability: number
  reason: string
  status: "active" | "disabled"
  sortOrder: number
}

type TagOption = { id: string; name: string; category: string }

const MBTI_GROUPS: { label: string; codes: string[] }[] = [
  { label: "分析家 (NT)", codes: ["INTJ", "INTP", "ENTJ", "ENTP"] },
  { label: "外交家 (NF)", codes: ["INFJ", "INFP", "ENFJ", "ENFP"] },
  { label: "守护者 (SJ)", codes: ["ISTJ", "ISFJ", "ESTJ", "ESFJ"] },
  { label: "探险家 (SP)", codes: ["ISTP", "ISFP", "ESTP", "ESFP"] },
]

export function ScoresManager() {
  const [view, setView] = useState("type")

  // ===== 按类型视角 =====
  const [typeCode, setTypeCode] = useState<string>("INTJ")
  const [typeRows, setTypeRows] = useState<MbtiScoreRow[]>([])
  const [typeLoading, setTypeLoading] = useState(false)
  // 新增推荐表单
  const [tagQuery, setTagQuery] = useState("")
  const [tagOptions, setTagOptions] = useState<TagOption[]>([])
  const [newTagId, setNewTagId] = useState("")
  const [newProb, setNewProb] = useState(80)
  const [newReason, setNewReason] = useState("")

  // ===== 按标签视角 =====
  const [vectorTag, setVectorTag] = useState<TagOption | null>(null)
  const [vectorRows, setVectorRows] = useState<MbtiScoreRow[]>([])

  const loadTypeRows = useCallback(async (code: string) => {
    setTypeLoading(true)
    try {
      const res = await fetch(`/api/admin/mbti/scores?typeCode=${code}`)
      const body = await res.json()
      if (!res.ok || body.code !== 200) {
        throw new Error(body.message ?? "加载失败")
      }
      setTypeRows(body.data.list)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败")
    } finally {
      setTypeLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadTypeRows(typeCode)
  }, [typeCode, loadTypeRows])

  // 标签搜索(防抖)
  useEffect(() => {
    if (!tagQuery.trim()) {
      setTagOptions([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/mbti/hobby-tags?q=${encodeURIComponent(tagQuery)}&limit=10`
        )
        const body = await res.json()
        if (res.ok && body.code === 200) {
          setTagOptions(body.data.list)
        }
      } catch {
        // 静默失败,下拉为空即可
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [tagQuery])

  async function upsertScore(payload: {
    hobbyTagId: string
    typeCode: string
    matchProbability: number
    reason: string
  }) {
    const res = await fetch("/api/admin/mbti/scores", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    const body = await res.json()
    if (!res.ok || (body.code !== 200 && body.code !== 201)) {
      toast.error(body.message ?? "保存失败")
      return false
    }
    toast.success("已保存")
    return true
  }

  async function addForType() {
    if (!newTagId || !newReason.trim()) {
      toast.error("请选择标签并填写推荐理由")
      return
    }
    const okSaved = await upsertScore({
      hobbyTagId: newTagId,
      typeCode,
      matchProbability: newProb,
      reason: newReason,
    })
    if (okSaved) {
      setNewTagId("")
      setTagQuery("")
      setNewReason("")
      setNewProb(80)
      await loadTypeRows(typeCode)
    }
  }

  async function patchScore(id: string, updates: Record<string, unknown>) {
    const res = await fetch(`/api/admin/mbti/scores/${id}`, {
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
    await loadTypeRows(typeCode)
    if (vectorTag) await loadVector(vectorTag.id)
  }

  async function deleteScore(id: string) {
    const res = await fetch(`/api/admin/mbti/scores/${id}`, { method: "DELETE" })
    const body = await res.json()
    if (!res.ok || body.code !== 200) {
      toast.error(body.message ?? "删除失败")
      return
    }
    toast.success("已删除")
    await loadTypeRows(typeCode)
    if (vectorTag) await loadVector(vectorTag.id)
  }

  async function loadVector(tagId: string) {
    const res = await fetch(`/api/admin/mbti/scores?tagId=${tagId}`)
    const body = await res.json()
    if (!res.ok || body.code !== 200) {
      toast.error(body.message ?? "加载失败")
      return
    }
    setVectorRows(body.data.list)
  }

  function selectTagForVector(tag: TagOption) {
    setVectorTag(tag)
    void loadVector(tag.id)
  }

  return (
    <Tabs value={view} onValueChange={(v) => setView(v)}>
      <TabsList>
        <TabsTrigger value="type">按类型配置</TabsTrigger>
        <TabsTrigger value="tag">按标签配置</TabsTrigger>
      </TabsList>

      {/* ===== 按类型 ===== */}
      <TabsContent value="type">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {MBTI_GROUPS.map((group) => (
            <div key={group.label} className="flex items-center gap-1">
              <span className="mr-1 text-xs text-muted-foreground">{group.label}</span>
              {group.codes.map((code) => (
                <Button
                  key={code}
                  size="sm"
                  variant={code === typeCode ? "default" : "outline"}
                  onClick={() => setTypeCode(code)}
                >
                  {code}
                </Button>
              ))}
            </div>
          ))}
        </div>

        {/* 新增推荐 */}
        <div className="mb-4 grid grid-cols-12 items-end gap-2 rounded-lg border p-3">
          <div className="col-span-3 space-y-1">
            <Label>搜索兴趣标签</Label>
            <Input
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              placeholder="如：书法 / 摄影"
            />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>选中标签</Label>
            <select
              className="w-full rounded-md border bg-background px-2 py-2 text-sm"
              value={newTagId}
              onChange={(e) => setNewTagId(e.target.value)}
            >
              <option value="">— 选择 —</option>
              {tagOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}（{t.category}）
                </option>
              ))}
            </select>
          </div>
          <div className="col-span-2 space-y-1">
            <Label>概率 0-100</Label>
            <Input
              type="number"
              min={0}
              max={100}
              value={newProb}
              onChange={(e) => setNewProb(Number(e.target.value))}
            />
          </div>
          <div className="col-span-3 space-y-1">
            <Label>推荐理由</Label>
            <Input
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder="为何该兴趣适合该人格"
            />
          </div>
          <div className="col-span-2">
            <Button onClick={addForType} className="w-full">
              新增 / 更新
            </Button>
          </div>
        </div>

        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>兴趣标签</TableHead>
                <TableHead>分类</TableHead>
                <TableHead className="w-24">概率</TableHead>
                <TableHead>推荐理由</TableHead>
                <TableHead className="w-20">状态</TableHead>
                <TableHead className="w-32">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {typeLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    加载中…
                  </TableCell>
                </TableRow>
              ) : typeRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    该类型暂无推荐，请在上方新增
                  </TableCell>
                </TableRow>
              ) : (
                typeRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.tagName}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {row.categoryName ?? "-"}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        defaultValue={row.matchProbability}
                        className="h-8 w-20"
                        onBlur={(e) => {
                          const v = Number(e.target.value)
                          if (v !== row.matchProbability) {
                            void patchScore(row.id, { matchProbability: v })
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell className="max-w-96">
                      <Input
                        defaultValue={row.reason}
                        className="h-8"
                        onBlur={(e) => {
                          if (e.target.value !== row.reason) {
                            void patchScore(row.id, { reason: e.target.value })
                          }
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === "active" ? "default" : "outline"}>
                        {row.status === "active" ? "启用" : "停用"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            patchScore(row.id, {
                              status: row.status === "active" ? "disabled" : "active",
                            })
                          }
                        >
                          {row.status === "active" ? "停用" : "启用"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => deleteScore(row.id)}>
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
      </TabsContent>

      {/* ===== 按标签 ===== */}
      <TabsContent value="tag">
        <div className="mb-4 space-y-2">
          <Label>搜索兴趣标签，查看其对 16 型的概率向量</Label>
          <div className="grid grid-cols-12 gap-2">
            <div className="col-span-5">
              <TagSearchSelect onSelect={selectTagForVector} />
            </div>
          </div>
          {vectorTag && (
            <p className="text-sm text-muted-foreground">
              当前标签：<span className="font-medium text-foreground">{vectorTag.name}</span>
              （{vectorTag.category}）— 点击下方概率可编辑，保存后立即生效。
            </p>
          )}
        </div>

        {vectorTag ? (
          <div className="space-y-3">
            {MBTI_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="mb-1 text-xs font-medium text-muted-foreground">{group.label}</p>
                <div className="grid grid-cols-4 gap-2">
                  {group.codes.map((code) => (
                    <VectorCell
                      key={code}
                      code={code}
                      row={vectorRows.find((r) => r.typeCode === code) ?? null}
                      tagId={vectorTag.id}
                      onSaved={() => void loadVector(vectorTag.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">请先搜索并选择一个标签。</p>
        )}
      </TabsContent>
    </Tabs>
  )
}

/** 标签搜索下拉 */
function TagSearchSelect({ onSelect }: { onSelect: (tag: TagOption) => void }) {
  const [query, setQuery] = useState("")
  const [options, setOptions] = useState<TagOption[]>([])

  useEffect(() => {
    if (!query.trim()) {
      setOptions([])
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/mbti/hobby-tags?q=${encodeURIComponent(query)}&limit=10`
        )
        const body = await res.json()
        if (res.ok && body.code === 200) setOptions(body.data.list)
      } catch {
        // 静默失败
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  return (
    <div className="space-y-1">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="输入关键词搜索标签"
      />
      {options.length > 0 && (
        <div className="max-h-48 overflow-auto rounded-md border bg-background">
          {options.map((t) => (
            <button
              key={t.id}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
              onClick={() => {
                onSelect(t)
                setOptions([])
                setQuery(t.name)
              }}
            >
              {t.name}
              <span className="ml-2 text-xs text-muted-foreground">{t.category}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** 单个「标签 × 类型」概率编辑格 */
function VectorCell({
  code,
  row,
  tagId,
  onSaved,
}: {
  code: string
  row: MbtiScoreRow | null
  tagId: string
  onSaved: () => void
}) {
  const [prob, setProb] = useState(row?.matchProbability ?? 0)
  const [reason, setReason] = useState(row?.reason ?? "")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setProb(row?.matchProbability ?? 0)
    setReason(row?.reason ?? "")
  }, [row])

  async function save() {
    if (!row && prob <= 0) {
      toast.error(`${code}: 概率为 0 时无需配置`)
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/admin/mbti/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hobbyTagId: tagId,
          typeCode: code,
          matchProbability: prob,
          reason: reason || `${code} 适配兴趣`,
        }),
      })
      const body = await res.json()
      if (!res.ok || (body.code !== 200 && body.code !== 201)) {
        throw new Error(body.message ?? "保存失败")
      }
      toast.success(`${code} 已保存`)
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-md border p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold">{code}</span>
        {row?.status === "disabled" && <Badge variant="outline">停用</Badge>}
      </div>
      <Input
        type="number"
        min={0}
        max={100}
        value={prob}
        onChange={(e) => setProb(Number(e.target.value))}
        className="h-7 text-sm"
      />
      <textarea
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="推荐理由"
        className="mt-1 h-14 w-full rounded-md border bg-background px-2 py-1 text-xs"
      />
      <Button size="sm" variant="outline" className="mt-1 w-full" onClick={save} disabled={saving}>
        保存
      </Button>
    </div>
  )
}
