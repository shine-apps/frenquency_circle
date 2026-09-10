"use client"

import { useState, useTransition } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Loader2Icon, SearchIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { USER_ROLE_OPTIONS } from "@/lib/user-role"
import { isValidUserSearchKeyword } from "@/lib/user-search-keyword"
import type { UserRole } from "@/types/api"

/**
 * 用户搜索框：按完整手机号或邮箱精确检索，并可叠加角色过滤。
 *
 * 点击「搜索」按钮或回车后，先在本地校验关键词格式：
 * - 格式不合法：仅提示错误，不发起任何请求（服务端不会查库）；
 * - 格式合法（或未填关键词）：以 URL 查询参数 `q` / `role` 触发服务端查询。
 *
 * @param defaultValue 初始关键词（来自 URL，用于刷新/回填）
 * @param defaultRole  初始角色过滤值（来自 URL）
 * @param invalid      服务端对 URL 中关键词的校验结果（直接改 URL 访问时兜底）
 */
export function UsersSearch({
  defaultValue = "",
  defaultRole = "",
  invalid = false,
}: {
  defaultValue?: string
  defaultRole?: UserRole | ""
  invalid?: boolean
}) {
  const router = useRouter()
  const pathname = usePathname()
  const [value, setValue] = useState(defaultValue)
  const [role, setRole] = useState<UserRole | "">(defaultRole)
  const [formatError, setFormatError] = useState(false)
  const [isPending, startTransition] = useTransition()

  function search(nextValue: string, nextRole: UserRole | "") {
    const trimmed = nextValue.trim()
    // 格式不合法：不改动 URL，不发起请求
    if (trimmed && !isValidUserSearchKeyword(trimmed)) {
      setFormatError(true)
      return
    }

    setFormatError(false)
    const params = new URLSearchParams()
    if (trimmed) params.set("q", trimmed)
    if (nextRole) params.set("role", nextRole)
    const query = params.toString()

    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname)
    })
  }

  const showError = formatError || invalid

  return (
    <div className="space-y-1">
      <form
        className="flex max-w-xl flex-wrap items-center justify-between gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          search(value, role)
        }}
      >
        <div className="relative min-w-72 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={value}
            onChange={(e) => {
              setValue(e.target.value)
              setFormatError(false)
            }}
            placeholder="输入完整手机号或邮箱"
            aria-label="按手机号或邮箱搜索用户"
            aria-invalid={showError}
            className="pl-8"
          />
          {value && !isPending ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="清空搜索"
              className="absolute top-1/2 right-0.5 -translate-y-1/2"
              onClick={() => setValue("")}
            >
              <XIcon />
            </Button>
          ) : null}
        </div>

        <select
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
          value={role}
          aria-label="按角色过滤"
          onChange={(e) => setRole(e.target.value as UserRole | "")}
        >
          <option value="">全部角色</option>
          {USER_ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2Icon className="animate-spin" /> : <SearchIcon />}
          搜索
        </Button>
      </form>
      {showError ? (
        <p className="text-xs text-destructive">
          手机号或邮箱格式不正确，请输入完整的手机号（11 位）或邮箱地址
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          按完整手机号或邮箱精确检索，可叠加角色过滤；不填关键词时仅按角色筛选
        </p>
      )}
    </div>
  )
}
