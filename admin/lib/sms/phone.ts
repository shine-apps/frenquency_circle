import { randomInt } from "node:crypto"

/**
 * 中国大陆手机号格式：1[3-9] 后跟 9 位数字，共 11 位。
 */
export const PHONE_RE = /^1[3-9]\d{9}$/

/**
 * 归一化手机号：去除空格、`+86`、`0086` 前缀，仅保留数字。
 */
export function normalizePhone(input: string): string {
  let s = (input ?? "").trim()
  // 去除所有空白字符（包括前后及中间的空格、制表符等）
  s = s.replace(/\s+/g, "")
  // 去除国际前缀
  if (s.startsWith("+86")) s = s.slice(3)
  else if (s.startsWith("0086")) s = s.slice(4)
  else if (s.startsWith("86") && s.length === 13) s = s.slice(2)
  return s
}

/**
 * 校验是否为有效的中国大陆手机号。
 */
export function isValidPhone(input: string): boolean {
  return PHONE_RE.test(normalizePhone(input))
}

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
