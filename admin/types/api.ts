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
  /** 用户已绑定的兴趣标签列表 */
  tags: TagDTO[]
}

/**
 * 兴趣标签 DTO。
 */
export type TagDTO = {
  id: string
  name: string
  /** 一级大类 */
  category: string
  /** 二级分类(可空) */
  subCategory?: string | null
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
 * 同频的人匹配结果项。
 */
export type MatchPersonDTO = {
  userId: string
  name: string
  avatarUrl: string | null
  distanceKm: number
  tags: TagDTO[]
  activityLevel: ActivityLevel
  practiceYears: number | null
}

/**
 * 同频的圈子匹配结果项。
 */
export type MatchCircleDTO = {
  circleId: string
  title: string
  distanceKm: number
  tags: TagDTO[]
  activityTime: string | null
  memberCount: number
  maxMembers: number | null
  address: string
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
 * 圈子详情 DTO(含 creator 信息、标签、被联系次数)。
 */
export type CircleDetailDTO = CircleDTO & {
  creator: { id: string; name: string; avatarUrl: string | null }
  tags: TagDTO[]
  contactCount: number
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
  circleId: string
  files: CertificationFile[]
  status: "pending" | "approved" | "rejected"
  reviewNote: string | null
  createdAt: string
  updatedAt: string
}

/**
 * 定位发布请求体。
 */
export type LocationPublishInput = {
  latitude: number
  longitude: number
  address: string
  tagIds: string[]
  rangeKm: 1 | 5 | 10 | 30
}
