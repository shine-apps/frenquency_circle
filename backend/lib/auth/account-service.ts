import { randomUUID } from "node:crypto"
import bcrypt from "bcryptjs"
import { and, eq, exists, ne } from "drizzle-orm"
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

/** `findUserByAccountOrEmail` 的解析结果 */
export type ResolvedAccountUser = {
  user: typeof users.$inferSelect
  /**
   * 命中来源：
   * - `account`：accounts 绑定命中（稳定身份锚点）
   * - `email`：绑定行缺失，按 `users.email` 兜底命中（历史/seed 数据，或用户刚改过邮箱）
   */
  matchedBy: "account" | "email"
}

/**
 * 解析「provider 绑定优先、邮箱兜底」的已存在用户（只读，不创建）。
 *
 * 为什么需要它：`findOrCreateUserAndLinkAccount` 仅按 `users.email` 查找，
 * 而 email 是**可变字段**（`PATCH /api/auth/me` 可改）且手机号用户的 email 是派生的
 * （`{phone}@phonedomain.com`）。一旦用户改过邮箱，按 email 查就会落空并
 * **新建重复账号**，同时 link 命中唯一索引只更新 updatedAt，绑定关系仍指向旧账号。
 * 因此登录解析统一改为：先看 accounts 绑定关系，再回退 email。
 */
export async function findUserByAccountOrEmail(params: {
  provider: string
  providerAccountId: string
  email: string
}): Promise<ResolvedAccountUser | undefined> {
  const bound = await findUserByAccount(params.provider, params.providerAccountId)
  if (bound) return { user: bound, matchedBy: "account" }

  const byEmail = await db.query.users.findFirst({
    where: eq(users.email, params.email),
  })
  if (!byEmail) return undefined
  return { user: byEmail, matchedBy: "email" }
}

/**
 * 「provider 绑定优先、邮箱兜底」的 find-or-create + link。
 *
 * 与 `findOrCreateUserAndLinkAccount` 的区别见 `findUserByAccountOrEmail` 注释：
 * 本方法是登录入口（手机号 / 微信手机号）应使用的版本，命中已有账号时不再新建，
 * 并以幂等 upsert 补齐 provider 绑定（与旧行为一致）。
 */
export async function findOrCreateUserByProvider(params: {
  email: string
  name: string
  role?: string
  provider: string
  providerAccountId: string
  type?: ProviderType
}) {
  const resolved = await findUserByAccountOrEmail(params)
  if (resolved) {
    await linkAccount({
      userId: resolved.user.id,
      provider: params.provider,
      providerAccountId: params.providerAccountId,
      type: params.type,
    })
    return resolved.user
  }
  return findOrCreateUserAndLinkAccount(params)
}

/**
 * 判断用户在指定 provider 下是否存在登录绑定记录。
 * 例如：「是否已绑定微信」= hasBoundProvider(userId, "wechat-miniprogram")。
 */
export async function hasBoundProvider(
  userId: string,
  provider: string
): Promise<boolean> {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, provider)))
    .limit(1)
  return rows.length > 0
}

/**
 * 判断用户除指定 provider 外是否仍有其它登录方式。
 *
 * 用于解绑守卫：解绑微信（wechat-miniprogram）后账号必须仍能用手机号/邮箱等登录，
 * 否则用户会彻底失去登录能力。
 */
export async function hasOtherLoginMethod(
  userId: string,
  excludeProvider: string
): Promise<boolean> {
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(eq(accounts.userId, userId), ne(accounts.provider, excludeProvider))
    )
    .limit(1)
  return rows.length > 0
}

/**
 * 解绑：删除用户在指定 provider 下的绑定记录。
 *
 * 「仍存在其它登录方式」的守卫被写进同一条 DELETE 的 EXISTS 子查询，
 * 与删除在同一语句内原子完成，避免「先校验后删除」在并发下解掉唯一登录方式
 * （如两个解绑请求同时通过校验）。
 *
 * @returns 实际删除的行数；0 表示无其它登录方式（被守卫拦下）或本就无绑定
 */
export async function unlinkAccount(params: {
  userId: string
  provider: string
  providerAccountId?: string
}): Promise<number> {
  const { userId, provider, providerAccountId } = params

  // 同用户下存在任意一条其它 provider 的 account 即视为仍有其它登录方式
  const otherLoginMethod = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), ne(accounts.provider, provider)))

  const deleted = await db
    .delete(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.provider, provider),
        providerAccountId
          ? eq(accounts.providerAccountId, providerAccountId)
          : undefined,
        exists(otherLoginMethod)
      )
    )
    .returning({ id: accounts.id })

  if (deleted.length > 0) {
    logger.info(LOG_PREFIX.ACCOUNT, "Account unlinked", {
      userId,
      provider,
      removed: deleted.length,
    })
  }

  return deleted.length
}
