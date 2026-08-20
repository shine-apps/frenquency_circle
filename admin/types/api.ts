export type IResponse<T = unknown> = {
  /** 业务码,镜像 HTTP 状态码:200/201 成功,4xx/5xx 失败 */
  code: number
  /** 成功为业务数据;失败为 null */
  data: T
  /** 成功为 "OK";失败为人类可读的错误描述 */
  message: string
  /** 仅校验失败等场景附带(如 zod flatten 结果) */
  details?: unknown
}

export type Paginated<T> = {
  list: T[]
  total: number
  page: number
  pageSize: number
}

/**
 * 用户角色:管理员 / 普通爱好者 / 传承人(老师)。
 */
export type UserRole = "ADMIN" | "USER" | "TEACHER"

/**
 * 用户活跃度等级。
 */
export type ActivityLevel = "low" | "medium" | "high"

/**
 * 位置精度脱敏等级:
 * - `exact` 精确距离
 * - `community` 四舍五入到 0.5km
 * - `region` 四舍五入到 5km
 */
export type LocationPrecision = "exact" | "community" | "region"

/**
 * 隐私设置(存储于 users.privacySettings JSONB)。
 */
export type PrivacySettings = {
  allowMatch: boolean
  publicContact: boolean
  locationPrecision: LocationPrecision
}

/**
 * 经纬度坐标对象(用于 DTO 层传递,底层 schema 拆分为 latitude/longitude 双列)。
 */
export type LocationPoint = {
  latitude: number
  longitude: number
}

export type UserDTO = {
  id: string
  email: string
  name: string
  role: UserRole
  /** 头像 URL(可空) */
  avatarUrl?: string | null
  /** 手机号(可空) */
  phone?: string | null
  /** 练习年限(可空,TEACHER 角色常用) */
  practiceYears?: number | null
  /** 活跃度等级(可空,默认 medium) */
  activityLevel?: ActivityLevel
  /** 隐私设置 */
  privacySettings: PrivacySettings
  /** 用户位置(可空,latitude/longitude 同时为空时返回 null) */
  location?: LocationPoint | null
  /** 逆地理编码地址(可空) */
  address?: string | null
  createdAt: string
  updatedAt: string
}

/**
 * 用户档案 DTO(含兴趣标签),用于 /api/auth/me 与 /api/users/me/profile 响应。
 */
export type UserProfileDTO = UserDTO & {
  /** 用户已绑定的兴趣标签名称数组(存 hobby_tags.name) */
  tags: string[]
}

/**
 * 兴趣标签 DTO。分类灵活化后,标签可挂在任意层级的分类节点:
 * - 挂在 level=2 中类:category=一级大类名,subCategory=该中类名
 * - 挂在 level=1 叶子大类:category=该大类名,subCategory=null
 * category / subCategory 由 categories 分类树关联得出,categoryLevel 标明层级。
 */
export type TagDTO = {
  id: string
  /** 叶子标签名称(如"太极拳""书法") */
  name: string
  /** 一级大类名称(如"传统与民族文化"),由 categories 关联得出 */
  category: string
  /** 二级中类名称(如"运动健身");由 categories 关联得出;本节点为 level=1 叶子大类时为 null */
  subCategory?: string | null
  /** 所属分类节点 id(指向 categories.id,可为 level=1 叶子或 level=2 中类) */
  categoryId?: string | null
  /** 所属分类节点层级:1=一级大类(叶子),2=二级中类。分类灵活化后标签可挂在任意层级 */
  categoryLevel?: 1 | 2 | null
  /** 拼音全拼(可空) */
  pinyin?: string | null
  /** 拼音首字母(可空) */
  pinyinInitials?: string | null
  /** 标签状态 */
  status: "pending" | "approved" | "rejected"
  /** 创建者 userId(可空,系统种子标签为 null) */
  createdBy?: string | null
  createdAt: string
  updatedAt: string
}

/**
 * JWT 中携带的用户字段(无时间戳),用于登录响应与 Bearer 鉴权。
 */
export type AuthUser = {
  id: string
  email: string
  name: string
  role: UserRole
}

/**
 * Token 模式登录响应:返回 JWT 与用户信息,前端持久化后以 Bearer 携带。
 */
export type AuthLoginResponse = {
  token: string
  user: AuthUser
}

/**
 * 同趣的人匹配结果项。
 */
export type MatchPersonDTO = {
  userId: string
  name: string
  avatarUrl: string | null
  distanceKm: number
  tags: string[]
  activityLevel: ActivityLevel
  practiceYears: number | null
}

/**
 * 同趣的圈子匹配结果项。
 */
export type MatchCircleDTO = {
  circleId: string
  title: string
  distanceKm: number
  tags: string[]
  activityTime: string | null
  memberCount: number
  maxMembers: number | null
  address: string
}

/**
 * 公开用户主页 DTO(用于 /api/users/[id]/profile 响应)。
 * 不含 email / phone / privacySettings 等敏感字段。
 */
export type PublicUserProfileDTO = {
  id: string
  name: string
  avatarUrl: string | null
  tags: string[]
  activityLevel: ActivityLevel
  practiceYears: number | null
  address: string | null
  createdAt: string
}

/**
 * 圈子列表项 DTO(不含 creator 详情,用于列表页)。
 */
export type CircleDTO = {
  id: string
  title: string
  description: string
  creatorId: string
  latitude: number
  longitude: number
  address: string
  contactPhone: string | null
  wechat: string | null
  activityTime: string | null
  maxMembers: number | null
  memberCount: number
  status: string
  /** 轮播图片 URL 数组(0-9 个,空数组表示无轮播) */
  coverImages: string[]
  createdAt: string
  updatedAt: string
}

/**
 * 圈子详情 DTO(含 creator 信息、标签、被联系次数、关注状态)。
 */
export type CircleDetailDTO = CircleDTO & {
  creator: { id: string; name: string; avatarUrl: string | null }
  tags: string[]
  contactCount: number
  /** 当前用户是否已关注该圈子(未登录场景恒为 false) */
  isFollowed: boolean
  /** 圈子被关注总数 */
  followCount: number
}

/**
 * 我关注的圈子列表项 DTO(用于 /api/circles/followed 响应)。
 */
export type FollowedCircleDTO = CircleDTO & {
  /** 关注时间 */
  followedAt: string
}

/**
 * 认证材料文件项(存储于 teacher_applications.files JSONB)。
 */
export type CertificationFile = {
  url: string
  key: string
  size: number
  mimeType: string
  originalName: string
}

/**
 * 教师认证申请 DTO。
 */
export type TeacherApplicationDTO = {
  id: string
  userId: string
  /** 关联的圈子 ID(独立认证时为 null) */
  circleId: string | null
  files: CertificationFile[]
  /** 身份证人像面(必填) */
  idCardFront: CertificationFile | null
  /** 身份证国徽面(必填) */
  idCardBack: CertificationFile | null
  status: "pending" | "approved" | "rejected"
  reviewNote: string | null
  createdAt: string
  updatedAt: string
}

/** 管理员教师认证申请列表项 */
export type AdminTeacherApplicationItem = TeacherApplicationDTO & {
  userName: string
  reviewerName?: string | null
}

// ---- 分类（categories） ----

export interface CategoryDTO {
  id: string
  name: string
  slug: string
  level: number
  parentId: string | null
  sortOrder: number
}

export interface CategoryNode extends CategoryDTO {
  children: CategoryNode[]
}

export interface CategoryTreeResponse {
  tree: CategoryNode[]
}

/**
 * 通知 / 消息 DTO(`notifications` 表对外的投影)。
 * 文案中的人名 / 圈子名已在创建时快照进 `title` / `content`,
 * `actorId` / `entityId` 为关联引用(可空),本期前端可选择性消费。
 */
export type NotificationDTO = {
  id: string
  /** 触发者 id(可空);系统通知为 null */
  actorId: string | null
  /** 关联业务对象类型(可空),本期仅 'circle' */
  entityType: "circle" | null
  /** 关联业务对象 id(可空),如 circleId */
  entityId: string | null
  /** 通知类型:circle_review / circle_review_result / circle_followed */
  type: "circle_review" | "circle_review_result" | "circle_followed"
  title: string
  content: string
  /** 引导打开的页面链接(小程序页面路径或后台路由) */
  linkUrl: string | null
  /** 跳转目标入口:miniprogram / admin */
  linkTarget: "miniprogram" | "admin"
  /** 已读时间(可空,null 表示未读) */
  readAt: string | null
  createdAt: string
}

/** 通知跳转目标入口:miniprogram = 小程序端,admin = 后台管理端 */
export type NotificationLinkTarget = "miniprogram" | "admin"
