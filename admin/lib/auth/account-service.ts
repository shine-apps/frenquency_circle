import { randomUUID } from "node:crypto"
import bcrypt from "bcryptjs"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { accounts, users } from "@/db/schema"
import { logger, LOG_PREFIX } from "@/lib/logger"

export type ProviderType = "credentials" | "oidc" | "oauth" | "email"

/**
 * 在 accounts 表中查找用户（通过 provider + providerAccountId）。
 * 找到则返回 user 行；未找到则返回 undefined（与 drizzle findFirst 约定一致）。
 */
export async function findUserByAccount(
  provider: string,
  providerAccountId: string
) {
  const rows = await db
    .select({ user: users })
    .from(accounts)
    .innerJoin(users, eq(accounts.userId, users.id))
    .where(
      and(
        eq(accounts.provider, provider),
        eq(accounts.providerAccountId, providerAccountId)
      )
    )
    .limit(1)
  return rows[0]?.user
}

/**
 * Link account: 原子 upsert（INSERT ... ON CONFLICT DO UPDATE）。
 *
 * 使用单条 upsert 取代「先 SELECT 再 INSERT/UPDATE」，避免并发登录
 * （同一 provider+providerAccountId 双开请求）下的 TOCTOU 竞态：
 * 旧实现中两个请求都可能读到「不存在」分支并同时 INSERT，命中唯一索引
 * 时其中一个会抛错并冒泡为 500。upsert 在数据库层原子完成，幂等可重复调用。
 */
export async function linkAccount(params: {
  userId: string
  provider: string
  providerAccountId: string
  type?: ProviderType
}) {
  await db
    .insert(accounts)
    .values({
      userId: params.userId,
      provider: params.provider,
      providerAccountId: params.providerAccountId,
      type: params.type ?? "credentials",
    })
    .onConflictDoUpdate({
      target: [accounts.provider, accounts.providerAccountId],
      set: { updatedAt: new Date() },
    })
  logger.info(LOG_PREFIX.ACCOUNT, "Account linked", {
    userId: params.userId,
    provider: params.provider,
  })
}

/**
 * Find-or-create 用户，并 link account。
 * 用于 credentials 类 provider（邮箱/手机）首次登录自动建用户。
 *
 * - existingUserByEmail: 通过 email 查 users 表；找到则直接 link account 到该用户
 * - 未找到: INSERT users（自动生成 name/role/passwordHash），再 link account
 *
 * 返回 user 行（含 id/email/name/role）。
 */
export async function findOrCreateUserAndLinkAccount(params: {
  email: string
  name: string
  role?: string
  /** 用于 credentials 类用户：一个不可用的密码哈希，防止邮箱密码登录 */
  unusablePasswordHash?: string
  provider: string
  providerAccountId: string
  type?: ProviderType
}) {
  const existing = await db.query.users.findFirst({
    where: eq(users.email, params.email),
  })

  let user = existing
  if (!user) {
    // ON CONFLICT DO NOTHING：并发首次登录（同一 email）时，只有一个请求能 INSERT
    // 成功并拿到 returning 行；另一个拿到空 returning 后回退到重新查询。
    const [created] = await db
      .insert(users)
      .values({
        email: params.email,
        name: params.name,
        role: params.role ?? "USER",
        passwordHash:
          params.unusablePasswordHash ??
          (await bcrypt.hash(randomUUID() + randomUUID(), 10)),
      })
      .onConflictDoNothing({ target: users.email })
      .returning()

    if (created) {
      user = created
      logger.info(LOG_PREFIX.AUTH, "User auto-created", {
        userId: user.id,
        provider: params.provider,
        email: params.email,
      })
    } else {
      // 并发冲突：另一请求已插入，重新读取已存在的用户
      user = await db.query.users.findFirst({
        where: eq(users.email, params.email),
      })
    }
  }

  if (!user) {
    // 理论不可达（onConflictDoNothing 后必能查到）；防御性抛错避免后续空指针
    throw new Error("findOrCreateUserAndLinkAccount: failed to resolve user")
  }

  await linkAccount({
    userId: user.id,
    provider: params.provider,
    providerAccountId: params.providerAccountId,
    type: params.type ?? "credentials",
  })

  return user
}
