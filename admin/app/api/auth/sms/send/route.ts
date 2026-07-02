import { NextResponse } from "next/server"
import { z } from "zod"
import { fail } from "@/lib/api"
import type { IResponse } from "@/types/api"
import { isValidPhone, normalizePhone } from "@/lib/sms/phone"
import { issueCode } from "@/lib/sms/phone-code-service"
import { createSmsSender } from "@/lib/sms/sms-sender"
import { rateLimiter } from "@/lib/sms/rate-limit"
import { logger, LOG_PREFIX } from "@/lib/logger"

const sendCodeSchema = z.object({
  phone: z.string().min(1),
})

/**
 * 提取客户端 IP：优先 x-forwarded-for 首段，其次 x-real-ip，最后回退 "unknown"。
 */
function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for")
  if (xff) {
    const first = xff.split(",")[0]?.trim()
    if (first) return first
  }
  return req.headers.get("x-real-ip") ?? "unknown"
}

export async function POST(req: Request) {
  // 1. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = sendCodeSchema.safeParse(body)
  if (!parsed.success) {
    logger.warn(LOG_PREFIX.SMS, "Send rejected: invalid body")
    return fail(400, "无效的请求参数", parsed.error.flatten())
  }

  // 2. 校验手机号格式（在限流消费之前，避免用畸形请求耗尽 IP 配额）
  if (!isValidPhone(parsed.data.phone)) {
    logger.warn(LOG_PREFIX.SMS, "Send rejected: invalid phone format", {
      phone: parsed.data.phone,
    })
    return fail(400, "手机号格式不正确")
  }
  const phone = normalizePhone(parsed.data.phone)

  // 3. IP 限流
  const ip = getClientIp(req)
  const ipResult = rateLimiter.checkAndConsumeIp(ip)
  if (!ipResult.ok) {
    logger.warn(LOG_PREFIX.SMS, "Send rejected: ip rate limited", { ip })
    return fail(429, "请求过于频繁，请稍后再试")
  }

  // 4. 手机号限流
  const phoneResult = rateLimiter.checkAndConsumePhone(phone)
  if (!phoneResult.ok) {
    logger.warn(LOG_PREFIX.SMS, "Send rejected: phone rate limited", {
      phone,
      reason: phoneResult.reason,
    })
    if (phoneResult.reason === "cooldown") {
      return fail(429, "验证码已发送，请60秒后重试")
    }
    return fail(429, "发送次数过多，请稍后再试")
  }

  // 5. 生成并持久化验证码
  let code: string
  try {
    code = await issueCode(phone)
  } catch (err) {
    logger.error(LOG_PREFIX.SMS, "Issue code failed", {
      phone,
      error: err instanceof Error ? err.message : String(err),
    })
    return fail(500, "验证码生成失败，请稍后再试")
  }

  // 6. 发送短信
  const sender = createSmsSender()
  const result = await sender.send(phone, code)
  if (!result.ok) {
    // 不回滚已写入的记录：限流配额已消费，验证码单次有效且会过期。
    // 避免失败后立即重试对 SMS 提供商造成压力。
    logger.error(LOG_PREFIX.SMS, "Send failed", {
      phone,
      error: result.error,
    })
    return fail(502, "短信发送失败，请稍后再试")
  }

  logger.info(LOG_PREFIX.SMS, "Code sent", { phone, ip })

  // 响应与用户是否存在无关，防止手机号枚举
  const responseBody: IResponse<null> = {
    code: 201,
    data: null,
    message: "验证码已发送",
  }
  return NextResponse.json(responseBody, { status: 201 })
}
