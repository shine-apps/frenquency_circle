import { AliyunSmsSender } from "./aliyun-sms"

/**
 * 短信发送结果。
 * - `{ ok: true }` 表示发送成功。
 * - `{ ok: false, error }` 表示发送失败，`error` 为错误描述（用于日志，不直接返回给客户端）。
 */
export type SendResult = { ok: true } | { ok: false; error: string }

export interface SmsSender {
  send(phone: string, code: string): Promise<SendResult>
}

/**
 * 开发用短信发送器：将验证码输出到控制台，永远返回成功。
 * 在未配置 Aliyun 凭证时自动启用，便于本地开发与测试。
 */
class ConsoleSmsSender implements SmsSender {
  async send(phone: string, code: string): Promise<SendResult> {
    console.log(`[SMS DEV] To ${phone}: your code is ${code}`)
    return { ok: true }
  }
}

let cached: SmsSender | null = null

/**
 * 创建/复用短信发送器。
 * - 若设置了 `ALIYUN_SMS_ACCESS_KEY_ID`，返回 AliyunSmsSender。
 * - 否则返回 ConsoleSmsSender（开发模式）。
 */
export function createSmsSender(): SmsSender {
  if (cached) return cached
  const hasAliyunCreds = !!process.env.ALIYUN_SMS_ACCESS_KEY_ID
  cached = hasAliyunCreds ? new AliyunSmsSender() : new ConsoleSmsSender()
  return cached
}
