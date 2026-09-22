import { and, eq, sql, type SQL } from "drizzle-orm"

import { users } from "@/db/schema"
import { normalizePhone } from "@/lib/phone-format"
import { isUserSearchEmail, isUserSearchPhone } from "@/lib/user-search-keyword"
import type { UserRole } from "@/types/api"

/**
 * 用户检索条件解析工具（仅服务端使用）。
 *
 * 管理端用户检索要求「完整匹配」：关键词必须是一个合法的邮箱或手机号，
 * 否则视为非法输入（不查询数据库，也不做模糊检索，避免误命中大量用户）。
 * 角色过滤为额外的可选条件，与关键词之间是 AND 关系。
 */

/** 关键词命中类型：邮箱或手机号 */
export type UserSearchMatcher =
  | { kind: "email"; value: string }
  | { kind: "phone"; value: string }

/**
 * 解析用户检索关键词。
 *
 * 校验规则与客户端 `lib/user-search-keyword.ts` 完全一致：
 * 先邮箱（含 `@` 的输入不会是手机号）再手机号。
 *
 * @param raw 用户输入的关键词
 * @returns 合法时返回匹配器；既不是邮箱也不是手机号时返回 null
 */
export function parseUserSearchKeyword(raw: string): UserSearchMatcher | null {
  const value = (raw ?? "").trim()
  if (!value) return null

  if (isUserSearchEmail(value)) {
    return { kind: "email", value }
  }
  if (isUserSearchPhone(value)) {
    // 归一化后存储，与写入 users.phone 的格式保持一致
    return { kind: "phone", value: normalizePhone(value) }
  }
  return null
}

/**
 * 依据解析结果构造精确匹配条件。
 *
 * - 邮箱：忽略大小写的完整匹配（`lower(email) = lower(关键词)`）
 * - 手机号：归一化后精确匹配（与写入时的 `normalizePhone` 保持一致）
 *
 * @param matcher `parseUserSearchKeyword` 的结果
 * @returns 未命中（关键词为空）时返回 undefined
 */
export function buildUserSearchWhere(
  matcher: UserSearchMatcher | null
): SQL | undefined {
  if (matcher === null) return undefined
  if (matcher.kind === "email") {
    // 邮箱不区分大小写精确匹配（不用 ILIKE，避免 `%` / `_` 被当作通配符）
    return sql`lower(${users.email}) = ${matcher.value.toLowerCase()}`
  }
  return eq(users.phone, matcher.value)
}

/**
 * 组合用户列表查询条件：关键词精确匹配 AND 角色过滤。
 *
 * 两者均为可选，均未命中时返回 undefined（调用方查询全量）。
 *
 * @param options.keyword `parseUserSearchKeyword` 的结果
 * @param options.role    `parseUserRoleFilter` 的结果
 */
export function buildUserListWhere(options: {
  keyword: UserSearchMatcher | null
  role: UserRole | null
}): SQL | undefined {
  const conditions: SQL[] = []
  const keywordWhere = buildUserSearchWhere(options.keyword)
  if (keywordWhere) conditions.push(keywordWhere)
  if (options.role) conditions.push(eq(users.role, options.role))

  if (conditions.length === 0) return undefined
  return and(...conditions)
}
