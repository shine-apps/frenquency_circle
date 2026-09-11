import { NextResponse } from "next/server"
import { z } from "zod"
import { corsOptions, fail, getClientIp, withCors } from "@/lib/api"
import type { IResponse } from "@/types/api"
import { isValidPhone, normalizePhone } from "@/lib/sms/phone"
import { isIssueCapped, issueCode } from "@/lib/sms/phone-code-service"
import { createSmsSender } from "@/lib/sms/sms-sender"
import { rateLimiter } from "@/lib/sms/rate-limit"
import { logger, LOG_PREFIX } from "@/lib/logger"

const sendCodeSchema = z.object({
  phone: z.string().min(1),
})

export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  // 1. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = sendCodeSchema.safeParse(body)
  if (!parsed.success) {
    logger.warn(LOG_PREFIX.SMS, "Send rejected: invalid body")
    return withCors(
      fail(400, "无效的请求参数", parsed.error.flatten()),
      req
    )
  }

  // 2. 校验手机号格式（在限流消费之前，避免用畸形请求耗尽 IP 配额）
  if (!isValidPhone(parsed.data.phone)) {
    logger.warn(LOG_PREFIX.SMS, "Send rejected: invalid phone format", {
      phone: parsed.data.phone,
    })
    return withCors(fail(400, "手机号格式不正确"), req)
  }
  const phone = normalizePhone(parsed.data.phone)

  // 3. IP 限流
  const ip = getClientIp(req)
  const ipResult = rateLimiter.checkAndConsumeIp(ip)
  if (!ipResult.ok) {
    logger.warn(LOG_PREFIX.SMS, "Send rejected: ip rate limited", { ip })
    return withCors(fail(429, "请求过于频繁，请稍后再试"), req)
  }

  // 4. 手机号限流
  const phoneResult = rateLimiter.checkAndConsumePhone(phone)
  if (!phoneResult.ok) {
    logger.warn(LOG_PREFIX.SMS, "Send rejected: phone rate limited", {
      phone,
      reason: phoneResult.reason,
    })
    if (phoneResult.reason === "cooldown") {
      return withCors(fail(429, "验证码已发送，请60秒后重试"), req)
    }
    return withCors(fail(429, "发送次数过多，请稍后再试"), req)
  }

  // 5. DB 维度的发放上限兜底:进程内限流器是实例本地的,多实例部署时
  //    无法反映全局发放量,这里直接用发放记录做「按手机号」的全局上限
  if (await isIssueCapped(phone)) {
    logger.warn(LOG_PREFIX.SMS, "Send rejected: phone issue cap reached", {
      phone,
    })
    return withCors(fail(429, "发送次数过多，请稍后再试"), req)
  }

  // 6. 生成并持久化验证码
  let code: string
  try {
    code = await issueCode(phone)
  } catch (err) {
    logger.error(LOG_PREFIX.SMS, "Issue code failed", {
      phone,
      error: err instanceof Error ? err.message : String(err),
    })
    return withCors(fail(500, "验证码生成失败，请稍后再试"), req)
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
    return withCors(fail(502, "短信发送失败，请稍后再试"), req)
  }

  logger.info(LOG_PREFIX.SMS, "Code sent", { phone, ip })

  // 响应与用户是否存在无关，防止手机号枚举
  const responseBody: IResponse<null> = {
    code: 201,
    data: null,
    message: "验证码已发送",
  }
  return withCors(
    NextResponse.json(responseBody, { status: 201 }),
    req
  )
}
