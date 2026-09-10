import { randomInt } from "node:crypto"

import { PHONE_RE, isValidPhone, normalizePhone } from "@/lib/phone-format"

// 手机号格式规则统一由 `lib/phone-format.ts`（纯函数、客户端可用）提供，
// 此处原样再导出，保持既有引用路径不变。
export { PHONE_RE, isValidPhone, normalizePhone }

/**
 * 根据手机号生成默认邮箱：`${phone}@${PHONE_DOMAIN}`。
 * `PHONE_DOMAIN` 默认为 `phonedomain.com`。
 */
export function phoneToEmail(phone: string): string {
  const normalized = normalizePhone(phone)
  const domain = process.env.PHONE_DOMAIN ?? "phonedomain.com"
  return `${normalized}@${domain}`
}

/**
 * 生成 6 位数字验证码，范围 [100000, 999999]。
 * 使用 crypto.randomInt 避免 Math.random 的弱随机性。
 */
export function generateCode(): string {
  return String(randomInt(100000, 1000000))
}
