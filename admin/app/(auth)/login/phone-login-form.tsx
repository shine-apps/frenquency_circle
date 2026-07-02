"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { signIn } from "next-auth/react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { IResponse } from "@/types/api"

const COUNTDOWN_SECONDS = 60

export function PhoneLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get("callbackUrl") || "/admin"

  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [isPending, startTransition] = useTransition()
  const [sending, setSending] = useState(false)
  const [countdown, setCountdown] = useState(0)

  const handleSendCode = () => {
    if (!phone.trim()) {
      toast.error("请输入手机号")
      return
    }
    setSending(true)
    fetch("/api/auth/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as IResponse<null> | null
        if (!res.ok || !body) {
          toast.error("发送失败", {
            description: body?.message ?? "请稍后重试。",
          })
          return
        }
        toast.success("验证码已发送")
        // 启动 60s 倒计时
        setCountdown(COUNTDOWN_SECONDS)
        const timer = setInterval(() => {
          setCountdown((n) => {
            if (n <= 1) {
              clearInterval(timer)
              return 0
            }
            return n - 1
          })
        }, 1000)
      })
      .catch(() => {
        toast.error("发送失败", { description: "网络异常，请稍后重试。" })
      })
      .finally(() => setSending(false))
  }

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    startTransition(async () => {
      const res = await signIn("phone", {
        phone,
        code,
        redirect: false,
      })
      if (!res || res.error) {
        toast.error("登录失败", {
          description: "手机号或验证码错误。",
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
        <Label htmlFor="phone">手机号</Label>
        <Input
          id="phone"
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          required
          placeholder="请输入手机号"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="code">验证码</Label>
        <div className="flex gap-2">
          <Input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            placeholder="6 位验证码"
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleSendCode}
            disabled={sending || countdown > 0}
            className="shrink-0"
          >
            {countdown > 0 ? `${countdown}s` : "获取验证码"}
          </Button>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? "登录中…" : "登录"}
      </Button>
    </form>
  )
}
