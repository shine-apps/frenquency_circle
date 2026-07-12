/// <reference types="@tarojs/taro" />

declare module '*.png';
declare module '*.gif';
declare module '*.jpg';
declare module '*.jpeg';
declare module '*.svg';
declare module '*.css';
declare module '*.less';
declare module '*.scss';
declare module '*.sass';
declare module '*.styl';

declare namespace NodeJS {
  interface ProcessEnv {
    /** NODE 内置环境变量, 会影响到最终构建生成产物 */
    NODE_ENV: 'development' | 'production',
    /** 当前构建的平台 */
    TARO_ENV: 'weapp' | 'swan' | 'alipay' | 'h5' | 'rn' | 'tt' | 'quickapp' | 'qq' | 'jd'
    /**
     * 当前构建的小程序 appid
     * @description 若不同环境有不同的小程序，可通过在 env 文件中配置环境变量`TARO_APP_ID`来方便快速切换 appid， 而不必手动去修改 dist/project.config.json 文件
     * @see https://taro-docs.jd.com/docs/next/env-mode-config#特殊环境变量-taro_app_id
     */
    TARO_APP_ID: string
  }
}

/**
 * 后端 API 基址,由 config/{dev,prod}.ts 的 defineConstants 注入。
 * 用于 services/request.ts 拼接请求 URL。
 */
declare const API_BASE_URL: string

/** 高德地图 JS API key,由 config/{dev,prod}.ts 的 defineConstants 注入 */
declare const AMAP_KEY: string
/** 高德地图 JS API 安全密钥,由 config/{dev,prod}.ts 的 defineConstants 注入 */
declare const AMAP_SECURITY_CODE: string

// ============ 业务 DTO 类型(与后端 admin/types/api.ts 对齐) ============

/** 兴趣标签 */
declare interface TagDTO {
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
  status: 'pending' | 'approved' | 'rejected'
}

/** 标签分类树节点 */
declare interface CategoryNode {
  category: string
  subCategories: string[]
}

/** 隐私设置(存储于 users.privacySettings JSONB) */
declare interface PrivacySettings {
  /** 是否允许出现在他人的"同频的人"匹配结果 */
  allowMatch: boolean
  /** 是否对外公开联系方式 */
  publicContact: boolean
  /** 位置精度脱敏等级 */
  locationPrecision: 'exact' | 'community' | 'region'
}

/** 经纬度坐标点 */
declare interface LocationPoint {
  latitude: number
  longitude: number
}

/** 用户角色:管理员 / 普通爱好者 / 传承人(老师) */
declare type UserRole = 'ADMIN' | 'USER' | 'TEACHER'

/** 用户活跃度等级 */
declare type ActivityLevel = 'low' | 'medium' | 'high'

/**
 * 完整用户资料(含业务字段),与后端 UserProfileDTO 对齐。
 * 用于 GET /api/auth/me 与 PATCH /api/users/me/profile 响应。
 */
declare interface UserProfile {
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
  /** 活跃度等级 */
  activityLevel?: ActivityLevel
  /** 隐私设置 */
  privacySettings?: PrivacySettings
  /** 用户位置(可空) */
  location?: LocationPoint | null
  /** 逆地理编码地址(可空) */
  address?: string | null
  /** 用户已绑定的兴趣标签列表 */
  tags: TagDTO[]
  createdAt: string
  updatedAt: string
}

/** 同频的人匹配结果项 */
declare interface MatchPersonDTO {
  userId: string
  name: string
  avatarUrl: string | null
  /** 与当前用户的距离(公里),已按隐私设置脱敏 */
  distanceKm: number
  tags: TagDTO[]
  activityLevel: ActivityLevel
  practiceYears: number | null
}

/** 同频的圈子匹配结果项 */
declare interface MatchCircleDTO {
  circleId: string
  title: string
  /** 与当前用户的距离(公里) */
  distanceKm: number
  tags: TagDTO[]
  activityTime: string | null
  memberCount: number
  maxMembers: number | null
  address: string
}

/** 圈子列表项(简化,用于列表页) */
declare interface CircleDTO {
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
  /** 圈子状态:active / offline / deleted / violated */
  status: string
  createdAt: string
  updatedAt: string
}

/** 圈子详情(含 creator 信息、标签、被联系次数) */
declare interface CircleDetailDTO extends CircleDTO {
  creator: { id: string; name: string; avatarUrl: string | null }
  tags: TagDTO[]
  contactCount: number
}

/** 发布定位请求体 */
declare interface LocationPublishInput {
  latitude: number
  longitude: number
  address: string
  tagIds: string[]
  /** 匹配范围(公里),四档可选 */
  rangeKm: 1 | 5 | 10 | 30
}

/** 创建圈子请求体 */
declare interface CreateCircleInput {
  title: string
  tagIds: string[]
  description: string
  latitude: number
  longitude: number
  address: string
  contactPhone?: string
  wechat?: string
  activityTime?: string
  maxMembers?: number
}

/** 更新圈子请求体(全部可选,与后端 PUT schema 对齐:不含 latitude/longitude/address) */
declare interface UpdateCircleInput extends Partial<CreateCircleInput> {}

/** 分页响应 */
declare interface Paginated<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}
