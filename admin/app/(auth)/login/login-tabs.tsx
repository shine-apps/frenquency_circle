"use client"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LoginForm } from "./login-form"
import { PhoneLoginForm } from "./phone-login-form"

export function LoginTabs() {
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">后台登录</CardTitle>
        <CardDescription>
          使用管理员账号登录 frenqency_circle 后台。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="email">
          <TabsList className="mb-4">
            <TabsTrigger value="email">邮箱密码</TabsTrigger>
            <TabsTrigger value="phone">手机验证码</TabsTrigger>
          </TabsList>
          <TabsContent value="email">
            <LoginForm />
          </TabsContent>
          <TabsContent value="phone">
            <PhoneLoginForm />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
