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
 * Link account: 若已存在则更新 updatedAt，否则 INSERT。
 * 幂等，可重复调用。
 */
export async function linkAccount(params: {
  userId: string
  provider: string
  providerAccountId: string
  type?: ProviderType
}) {
  const existing = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.provider, params.provider),
        eq(accounts.providerAccountId, params.providerAccountId)
      )
    )
    .limit(1)

  if (existing[0]) {
    await db
      .update(accounts)
      .set({ updatedAt: new Date() })
      .where(eq(accounts.id, existing[0].id))
    logger.info(LOG_PREFIX.ACCOUNT, "Account link refreshed", {
      userId: params.userId,
      provider: params.provider,
    })
    return
  }

  await db.insert(accounts).values({
    userId: params.userId,
    provider: params.provider,
    providerAccountId: params.providerAccountId,
    type: params.type ?? "credentials",
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
      .returning()
    user = created
    logger.info(LOG_PREFIX.AUTH, "User auto-created", {
      userId: user.id,
      provider: params.provider,
      email: params.email,
    })
  }

  await linkAccount({
    userId: user.id,
    provider: params.provider,
    providerAccountId: params.providerAccountId,
    type: params.type ?? "credentials",
  })

  return user
}
