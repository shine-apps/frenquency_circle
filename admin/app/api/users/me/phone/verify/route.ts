import { and, eq, not } from "drizzle-orm"
import { z } from "zod"

import { db } from "@/lib/db"
import {
  users,
  accounts,
  DEFAULT_PRIVACY_SETTINGS,
} from "@/db/schema"
import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { requireSession } from "@/lib/auth-utils"
import { linkAccount } from "@/lib/auth/account-service"
import { logger, LOG_PREFIX } from "@/lib/logger"
import { fetchUserTags } from "@/lib/user-tags"
import { isValidPhone, normalizePhone } from "@/lib/sms/phone"
import { verifyCode } from "@/lib/sms/phone-code-service"
import type {
  UserDTO,
  UserProfileDTO,
  UserRole,
  PrivacySettings,
} from "@/types/api"

/** verifyCode 失败原因(与 phone-code-service 的 VerifyResult 对齐) */
type VerifyFailureReason =
  | "not_found"
  | "expired"
  | "max_attempts"
  | "mismatch"

/**
 * 手机号绑定/修改请求体 schema。
 * - phone: 11 位手机号(格式校验在 handler 中经 isValidPhone/normalizePhone 统一处理)
 * - code: 6 位短信验证码
 */
const verifyPhoneSchema = z.object({
  phone: z.string().min(1),
  code: z.string().length(6),
})

/**
 * 将 users 表行映射为 UserProfileDTO(不含 tags,需调用方拼接)。
 */
function toUserDTO(row: typeof users.$inferSelect): UserDTO {
  const privacySettings =
    (row.privacySettings as PrivacySettings | null) ?? DEFAULT_PRIVACY_SETTINGS
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    avatarUrl: row.avatarUrl ?? null,
    phone: row.phone ?? null,
    practiceYears: row.practiceYears ?? null,
    activityLevel: row.activityLevel as UserDTO["activityLevel"],
    privacySettings,
    location:
      row.latitude !== null && row.longitude !== null
        ? { latitude: row.latitude, longitude: row.longitude }
        : null,
    address: row.address ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * POST /api/users/me/phone/verify
 *
 * 绑定/更换当前用户的手机号,需先通过短信验证码校验。
 *
 * 流程:
 * 1. 鉴权(任意登录用户)
 * 2. 校验新手机号格式(normalizePhone + isValidPhone)
 * 3. 新手机号不能与当前绑定的手机号相同
 * 4. 唯一性校验:users.phone 字段 与 accounts 表中 providerAccountId = 新手机号
 *    均不得已被其他用户绑定
 * 5. verifyCode 校验短信验证码(成功即消费,防止重放)
 * 6. 更新 users.phone
 * 7. 同步 accounts 绑定:若当前用户已存在 providerAccountId=新手机号 的 account 则
 *    复用;否则将旧手机号对应的 account 更新为新手机号(仍无则 linkAccount 新建)
 * 8. 返回 `IResponse<UserProfileDTO>`(含 tags)
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  // 1. 鉴权
  const guard = await requireSession(req)
  if ("response" in guard) return guard.response
  const userId = guard.user.id

  // 2. 解析请求体
  const body = await req.json().catch(() => null)
  const parsed = verifyPhoneSchema.safeParse(body)
  if (!parsed.success) {
    logger.warn(LOG_PREFIX.SMS, "Phone verify: invalid body")
    return withCors(
      fail(400, "Invalid request body", parsed.error.flatten()),
      req
    )
  }

  const { code } = parsed.data

  // 3. 归一化并校验手机号格式
  const phone = normalizePhone(parsed.data.phone)
  if (!isValidPhone(phone)) {
    logger.warn(LOG_PREFIX.SMS, "Phone verify: invalid phone format", {
      phone: parsed.data.phone,
    })
    return withCors(fail(400, "手机号格式不正确"), req)
  }

  // 4. 查询当前用户
  const current = await db.query.users.findFirst({
    where: eq(users.id, userId),
  })
  if (!current) {
    return withCors(fail(404, "User not found"), req)
  }

  // 5. 新手机号不能与当前绑定的手机号相同
  if (current.phone === phone) {
    return withCors(fail(400, "新手机号与当前手机号相同"), req)
  }

  // 6. 唯一性校验:该手机号不得已被其他用户绑定
  //    双重检查 users.phone 字段与 accounts 绑定(两处都可能是手机号归属来源)
  const phoneOwner = await db.query.users.findFirst({
    where: and(
      eq(users.phone, phone),
      not(eq(users.id, userId))
    ),
  })
  if (phoneOwner) {
    logger.warn(LOG_PREFIX.SMS, "Phone verify: phone already in users.phone", {
      phone,
    })
    return withCors(fail(409, "该手机号已被其他用户绑定"), req)
  }
  const existing = await db.query.accounts.findFirst({
    where: and(
      eq(accounts.providerAccountId, phone),
      not(eq(accounts.userId, userId))
    ),
  })
  if (existing) {
    logger.warn(LOG_PREFIX.SMS, "Phone verify: phone already bound", { phone })
    return withCors(fail(409, "该手机号已被其他用户绑定"), req)
  }

  // 7. 校验短信验证码(成功即消费)
  const result = await verifyCode(phone, code)
  if (!result.ok) {
    const message: Record<VerifyFailureReason, string> = {
      not_found: "验证码不存在或已失效",
      expired: "验证码已过期",
      max_attempts: "验证码错误次数过多,请重新发送",
      mismatch: "验证码不正确",
    }
    logger.warn(LOG_PREFIX.SMS, "Phone verify: code check failed", {
      phone,
      reason: result.reason,
    })
    return withCors(fail(400, message[result.reason]), req)
  }

  // 8. 更新 users.phone
  const [updated] = await db
    .update(users)
    .set({ phone, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning()

  if (!updated) {
    return withCors(fail(404, "User not found"), req)
  }

  // 9. 同步 accounts 绑定
  //    - 已存在 providerAccountId=phone 的 account(其他 provider,如 wechat-miniprogram):复用,无需操作
  //    - 否则若当前用户有旧手机号 account:把旧手机号更新为新手机号
  //    - 仍无则 linkAccount 新建 phone 绑定(保证用户可用手机号登录)
  const phoneAccount = await db.query.accounts.findFirst({
    where: and(
      eq(accounts.userId, userId),
      eq(accounts.providerAccountId, phone)
    ),
  })
  if (!phoneAccount) {
    if (current.phone) {
      await db
        .update(accounts)
        .set({ providerAccountId: phone, updatedAt: new Date() })
        .where(
          and(
            eq(accounts.userId, userId),
            eq(accounts.providerAccountId, current.phone)
          )
        )
    }
    // 旧手机号 account 不存在(或更新为空的防御)时,直接新增绑定
    const stillMissing = await db.query.accounts.findFirst({
      where: and(
        eq(accounts.userId, userId),
        eq(accounts.providerAccountId, phone)
      ),
    })
    if (!stillMissing) {
      await linkAccount({
        userId,
        provider: "phone",
        providerAccountId: phone,
        type: "credentials",
      })
    }
  }

  logger.info(LOG_PREFIX.SMS, "Phone bound", { userId, phone })

  // 10. 组装 UserProfileDTO
  const userTagsList = await fetchUserTags(userId)
  const profile: UserProfileDTO = {
    ...toUserDTO(updated),
    tags: userTagsList,
  }

  return withCors(ok(profile), req)
}
