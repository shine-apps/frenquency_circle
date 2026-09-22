/**
 * 中国大陆手机号格式规则（纯函数，无 Node 依赖）。
 *
 * 作为手机号格式的唯一来源：
 * - 服务端短信/账号逻辑经 `lib/sms/phone.ts` 复用；
 * - 客户端表单预校验（如用户搜索）直接引用，避免规则在多处复制后产生偏差。
 */

/** 中国大陆手机号格式：`1[3-9]` 后跟 9 位数字，共 11 位。 */
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
