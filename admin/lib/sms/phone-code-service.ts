import bcrypt from "bcryptjs"
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm"
import { db } from "@/lib/db"
import { smsVerificationCodes } from "@/db/schema"
import { generateCode } from "./phone"

function ttlMs(): number {
  const v = process.env.SMS_CODE_TTL_SECONDS
  const n = v ? Number(v) : 300
  return (Number.isFinite(n) && n > 0 ? n : 300) * 1000
}

function maxAttempts(): number {
  const v = process.env.SMS_CODE_MAX_ATTEMPTS
  const n = v ? Number(v) : 5
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5
}

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "max_attempts" | "mismatch" }

/**
 * 生成并持久化一条验证码记录，返回明文验证码（由调用方负责发送）。
 *
 * 流程：
 * 1. 生成 6 位数字验证码
 * 2. bcrypt.hash(code, 10)
 * 3. INSERT 记录：attempts=0, consumedAt=null, expiresAt=now+TTL
 */
export async function issueCode(phone: string): Promise<string> {
  const code = generateCode()
  const codeHash = await bcrypt.hash(code, 10)
  const now = new Date()
  await db.insert(smsVerificationCodes).values({
    phone,
    codeHash,
    attempts: 0,
    expiresAt: new Date(now.getTime() + ttlMs()),
    consumedAt: null,
    createdAt: now,
  })
  return code
}

/** 单手机号验证码发放上限(默认 10 条/小时),可用 SMS_ISSUE_HOURLY_PER_PHONE 覆盖 */
function issueHourlyCap(): number {
  const v = process.env.SMS_ISSUE_HOURLY_PER_PHONE
  const n = v ? Number(v) : 10
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10
}

/** 发放统计窗口:1 小时 */
const ISSUE_WINDOW_MS = 60 * 60 * 1000

/**
 * 该手机号在统计窗口内的发放量是否已达上限。
 *
 * 为什么需要它:`lib/sms/rate-limit.ts` 是进程内 Map,多实例部署时
 * 单实例计数无法反映全局发放量;而验证码发放记录本就落在数据库,
 * 直接用它做「按手机号」的全局兜底,防止单个号码被短信轰炸
 * (IP 维度的限流仍是实例本地的,见 getClientIp)。
 */
export async function isIssueCapped(phone: string): Promise<boolean> {
  const rows = await db
    .select({ issued: sql<number>`count(*)::int` })
    .from(smsVerificationCodes)
    .where(
      and(
        eq(smsVerificationCodes.phone, phone),
        gte(
          smsVerificationCodes.createdAt,
          new Date(Date.now() - ISSUE_WINDOW_MS)
        )
      )
    )
    .limit(1)

  const issued = Number(rows[0]?.issued ?? 0)
  return issued >= issueHourlyCap()
}

/**
 * 校验验证码。成功时标记记录为已消费；失败时根据原因递增 attempts 或返回错误码。
 *
 * 可能的返回：
 * - `not_found`：无可用记录（未发送或已消费）
 * - `expired`：记录已过期
 * - `max_attempts`：尝试次数已达上限（同时标记 consumedAt 阻断后续尝试）
 * - `mismatch`：验证码不匹配（attempts+1）
 * - `ok`：验证成功（consumedAt=now）
 */
export async function verifyCode(
  phone: string,
  code: string
): Promise<VerifyResult> {
  const rows = await db
    .select()
    .from(smsVerificationCodes)
    .where(
      and(
        eq(smsVerificationCodes.phone, phone),
        isNull(smsVerificationCodes.consumedAt)
      )
    )
    .orderBy(desc(smsVerificationCodes.createdAt))
    .limit(1)

  const row = rows[0]
  if (!row) return { ok: false, reason: "not_found" }

  const now = new Date()
  if (now > row.expiresAt) {
    return { ok: false, reason: "expired" }
  }

  if (row.attempts >= maxAttempts()) {
    // 标记为已消费，阻止后续尝试
    await db
      .update(smsVerificationCodes)
      .set({ consumedAt: now })
      .where(eq(smsVerificationCodes.id, row.id))
    return { ok: false, reason: "max_attempts" }
  }

  const match = await bcrypt.compare(code, row.codeHash)
  if (!match) {
    // 原子自增：避免并发验证时基于过期读的「丢失更新」。
    // 旧实现 `set({ attempts: row.attempts + 1 })` 在并发请求下都读到同一
    // 旧值并写回，导致 attempts 计数被覆盖，攻击者可借此绕过爆破上限。
    await db
      .update(smsVerificationCodes)
      .set({ attempts: sql`${smsVerificationCodes.attempts} + 1` })
      .where(eq(smsVerificationCodes.id, row.id))
    return { ok: false, reason: "mismatch" }
  }

  await db
    .update(smsVerificationCodes)
    .set({ consumedAt: now })
    .where(eq(smsVerificationCodes.id, row.id))
  return { ok: true }
}
