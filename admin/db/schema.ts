import {
  pgTable,
  text,
  uuid,
  timestamp,
  integer,
  date,
  doublePrecision,
  jsonb,
  index,
  uniqueIndex,
  check,
  type AnyPgColumn,
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
 * - allowMatch: 是否允许出现在他人的"同趣的人"匹配结果
 * - publicContact: 是否对外公开联系方式(预留字段;当前版本联系方式解锁
 *   仅与打招呼接受状态相关,该开关不影响解锁)
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
  /**
   * 用户微信号(可空,最长 50 字符,空串归一为 null)。
   * 人-人联系链路中唯一可对外展示的联系方式:
   * - 对方 `privacySettings.publicContact` 为 true 时对所有登录用户可见;
   * - 或双方存在 accepted 的 contact_requests 时互相可见。
   * 手机号(phone)是登录实名凭证,任何情况下都不写入对外响应。
   */
  wechat: text("wechat"),
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
  /** 兴趣标签名称数组(存 hobby_tags.name,如 ['太极拳','书法']),默认空数组 */
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  // 数组包含查询 "标签 X ∈ users.tags" 走 GIN 索引
  index("users_tags_gin_idx").using("gin", table.tags),
  // 匹配引擎包围盒粗筛:经纬度组合 B-tree 索引(与 circles_location_idx 惯例一致;
  // 真实 GiST 索引留待 PostGIS 完整集成)
  index("users_location_idx").on(table.latitude, table.longitude),
])

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
  (table) => [
    // 同一 provider 下 providerAccountId 唯一
    uniqueIndex("accounts_provider_account_idx").on(
      table.provider,
      table.providerAccountId
    ),
    // 按 userId 反查
    index("accounts_user_idx").on(table.userId),
  ]
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
  (table) => [
    index("sms_verification_codes_phone_idx").on(table.phone),
  ]
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
 * 兴趣分类树(最多两级:一级大类 或 二级中类;叶子分类可是一级也可二级)。
 * 用 `parentId` 自引用支持两级树,`level` 标注层级深度,`slug` 为稳定排序/URL 键。
 *
 * 设计要点:
 * - 一级大类:level=1,parentId=null(如"传统与民族文化""视觉与造型艺术");
 *   一级大类也可作为「叶子分类」直接承载标签(无子节点的 level-1)。
 * - 二级中类:level=2,parentId 指向一级大类(如"运动健身""民族器乐")
 * - UNIQUE(parent_id, name):同一父节点下名称不重复,杜绝分类名拼写漂移
 * - CHECK:level ∈ {1,2} 且 level 与 parentId 一致(level=1 必无父,level=2 必有父)
 * - 分类结构由数据库外键保证一致,运营可在后台动态增删
 */
export const categories = pgTable(
  "categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 分类名称(一级大类名或二级中类名) */
    name: text("name").notNull(),
    /** 稳定键(用于排序 / URL / 前端分组),全局唯一 */
    slug: text("slug").notNull().unique(),
    /** 层级:1=一级大类,2=二级中类 */
    level: integer("level").notNull(),
    /** 父级分类 id;一级大类为 null,二级中类指向其所属一级大类 */
    parentId: uuid("parent_id").references((): AnyPgColumn => categories.id, {
      onDelete: "cascade",
    }),
    /** 后台拖拽排序权重,默认 0 */
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // 同父下名称唯一,防止分类节点分裂出幽灵节点
    uniqueIndex("categories_parent_name_idx").on(table.parentId, table.name),
    // 按父 + 排序查询分类树
    index("categories_parent_sort_idx").on(table.parentId, table.sortOrder),
    // 约束:categories 最多两级(level∈{1,2})
    check("categories_level_check", sql`"level" in (1, 2)`),
    // 约束:level 与 parentId 一致(level=1 必无父,level=2 必有父)
    check(
      "categories_level_parent_check",
      sql`("level" = 1 and "parent_id" is null) or ("level" = 2 and "parent_id" is not null)`
    ),
  ]
)

export type Category = typeof categories.$inferSelect
export type NewCategory = typeof categories.$inferInsert

/**
 * 兴趣标签库(叶子节点)。
 * 分类归属通过 `categoryId` 外键指向 `categories`(二级中类节点),
 * 不再把两级分类名塞进同一条记录,层级一致性由数据库保证。
 * 支持中文 / 拼音全拼 / 拼音首字母多维度检索。
 *
 * 说明:用户(users.tags)与圈子(circles.tags)仍按 `name` 引用标签,
 * 因 `tags.name` 全局唯一,无需额外桥接表。
 */
export const hobbyTags = pgTable(
  "hobby_tags",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 具体标签名称(如"太极拳""书法"),全局唯一 */
    name: text("name").notNull().unique(),
    /** 所属分类(指向 categories.id,可为 level=1 的叶子分类或 level=2 的中类) */
    categoryId: uuid("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
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
  (table) => [
    // 标签名 B-tree 索引(ILIKE 前缀查询走 B-tree)
    index("hobby_tags_name_idx").on(table.name),
    index("hobby_tags_pinyin_idx").on(table.pinyin),
    index("hobby_tags_pinyin_initials_idx").on(table.pinyinInitials),
    // 按分类 + 名称查询(分类树末层)
    index("hobby_tags_category_name_idx").on(table.categoryId, table.name),
    index("hobby_tags_status_idx").on(table.status),
  ]
)

export type HobbyTag = typeof hobbyTags.$inferSelect
export type NewHobbyTag = typeof hobbyTags.$inferInsert

/**
 * 圈子状态字面量联合:
 * - `pending` 待审核(新建后默认,管理员审核通过前不可见)
 * - `active` 活跃(可被匹配)
 * - `offline` 创建者手动下线
 * - `deleted` 软删除(不再出现在匹配结果)
 * - `violated` 管理员下线(违规)
 * - `rejected` 审核未通过
 */
export const CIRCLE_STATUSES = ["active", "offline", "deleted", "violated", "pending", "rejected"] as const
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
    /**
     * 轮播图片 URL 数组(0-9 个,可空数组)。
     * - 默认空数组(避免 NULL 语义混乱)
     */
    coverImages: text("cover_images")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** 兴趣标签名称数组(存 hobby_tags.name,如 ['太极拳','书法']),默认空数组 */
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("circles_creator_idx").on(table.creatorId),
    index("circles_status_idx").on(table.status),
    // 经纬度组合 B-tree 索引(MVP 简化;真实 GIST 索引留待 PostGIS 完整集成)
    index("circles_location_idx").on(
      table.latitude,
      table.longitude
    ),
    // 数组包含查询 "标签 X ∈ circles.tags" 走 GIN 索引
    index("circles_tags_gin_idx").using("gin", table.tags),
  ]
)

export type Circle = typeof circles.$inferSelect
export type NewCircle = typeof circles.$inferInsert

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
  (table) => [
    uniqueIndex("circle_members_circle_user_idx").on(
      table.circleId,
      table.userId
    ),
  ]
)

export type CircleMember = typeof circleMembers.$inferSelect
export type NewCircleMember = typeof circleMembers.$inferInsert

/**
 * 圈子关注表。
 * 用户关注感兴趣的圈子,关注后可在"我关注的圈子"列表快速回看。
 * 一个用户对同一圈子最多一条关注记录(UNIQUE(circle_id, user_id))。
 */
export const circleFollows = pgTable(
  "circle_follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    circleId: uuid("circle_id")
      .notNull()
      .references(() => circles.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // 同一用户关注同一圈子只有一条
    uniqueIndex("circle_follows_circle_user_idx").on(
      table.circleId,
      table.userId
    ),
    // 按用户反查关注列表
    index("circle_follows_user_idx").on(table.userId),
  ]
)

export type CircleFollow = typeof circleFollows.$inferSelect
export type NewCircleFollow = typeof circleFollows.$inferInsert

/**
 * 用户关注表。
 * 用户单向关注同趣的人(人-人关系沉淀),关注后可在"我关注的人"列表快速回看。
 * 一个用户对同一目标最多一条关注记录(UNIQUE(user_id, target_user_id))。
 * 与 circle_follows 相互独立:关注圈子不等同于关注人,不共用表。
 */
export const userFollows = pgTable(
  "user_follows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 关注者 */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 被关注者 */
    targetUserId: uuid("target_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // 同一用户关注同一目标只有一条(幂等关注依赖此索引)
    uniqueIndex("user_follows_user_target_idx").on(
      table.userId,
      table.targetUserId
    ),
    // 按用户反查关注列表
    index("user_follows_user_idx").on(table.userId),
    // 按被关注者反查粉丝列表(供未来"关注我的人"与通知聚合)
    index("user_follows_target_idx").on(table.targetUserId),
  ]
)

export type UserFollow = typeof userFollows.$inferSelect
export type NewUserFollow = typeof userFollows.$inferInsert

/**
 * 联系请求状态字面量联合:
 * - `pending`  待对方处理
 * - `accepted` 已接受(双方互相解锁微信号)
 * - `rejected` 已拒绝(可冷却后再次发起)
 */
export const CONTACT_REQUEST_STATUSES = [
  "pending",
  "accepted",
  "rejected",
] as const
export type ContactRequestStatus = (typeof CONTACT_REQUEST_STATUSES)[number]

/**
 * 人-人联系请求表(打招呼)。
 *
 * 用户在他人主页发起"打招呼",对方接受后双方互相解锁微信号。
 * 设计要点:
 * - `message` 仅一次性自我介绍(≤100 字符),不承担聊天职责(本项目无 IM);
 * - `status` 为 pending 时受部分唯一索引保护:同一对(from→to)最多一条待处理,
 *   被拒绝/撤回后可再次发起,从数据库层面杜绝重复骚扰;
 * - accepted 的请求本身即"已建立联系"的凭证,联系方式可见性读时计算,不冗余快照。
 */
export const contactRequests = pgTable(
  "contact_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 发起方 */
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 接收方(只有其本人可 accept / reject) */
    toUserId: uuid("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 打招呼留言(可空,≤100 字符) */
    message: text("message"),
    /** 无序用户对键(LEAST 生成列):配合下方 pending 部分唯一索引,
     *  防止 A→B 与 B→A 并发各产生一条 pending(有序索引挡不住反向) */
    pairKey: uuid("pair_key").generatedAlwaysAs(
      sql`least("from_user_id", "to_user_id")`
    ),
    status: text("status")
      .$type<ContactRequestStatus>()
      .notNull()
      .default("pending"),
    /** 对方处理时间(accept / reject 时写入) */
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // 防骚扰:同一"无序用户对"最多一条 pending
    // (基于 least(from,to) 生成列,防止反向并发双 pending)
    uniqueIndex("contact_requests_pending_pair_idx")
      .on(table.pairKey)
      .where(sql`"status" = 'pending'`),
    // 读路径:"我收到的"按 (to_user_id, status) 过滤
    index("contact_requests_to_status_idx").on(table.toUserId, table.status),
    // 读路径:"我发出的"按 (from_user_id, status) 过滤
    index("contact_requests_from_status_idx").on(table.fromUserId, table.status),
    // 每日配额:按发起方 + 创建时间范围扫描
    index("contact_requests_from_created_idx").on(table.fromUserId, table.createdAt),
  ]
)

export type ContactRequest = typeof contactRequests.$inferSelect
export type NewContactRequest = typeof contactRequests.$inferInsert

/**
 * 教师认证申请状态字面量联合:
 * - `pending` 待审核
 * - `approved` 已通过(用户已升级为 TEACHER)
 * - `rejected` 已驳回
 */
export const TEACHER_APPLICATION_STATUSES = ["pending", "approved", "rejected"] as const
export type TeacherApplicationStatus = (typeof TEACHER_APPLICATION_STATUSES)[number]

/**
 * 教师认证申请表。
 * USER 角色创建圈子时同步创建一条申请,附带认证材料文件 URL 列表。
 * 管理员审核圈子时一并处理:通过则升级用户为 TEACHER。
 */
export const teacherApplications = pgTable(
  "teacher_applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 触发此次申请的圈子 ID(独立认证时可为 null) */
    circleId: uuid("circle_id").references(() => circles.id, {
      onDelete: "cascade",
    }),
    /** 认证材料文件列表(JSONB 数组,每项含 url/key/size/mimeType/originalName) */
    files: jsonb("files").notNull(),
    /** 身份证人像面(单张图片,必填) */
    idCardFront: jsonb("id_card_front"),
    /** 身份证国徽面(单张图片,必填) */
    idCardBack: jsonb("id_card_back"),
    status: text("status").notNull().default("pending"),
    /** 审核人(可空) */
    reviewerId: uuid("reviewer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** 审核备注(驳回原因等) */
    reviewNote: text("review_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("teacher_applications_user_idx").on(table.userId),
    index("teacher_applications_circle_idx").on(table.circleId),
    index("teacher_applications_status_idx").on(table.status),
  ]
)

export type TeacherApplication = typeof teacherApplications.$inferSelect
export type NewTeacherApplication = typeof teacherApplications.$inferInsert

/**
 * 联系方式联系类型字面量联合:
 * - `phone` 电话联系(圈子场景的老师电话,或人-人场景微信号缺失时的兜底手机号)
 * - `wechat` 微信联系
 *
 * 人-人联系链路原本只写 `wechat`;微信号缺失且有权查看时,
 * 也会兜底写 `phone`(手机号作为联系不到微信时的备用通道)。
 */
export const CONTACT_TYPES = ["phone", "wechat"] as const
export type ContactType = (typeof CONTACT_TYPES)[number]

/**
 * 联系记录表(圈子联系 + 人-人联系共用)。
 *
 * - 圈子场景:用户在圈子详情页点击"联系老师"时插入,`circleId` 非空、`targetUserId` 为空;
 * - 人-人场景:用户查看/解锁他人微信号时插入,`targetUserId` 非空、`circleId` 为空。
 *
 * 两类记录共用一张表,避免统计口径分裂;CHECK 约束保证二者至少其一非空。
 * 用途:被联系次数统计与异常滥用追溯。
 */
export const contactLogs = pgTable(
  "contact_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** 圈子 id(人-人联系时为空) */
    circleId: uuid("circle_id").references(() => circles.id, {
      onDelete: "cascade",
    }),
    /** 被联系人 id(圈子联系时为空,此时以 circleId 归属的创建者为准) */
    targetUserId: uuid("target_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    /** 发起联系的用户 */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    contactType: text("contact_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("contact_logs_circle_idx").on(table.circleId),
    index("contact_logs_user_idx").on(table.userId),
    index("contact_logs_target_idx").on(table.targetUserId),
    // 约束:圈子联系与人-人联系二选一,不允许两条都为空
    check(
      "contact_logs_target_check",
      sql`"circle_id" is not null or "target_user_id" is not null`
    ),
  ]
)

export type ContactLog = typeof contactLogs.$inferSelect
export type NewContactLog = typeof contactLogs.$inferInsert

/**
 * 通知类型字面量联合。
 * - `circle_review`        圈子待审核(→管理员)
 * - `circle_review_result` 圈子审核结果(→创建者)
 * - `circle_followed`      有人关注圈子(→创建者)
 * - `contact_request`      收到打招呼请求(→接收方)
 * - `contact_accepted`     打招呼被接受(→发起方)
 * - `user_followed`        有人关注了你(→被关注者)
 * 预留:teacher_application / teacher_application_result 等。
 */
export const NOTIFICATION_TYPES = [
  "circle_review",
  "circle_review_result",
  "circle_followed",
  "contact_request",
  "contact_accepted",
  "user_followed",
] as const
export type NotificationType = (typeof NOTIFICATION_TYPES)[number]

/**
 * 通知跳转目标字面量联合。决定前端入口:
 * - `miniprogram` 用户侧小程序页面
 * - `admin`       管理员后台页面
 */
export const NOTIFICATION_LINK_TARGETS = ["miniprogram", "admin"] as const
export type NotificationLinkTarget =
  (typeof NOTIFICATION_LINK_TARGETS)[number]

/**
 * 通知关联业务对象类型字面量联合:
 * - `circle` 圈子相关(审核、被关注)
 * - `user`   用户相关(打招呼请求、被关注)
 * 与项目既有惯例一致:用 `text` 列 + TS 联合类型,不用 pgEnum。
 */
export const NOTIFICATION_ENTITY_TYPES = ["circle", "user"] as const
export type NotificationEntityType =
  (typeof NOTIFICATION_ENTITY_TYPES)[number]

/**
 * 消息 / 通知表。
 *
 * 系统通知用户的消息,含标题、正文与引导打开的页面链接(linkUrl)。
 * 写入即扇出(见 lib/notifications.ts),与业务同请求顺序执行,不引入消息队列。
 *
 * 字段语义:
 * - `actorId`  触发者(可空)。关注者 / 审核管理员 / 建圈者;系统通知为 null。`onDelete: 'set null'`。
 * - `entityType`/`entityId` 关联业务对象(本期 `'circle'`),为未来聚合 / 撤回 / 失效预留,本期仅写入不消费。
 * - `title`/`content` 中的人名与圈子名在创建时快照进字符串;改名不影响历史通知。
 * - `linkTarget` 必须双向过滤:用户侧只渲染 `miniprogram`,后台铃铛只渲染 `admin`。
 */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** 触发者(可空):谁触发了这条通知。系统通知为 null。 */
    actorId: uuid("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** 关联业务对象类型(可空):本期仅 'circle'。 */
    entityType: text("entity_type").$type<NotificationEntityType>(),
    /** 关联业务对象 id(可空),如 circleId。 */
    entityId: uuid("entity_id"),
    type: text("type").$type<NotificationType>().notNull(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    linkUrl: text("link_url"),
    linkTarget: text("link_target")
      .$type<NotificationLinkTarget>()
      .notNull()
      .default("miniprogram"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("notifications_recipient_read_idx").on(
      table.recipientId,
      table.readAt,
    ),
    index("notifications_recipient_created_idx").on(
      table.recipientId,
      table.createdAt,
    ),
    index("notifications_entity_idx").on(table.entityType, table.entityId),
  ],
)

export type Notification = typeof notifications.$inferSelect
export type NewNotification = typeof notifications.$inferInsert

/**
 * 圈子活动状态字面量联合:
 * - `active`   正常发布(可报名/查看)
 * - `cancelled` 已取消(软删除,非创建者不可见)
 *
 * 不引入 pgEnum,沿用项目 `text + TS 联合` 惯例。
 */
export const ACTIVITY_STATUSES = ["active", "cancelled"] as const
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number]

/**
 * 活动表(顶层独立资源,与圈子解耦)。
 *
 * 任何 TEACHER / ADMIN 用户均可直接发布活动,无需圈子归属。设计要点:
 *
 * - `creatorId` 快照发布者,校验"只有发布者(TEACHER/ADMIN)可编辑/取消"。
 * - `title`       活动标题(列表展示必需)。
 * - `description` 富文本 HTML 字符串(编辑端用 uni `<editor>`,展示端 `<rich-text>`)。
 *                  服务端仅做白名单式净化,拒绝 `<script`/`<iframe`/`on*=` 等危险片段。
 * - `startTime` / `registrationDeadline` 带时区时间戳;业务约束 deadline < startTime。
 * - `contactPhone` 活动联系人电话(可为空)。
 * - `status`      软取消标记,默认 active;取消仅置 cancelled 不硬删。
 */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** 富文本 HTML(净化后) */
    description: text("description").notNull(),
    /** 活动起始时间(带时区) */
    startTime: timestamp("start_time", { withTimezone: true }).notNull(),
    /** 报名截止时间(带时区),约束 < startTime */
    registrationDeadline: timestamp("registration_deadline", {
      withTimezone: true,
    }).notNull(),
    /** 活动联系人电话(可空) */
    contactPhone: text("contact_phone"),
    /** 轮播图片 URL 数组(0-9 个,可空数组);默认空数组避免 NULL 语义混乱 */
    coverImages: text("cover_images")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: text("status")
      .$type<ActivityStatus>()
      .notNull()
      .default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("activities_creator_idx").on(table.creatorId),
    index("activities_status_idx").on(table.status),
    index("activities_start_time_idx").on(table.startTime),
    // 业务约束:报名截止时间必须早于活动起始时间
    check(
      "activities_deadline_before_start",
      sql`${table.registrationDeadline} < ${table.startTime}`
    ),
  ]
)

export type Activity = typeof activities.$inferSelect
export type NewActivity = typeof activities.$inferInsert

/**
 * 兴趣行为事件类型:
 * - `hobby_tag_save`    保存个人兴趣标签(PUT /api/users/me/hobby-tags)
 * - `tag_search`        搜索兴趣关键词(GET /api/hobby-tags/search 带 q)
 * - `circle_tag_create` 创建圈子选择标签(POST /api/circles)
 */
export const INTEREST_EVENT_TYPES = ["hobby_tag_save", "tag_search", "circle_tag_create"] as const
export type InterestEventType = (typeof INTEREST_EVENT_TYPES)[number]

/**
 * 兴趣行为事件表(append-only + 每日幂等)。
 *
 * 每行 = 用户 + 标签名 + 事件类型 + 事件日期 + 得分。
 * - `tagName` 存 hobby_tags.name 快照(与 users.tags / circles.tags 惯例一致,不设 FK);
 * - `eventDate` 为东八区自然日 YYYY-MM-DD;
 * - `score` = 事件日与锚定日期 2026-08-24 的天数差(写入时计算,>=0);
 * - `UNIQUE(user_id, tag_name, event_date)` 保证同用户同标签同天仅一条(幂等)。
 */
export const interestEvents = pgTable(
  "interest_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tagName: text("tag_name").notNull(),
    eventType: text("event_type").$type<InterestEventType>().notNull(),
    eventDate: date("event_date").notNull(),
    score: integer("score").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // 幂等:同一用户同一天对同一标签仅一条
    uniqueIndex("interest_events_user_tag_day_idx").on(
      table.userId,
      table.tagName,
      table.eventDate
    ),
    // 读路径:时间窗口过滤 + 分组聚合
    index("interest_events_date_tag_idx").on(table.eventDate, table.tagName),
  ]
)

export type InterestEvent = typeof interestEvents.$inferSelect
export type NewInterestEvent = typeof interestEvents.$inferInsert
