import { isValidPhone } from "@/lib/phone-format"

/**
 * 用户检索关键词校验规则（纯函数，无 Node 依赖）。
 *
 * 客户端（搜索框提交前预校验，避免非法关键词发起请求）
 * 与服务端（`lib/user-search.ts` 兜底校验）共用同一套规则，保证行为一致。
 */

/** 邮箱格式：`local@domain.tld` */
export const USER_SEARCH_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 是否为合法邮箱 */
export function isUserSearchEmail(value: string): boolean {
  return USER_SEARCH_EMAIL_RE.test(value.trim())
}

/** 是否为合法手机号（允许带 `+86` 等国际前缀与空格，规则见 `lib/phone-format.ts`） */
export function isUserSearchPhone(value: string): boolean {
  return isValidPhone(value)
}

/**
 * 关键词是否为合法的「完整邮箱或手机号」。
 *
 * @param value 用户输入
 * @returns 合法返回 true；空串或既不是邮箱也不是手机号返回 false
 */
export function isValidUserSearchKeyword(value: string): boolean {
  const v = (value ?? "").trim()
  if (!v) return false
  return isUserSearchEmail(v) || isUserSearchPhone(v)
}
