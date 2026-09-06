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
 * 用户角色:管理员 / 普通爱好者 / 老师。
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
  /** 手机号(可空,登录实名凭证;仅本人可见,不进入任何对外响应) */
  phone?: string | null
  /** 微信号(可空)。人-人联系链路中唯一可对外展示的联系方式 */
  wechat?: string | null
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
 * 联系方式可见性判定原因。
 * - `self`         本人查看自己
 * - `accepted`     双方已通过打招呼建立联系(唯一解锁途径)
 * - `need_request` 对方已填联系方式但双方尚未建立联系,需先打招呼
 * - `not_provided` 对方未填写任何联系方式
 */
export type ContactVisibilityReason =
  | "self"
  | "accepted"
  | "need_request"
  | "not_provided"

/**
 * 联系方式可见性。
 * - 解锁规则:仅「本人查看自己」或「双方已互相接受打招呼」时可见,
 *   对方隐私设置中的 publicContact 不影响本规则;
 * - 优先返回微信号(`wechat`);微信号缺失时兜底返回手机号(`phone`),
 *   手机号仅作为"联系不到微信时的备用通道",不会在无权查看时泄露。
 */
export type ContactVisibility = {
  visible: boolean
  /** 可见的微信号;仅在 visible 为 true 且有微信号时有值 */
  wechat: string | null
  /** 微信号缺失时的兜底联系方式(手机号);仅在 visible 为 true 且 wechat 为空时有值 */
  phone: string | null
  /** 实际可对外展示的联系方式类型,前端据此展示"微信/手机号"及复制/拨打行为 */
  contactType: "wechat" | "phone" | null
  reason: ContactVisibilityReason
}

/** 当前登录用户与目标用户之间的人-人关系快照。 */
export type UserRelation = {
  /** 我是否已关注对方 */
  followed: boolean
  /**
   * - `none`             无往来
   * - `pending_sent`     我发出的,等待对方处理
   * - `pending_received` 我收到的,等待我处理
   * - `accepted`         已建立联系
   * - `rejected`         最近一次请求被拒绝(可再次发起)
   */
  contactStatus:
    | "none"
    | "pending_sent"
    | "pending_received"
    | "accepted"
    | "rejected"
  /** pending_received 时为待处理请求 id,供前端直接调 accept / reject */
  requestId: string | null
}

/**
 * 公开用户主页 DTO(用于 GET /api/users/[id]/profile 响应)。
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
  /** 联系方式可见性:visible 为 true 时,contactType 指示 wechat / phone 哪种有值 */
  contact: ContactVisibility
  /** 当前登录用户与该用户的关系 */
  relation: UserRelation
}

/**
 * 联系请求 DTO(用于 /api/contact-requests 响应)。
 * `message` 仅一次性自我介绍,不承担聊天职责。
 */
export type ContactRequestDTO = {
  id: string
  /** 发起方 */
  fromUser: { id: string; name: string; avatarUrl: string | null }
  /** 接收方 */
  toUser: { id: string; name: string; avatarUrl: string | null }
  message: string | null
  status: "pending" | "accepted" | "rejected"
  createdAt: string
  /** 对方处理时间(未处理为 null) */
  respondedAt: string | null
}

/**
 * 我关注的人列表项 DTO(用于 GET /api/users/followed 响应)。
 */
export type FollowedUserDTO = {
  id: string
  name: string
  avatarUrl: string | null
  tags: string[]
  activityLevel: ActivityLevel
  practiceYears: number | null
  address: string | null
  /** 关注时间 */
  followedAt: string
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

/**
 * 活动 DTO(顶层独立资源,与圈子解耦;由 TEACHER / ADMIN 发布)。
 * 时间字段均为 ISO 字符串;description 为净化后的富文本 HTML。
 */
export type ActivityDTO = {
  id: string
  creatorId: string
  title: string
  description: string
  /** 活动起始时间(ISO) */
  startTime: string
  /** 报名截止时间(ISO) */
  registrationDeadline: string
  /** 活动联系人电话(可空) */
  contactPhone: string | null
  /** 轮播图片 URL 数组(0-9 张) */
  coverImages: string[]
  status: "active" | "cancelled"
  createdAt: string
  updatedAt: string
}

/** 活动列表分页响应 */
export type ActivityListDTO = Paginated<ActivityDTO>

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
  /** 关联业务对象类型(可空):'circle' 圈子 / 'user' 用户 */
  entityType: "circle" | "user" | null
  /** 关联业务对象 id(可空),如 circleId / userId */
  entityId: string | null
  /**
   * 通知类型:
   * - circle_review / circle_review_result / circle_followed 圈子相关
   * - contact_request 收到打招呼 / contact_accepted 打招呼被接受 / user_followed 被关注
   */
  type:
    | "circle_review"
    | "circle_review_result"
    | "circle_followed"
    | "contact_request"
    | "contact_accepted"
    | "user_followed"
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

/**
 * 热门兴趣 DTO(TagDTO + 热度得分)。
 * heat = 时间窗口内该标签的得分总和(每用户每自然日至多贡献一条事件)。
 */
export type HotInterestDTO = TagDTO & {
  /** 时间窗口内该标签的得分总和 */
  heat: number
}
