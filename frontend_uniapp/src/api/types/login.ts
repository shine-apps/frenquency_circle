import type { ActivityLevel, UserDTO as BusinessUserDTO, UserRole as BusinessUserRole, PrivacySettings, TagDTO, UserGender, UserProfile } from '@/types'

/**
 * 单 token 响应(store 内部持久化结构)。
 * 后端为单 token 模式(见 admin 的 `authConfig.session` + 登录响应 `expiresIn`),
 * 双 token / 无感刷新的模板实现已随「登录链路收敛」移除。
 */
export interface ISingleTokenRes {
  /** JWT */
  token: string
  /** 有效期(秒) */
  expiresIn: number
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
  /**
   * JWT 有效期(秒)，由后端与 `authConfig.session.maxAge` 同源下发。
   * 可选仅为兼容未升级的旧后端，前端取不到时回退到默认值(见 store/token.ts)。
   */
  expiresIn?: number
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
