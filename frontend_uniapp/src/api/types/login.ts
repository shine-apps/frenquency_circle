import type { ActivityLevel, UserDTO as BusinessUserDTO, UserRole as BusinessUserRole, PrivacySettings, TagDTO, UserGender, UserProfile } from '@/types'

// 认证模式类型
export type AuthMode = 'single' | 'double'

// 单Token响应类型
export interface ISingleTokenRes {
  token: string
  expiresIn: number // 有效期(秒)
}

// 双Token响应类型
export interface IDoubleTokenRes {
  accessToken: string
  refreshToken: string
  accessExpiresIn: number // 访问令牌有效期(秒)
  refreshExpiresIn: number // 刷新令牌有效期(秒)
}

/**
 * 登录返回的信息，其实就是 token 信息
 */
export type IAuthLoginRes = ISingleTokenRes | IDoubleTokenRes

/**
 * 用户信息
 */
export type UserRole = string

export interface IUserInfoRes {
  userId: number
  username: string
  nickname: string
  avatar?: string
  /** 同时支持单角色和多角色，你自行选择一种就行 */
  role?: UserRole
  roles?: UserRole[]
  [key: string]: any // 允许其他扩展字段
}

// 认证存储数据结构
export interface AuthStorage {
  mode: AuthMode
  tokens: ISingleTokenRes | IDoubleTokenRes
  userInfo?: IUserInfoRes
  loginTime: number // 登录时间戳
}

/**
 * 获取验证码
 */
export interface ICaptcha {
  captchaEnabled: boolean
  uuid: string
  image: string
}
/**
 * 上传成功的信息
 */
export interface IUploadSuccessInfo {
  fileId: number
  originalName: string
  fileName: string
  storagePath: string
  fileHash: string
  fileType: string
  fileBusinessType: string
  fileSize: number
}
/**
 * 更新用户信息
 */
export interface IUpdateInfo {
  id: number
  name: string
  sex: string
}
/**
 * 更新用户信息
 */
export interface IUpdatePassword {
  id: number
  oldPassword: string
  newPassword: string
  confirmPassword: string
}

/**
 * 判断是否为单Token响应
 * @param tokenRes 登录响应数据
 * @returns 是否为单Token响应
 */
export function isSingleTokenRes(tokenRes: IAuthLoginRes): tokenRes is ISingleTokenRes {
  return 'token' in tokenRes && !('refreshToken' in tokenRes)
}

/**
 * 判断是否为双Token响应
 * @param tokenRes 登录响应数据
 * @returns 是否为双Token响应
 */
export function isDoubleTokenRes(tokenRes: IAuthLoginRes): tokenRes is IDoubleTokenRes {
  return 'accessToken' in tokenRes && 'refreshToken' in tokenRes
}

// ==================== 趣邻圈业务类型 ====================

/** JWT 中携带的用户字段(与后端 AuthUser 对齐) */
export interface AuthUser {
  id: string
  email: string
  name: string
  role: BusinessUserRole
}

/** Token 模式登录响应 */
export interface AuthLoginResponse {
  token: string
  user: AuthUser
}

/**
 * /api/auth/me 返回的完整用户信息。
 * 直接复用 @/types 定义:后端 toUserDTO 实际返回 phone / practiceYears /
 * activityLevel / privacySettings / location / address,两份结构必须同源,
 * 否则 DTO 映射只能依赖运行时 in 判断,无法被类型系统校验。
 */
export type UserDTO = BusinessUserDTO

/**
 * PATCH /api/auth/me 请求体(全部可选,至少传 1 个字段)。
 * avatarUrl 传空串视为清除(后端归一为 null)。
 */
export interface UpdateMyProfileInput {
  name?: string
  email?: string
  avatarUrl?: string
  /** 性别(传 null 表示清除) */
  gender?: UserGender | null
  /** 生日 YYYY-MM-DD(传 null 表示清除) */
  birthday?: string | null
}

/**
 * 业务资料更新请求体(role / phone / address / latitude / longitude / practiceYears / activityLevel)。
 * 对应后端 `PATCH /api/users/me/profile` zod schema。
 */
export interface UpdateProfileInput {
  /** 角色:仅允许 USER / TEACHER(禁止 ADMIN,防越权提权) */
  role?: 'USER' | 'TEACHER'
  /** 手机号(空串视为清除,后端归一为 null) */
  phone?: string
  /** 地址(空串视为清除,后端归一为 null,最长 200 字符) */
  address?: string
  /** 纬度(与 longitude 成对,由地址选择组件回填;null 视为清除) */
  latitude?: number | null
  /** 经度(与 latitude 成对,由地址选择组件回填;null 视为清除) */
  longitude?: number | null
  /** 练习年限(0-100 整数) */
  practiceYears?: number
  /** 活跃度等级 */
  activityLevel?: 'low' | 'medium' | 'high'
  /** 微信号(空串/null 视为清除,后端归一为 null,最长 50 字符) */
  wechat?: string | null
}

export type {
  ActivityLevel,
  PrivacySettings,
  TagDTO,
  UserGender,
  UserProfile,
}
