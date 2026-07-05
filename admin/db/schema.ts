import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

/**
 * PostGIS 扩展声明(已废弃,保留导出避免破坏潜在引用)。
 *
 * 历史上本项目计划用 PostGIS 的 ST_DWithin / ST_Distance 做地理匹配,
 * 但 Phase 1 决定改用 lat/lng 双列 + Haversine 公式(TS + SQL 双实现,
 * 见 lib/match/distance.ts),不再依赖 PostGIS。
 *
 * 为兼容已部署环境与未来切换回 PostGIS 的可能,此导出保留,
 * 但迁移 SQL 不再 CREATE EXTENSION postgis。
 */
export const enablePostgis = sql`CREATE EXTENSION IF NOT EXISTS postgis`

/**
 * 用户角色字面量联合:
 * - `ADMIN` 平台管理员(可访问 /admin 后台)
 * - `USER`  普通爱好者
 * - `TEACHER` 传承人/老师(可创建圈子)
 */
export const USER_ROLES = ["ADMIN", "USER", "TEACHER"] as const
export type UserRole = (typeof USER_ROLES)[number]

/**
 * 用户活跃度等级。
 */
export const ACTIVITY_LEVELS = ["low", "medium", "high"] as const
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number]

/**
 * 隐私设置结构(存储在 users.privacySettings JSONB 字段)。
 * - allowMatch: 是否允许出现在他人的"同频的人"匹配结果
 * - publicContact: 是否对外公开联系方式
 * - locationPrecision: 位置精度脱敏等级
 *   - `exact` 精确距离
 *   - `community` 四舍五入到 0.5km
 *   - `region` 四舍五入到 5km
 */
export const LOCATION_PRECISIONS = ["exact", "community", "region"] as const
export type LocationPrecision = (typeof LOCATION_PRECISIONS)[number]

export type PrivacySettings = {
  allowMatch: boolean
  publicContact: boolean
  locationPrecision: LocationPrecision
}

/**
 * 默认隐私设置:允许匹配、公开联系方式、精确距离。
 */
export const DEFAULT_PRIVACY_SETTINGS: PrivacySettings = {
  allowMatch: true,
  publicContact: true,
  locationPrecision: "exact",
}

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("USER"),
  /** 用户头像 URL(可空,前端 chooseMedia 上传到本地后由 PATCH /api/auth/me 写入) */
  avatarUrl: text("avatar_url"),
  /** 用户手机号(可空,phone/wechat-miniprogram provider 登录后写入) */
  phone: text("phone"),
  /** 微信 openid(暂不持久化,预留字段以便后续扩展) */
  wechatOpenid: text("wechat_openid"),
  /** 用户纬度(double precision,与 longitude 配合表达用户位置;可空) */
  latitude: doublePrecision("latitude"),
  /** 用户经度(double precision,与 latitude 配合表达用户位置;可空) */
  longitude: doublePrecision("longitude"),
  /** 逆地理编码后的地址文本(可空) */
  address: text("address"),
  /** 隐私设置(JSONB,默认允许匹配 + 公开联系方式 + 精确距离) */
  privacySettings: jsonb("privacy_settings")
    .notNull()
    .default(DEFAULT_PRIVACY_SETTINGS),
  /** 练习年限(可空,TEACHER 角色常用) */
  practiceYears: integer("practice_years"),
  /** 活跃度等级:`low` | `medium` | `high`,默认 `medium` */
  activityLevel: text("activity_level").notNull().default("medium"),
  /** 最后活跃时间(可空,用于活跃度排序) */
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

/**
 * 用户与登录方式的绑定关系。
 * 一个 userId 可关联多个 provider(如 credentials + phone + 未来 google)。
 * - provider: "credentials" | "phone" | "google" | ... 与 NextAuth provider id 对齐
 * - providerAccountId: 在该 provider 内的唯一标识(邮箱、手机号、OAuth sub)
 * - type: "credentials" | "oidc" | "oauth" | "email"(预留)
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
 * 仅存储验证码的 bcrypt 哈希(不存明文),过期时间 + 尝试次数用于防爆破。
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

/**
 * 标签状态字面量联合:
 * - `pending` 用户自定义待审核
 * - `approved` 已通过(可被搜索与匹配)
 * - `rejected` 已拒绝(不可用)
 */
export const TAG_STATUSES = ["pending", "approved", "rejected"] as const
export type TagStatus = (typeof TAG_STATUSES)[number]

/**
 * 兴趣标签库。
 * 三级分类:category(一级大类)→ subCategory(二级分类)→ name(三级具体项目)。
 * 支持中文 / 拼音全拼 / 拼音首字母多维度检索。
 */
export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    subCategory: text("sub_category"),
    pinyin: text("pinyin"),
    pinyinInitials: text("pinyin_initials"),
    status: text("status").notNull().default("pending"),
    /** 创建者(可空,系统种子标签为 null;用户自定义标签写入 userId) */
    createdBy: uuid("created_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // 标签名 B-tree 索引(ILIKE 前缀查询走 B-tree)
    nameIdx: index("tags_name_idx").on(table.name),
    pinyinIdx: index("tags_pinyin_idx").on(table.pinyin),
    pinyinInitialsIdx: index("tags_pinyin_initials_idx").on(table.pinyinInitials),
    // 大类 + 二级分类组合索引(分类树查询)
    categorySubIdx: index("tags_category_sub_idx").on(
      table.category,
      table.subCategory
    ),
    statusIdx: index("tags_status_idx").on(table.status),
  })
)

export type Tag = typeof tags.$inferSelect
export type NewTag = typeof tags.$inferInsert

/**
 * 用户与兴趣标签的关联表(多对多)。
 * - level: 标签精度等级预留字段(MVP 暂不使用,默认 0)
 */
export const userTags = pgTable(
  "user_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    level: integer("level").default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    // 同一用户不可重复绑定同一标签
    userTagUniq: uniqueIndex("user_tags_user_tag_idx").on(
      table.userId,
      table.tagId
    ),
  })
)

export type UserTag = typeof userTags.$inferSelect
export type NewUserTag = typeof userTags.$inferInsert

/**
 * 圈子状态字面量联合:
 * - `active` 活跃(可被匹配)
 * - `offline` 创建者手动下线
 * - `deleted` 软删除(不再出现在匹配结果)
 * - `violated` 管理员下线(违规)
 */
export const CIRCLE_STATUSES = ["active", "offline", "deleted", "violated"] as const
export type CircleStatus = (typeof CIRCLE_STATUSES)[number]

/**
 * 圈子成员角色字面量联合:
 * - `member` 普通成员
 * - `creator` 创建者(自动插入)
 */
export const CIRCLE_MEMBER_ROLES = ["member", "creator"] as const
export type CircleMemberRole = (typeof CIRCLE_MEMBER_ROLES)[number]

/**
 * 兴趣圈子(由 TEACHER 创建)。
 * 位置使用 latitude/longitude 双列(MVP 简化方案,后续可迁移到 PostGIS Point)。
 */
export const circles = pgTable(
  "circles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    address: text("address").notNull(),
    contactPhone: text("contact_phone"),
    wechat: text("wechat"),
    /** 活动时间自由文本描述,如"每周六早 7:00-8:30" */
    activityTime: text("activity_time"),
    /** 人数上限(可空,不填则不限) */
    maxMembers: integer("max_members"),
    memberCount: integer("member_count").notNull().default(0),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    creatorIdx: index("circles_creator_idx").on(table.creatorId),
    statusIdx: index("circles_status_idx").on(table.status),
    // 经纬度组合 B-tree 索引(MVP 简化;真实 GIST 索引留待 PostGIS 完整集成)
    locationIdx: index("circles_location_idx").on(
      table.latitude,
      table.longitude
    ),
  })
)

export type Circle = typeof circles.$inferSelect
export type NewCircle = typeof circles.$inferInsert

/**
 * 圈子与兴趣标签的关联表(多对多)。
 */
export const circleTags = pgTable(
  "circle_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    circleTagUniq: uniqueIndex("circle_tags_circle_tag_idx").on(
      table.circleId,
      table.tagId
    ),
  })
)

export type CircleTag = typeof circleTags.$inferSelect
export type NewCircleTag = typeof circleTags.$inferInsert

/**
 * 圈子成员表。
 * 创建圈子时自动插入一条 `role='creator'` 记录。
 */
export const circleMembers = pgTable(
  "circle_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    circleMemberUniq: uniqueIndex("circle_members_circle_user_idx").on(
      table.circleId,
      table.userId
    ),
  })
)

export type CircleMember = typeof circleMembers.$inferSelect
export type NewCircleMember = typeof circleMembers.$inferInsert

/**
 * 用户定位发布记录。
 * 每次发布定位时写入一条记录,同时更新 users.latitude/longitude 为最新位置。
 * tagIds 为发布时已选标签的快照(uuid 数组)。
 */
export const locations = pgTable(
  "locations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    address: text("address").notNull(),
    /** 发布时已选标签 ID 快照 */
    tagIds: uuid("tag_ids").array(),
    /** 发布时选择的匹配范围(km) */
    rangeKm: integer("range_km").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    userIdx: index("locations_user_idx").on(table.userId),
    locationIdx: index("locations_location_idx").on(
      table.latitude,
      table.longitude
    ),
  })
)

export type Location = typeof locations.$inferSelect
export type NewLocation = typeof locations.$inferInsert

/**
 * 联系方式联系类型字面量联合:
 * - `phone` 电话联系
 * - `wechat` 微信联系
 */
export const CONTACT_TYPES = ["phone", "wechat"] as const
export type ContactType = (typeof CONTACT_TYPES)[number]

/**
 * 圈子联系记录表。
 * 用户在圈子详情页点击"联系老师"时插入一条记录,用于统计与防滥用。
 */
export const contactLogs = pgTable(
  "contact_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contactType: text("contact_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => ({
    circleIdx: index("contact_logs_circle_idx").on(table.circleId),
    userIdx: index("contact_logs_user_idx").on(table.userId),
  })
)

export type ContactLog = typeof contactLogs.$inferSelect
export type NewContactLog = typeof contactLogs.$inferInsert
