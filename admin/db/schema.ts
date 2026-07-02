import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("USER"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type UserRole = "ADMIN" | "USER"

/**
 * 用户与登录方式的绑定关系。
 * 一个 userId 可关联多个 provider（如 credentials + phone + 未来 google）。
 * - provider: "credentials" | "phone" | "google" | ... 与 NextAuth provider id 对齐
 * - providerAccountId: 在该 provider 内的唯一标识（邮箱、手机号、OAuth sub）
 * - type: "credentials" | "oidc" | "oauth" | "email"（预留）
 */
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    type: text("type").notNull().default("credentials"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // 同一 provider 下 providerAccountId 唯一
    providerAccountIdx: uniqueIndex("accounts_provider_account_idx").on(
      table.provider,
      table.providerAccountId
    ),
    // 按 userId 反查
    userIdx: index("accounts_user_idx").on(table.userId),
  })
)

export type Account = typeof accounts.$inferSelect
export type NewAccount = typeof accounts.$inferInsert

/**
 * SMS 验证码表。
 * 仅存储验证码的 bcrypt 哈希（不存明文），过期时间 + 尝试次数用于防爆破。
 */
export const smsVerificationCodes = pgTable(
  "sms_verification_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    phoneIdx: index("sms_verification_codes_phone_idx").on(table.phone),
  })
)

export type SmsVerificationCode = typeof smsVerificationCodes.$inferSelect
export type NewSmsVerificationCode = typeof smsVerificationCodes.$inferInsert
