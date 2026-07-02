"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") || "/admin"

  // 仅开发环境预填默认管理员凭据，生产环境留空避免泄露
  const [email, setEmail] = useState(
    process.env.NODE_ENV === "development" ? "admin@example.com" : ""
  )
  const [password, setPassword] = useState(
    process.env.NODE_ENV === "development" ? "admin123" : ""
  )
  const [isPending, startTransition] = useTransition()

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    startTransition(async () => {
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      })
      if (!res || res.error) {
        toast.error("登录失败", {
          description: "邮箱或密码错误，请重试。",
        })
        return
      }
      toast.success("登录成功")
      router.push(callbackUrl)
      router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">邮箱</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">密码</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "登录中…" : "登录"}
      </Button>
    </form>
  )
}
