import { z } from "zod"
import { signIn } from "@/auth"
import { fail, ok } from "@/lib/api"
import { logger, LOG_PREFIX } from "@/lib/logger"

/**
 * 微信小程序手机号登录入口。
 *
 * 客户端调用流程：
 * 1. wx.login() 拿 js_code
 * 2. 用户点击 <button open-type="getPhoneNumber"> 拿到 phoneCode
 * 3. POST /api/auth/wechat-miniprogram/login, body: { code, phoneCode }
 * 4. 成功后 Auth.js 通过 Set-Cookie 写入 session-token
 *
 * 微信小程序 wx.request 不强制 CORS，无需额外 CORS 头。
 */
const loginSchema = z.object({
  code: z.string().min(1),
  phoneCode: z.string().min(1),
})

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    logger.warn(LOG_PREFIX.WECHAT, "Login rejected: invalid body")
    return fail(400, "无效的请求参数", parsed.error.flatten())
  }

  try {
    const result = await signIn("wechat-miniprogram", {
      code: parsed.data.code,
      phoneCode: parsed.data.phoneCode,
      redirect: false,
    })
    if (result?.error) {
      logger.warn(LOG_PREFIX.WECHAT, "signIn returned error", {
        error: result.error,
      })
      return fail(401, "登录失败")
    }
    return ok({ provider: "wechat-miniprogram" })
  } catch (err) {
    logger.error(LOG_PREFIX.WECHAT, "signIn threw", { error: errMessage(err) })
    return fail(500, "登录服务异常")
  }
}
