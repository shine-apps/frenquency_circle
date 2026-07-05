import { request } from './request'
import type { UserInfo } from '@/store/user'

/** JWT 中携带的用户字段(与后端 AuthUser 对齐) */
export interface AuthUser {
  id: string
  email: string
  name: string
  role: UserRole
}

/** Token 模式登录响应 */
export interface AuthLoginResponse {
  token: string
  user: AuthUser
}

/** /api/auth/me 返回的完整用户信息 */
export interface UserDTO {
  id: string
  email: string
  name: string
  role: UserRole
  /** 头像 URL(可空) */
  avatarUrl?: string | null
  createdAt: string
  updatedAt: string
}

/**
 * PATCH /api/auth/me 请求体(全部可选,至少传 1 个字段)。
 * avatarUrl 传空串视为清除(后端归一为 null)。
 */
export interface UpdateMyProfileInput {
  name?: string
  email?: string
  avatarUrl?: string
}

/**
 * 从 email 中提取手机号。
 * 手机号登录用户的 email 形如 `13800138000@phonedomain.com`;非此格式返回 undefined。
 */
function extractPhone(email: string): string | undefined {
  const m = /^(\d{11})@/.exec(email)
  return m ? m[1] : undefined
}

/**
 * 将 AuthUser 映射为前端 UserInfo。
 * 手机号登录用户的 email 形如 `13800138000@phonedomain.com`,从中提取手机号。
 * 登录响应不含 tags,默认空数组;后续由 `getMyProfile` 填充。
 */
export function toUserInfo(auth: AuthUser): UserInfo {
  return {
    id: auth.id,
    name: auth.name,
    email: auth.email,
    role: auth.role,
    phone: extractPhone(auth.email),
    tags: [],
  }
}

/**
 * 将后端 UserDTO 映射为前端 UserInfo 局部更新。
 * 用于 `useUserStore.updateUser` 入参:
 * - `avatar` 字段沿用旧语义(头像展示)
 * - `avatarUrl` 字段保留(后端原值,便于后续编辑页回填)
 * - `phone` 从最新 email 重算(避免邮箱变更后残留旧手机号)
 */
export function fromUserDTO(dto: UserDTO): Partial<UserInfo> {
  return {
    id: dto.id,
    name: dto.name,
    email: dto.email,
    role: dto.role,
    phone: extractPhone(dto.email),
    avatar: dto.avatarUrl ?? undefined,
    avatarUrl: dto.avatarUrl ?? undefined,
  }
}

/** 发送短信验证码(无需鉴权) */
export async function sendSmsCode(phone: string): Promise<void> {
  await request<null>({
    url: '/api/auth/sms/send',
    method: 'POST',
    data: { phone },
    skipAuth: true,
  })
}

/** 邮箱+密码登录 */
export async function loginByCredentials(
  email: string,
  password: string
): Promise<AuthLoginResponse> {
  return request<AuthLoginResponse>({
    url: '/api/auth/login/credentials',
    method: 'POST',
    data: { email, password },
    skipAuth: true,
  })
}

/** 手机号+验证码登录 */
export async function loginByPhone(
  phone: string,
  code: string
): Promise<AuthLoginResponse> {
  return request<AuthLoginResponse>({
    url: '/api/auth/login/phone',
    method: 'POST',
    data: { phone, code },
    skipAuth: true,
  })
}

/** 微信小程序手机号快捷登录 */
export async function loginByWechat(
  code: string,
  phoneCode: string
): Promise<AuthLoginResponse> {
  return request<AuthLoginResponse>({
    url: '/api/auth/wechat-miniprogram/login',
    method: 'POST',
    data: { code, phoneCode },
    skipAuth: true,
  })
}

/** 获取当前登录用户(校验 token + 刷新用户信息) */
export async function fetchCurrentUser(): Promise<UserDTO> {
  return request<UserDTO>({
    url: '/api/auth/me',
    method: 'GET',
  })
}

/** 更新当前登录用户自己的资料(昵称 / 邮箱 / 头像 URL) */
export async function updateMyProfile(
  patch: UpdateMyProfileInput
): Promise<UserDTO> {
  return request<UserDTO>({
    url: '/api/auth/me',
    method: 'PATCH',
    data: patch as Record<string, unknown>,
  })
}

// ============ 业务资料扩展(Phase 5 新增)============

/**
 * 获取当前登录用户的完整资料(含 tags / privacySettings / 业务字段)。
 * - 走 `GET /api/auth/me`,后端返回 UserProfileDTO
 * - 与 `fetchCurrentUser` 区别:后者返回 UserDTO(无 tags),仅用于 token 校验;
 *   本函数用于需要完整资料的页面(个人中心、隐私设置等)
 */
export async function getMyProfile(): Promise<UserProfile> {
  return request<UserProfile>({
    url: '/api/auth/me',
    method: 'GET',
  })
}

/**
 * 全量替换当前用户的兴趣标签关联。
 * - PUT /api/users/me/tags
 * - 后端 zod 校验 `tagIds: string[](1-10 项 uuid)`
 * - 后端校验所有 tagId 是否存在,任一不存在返回 400
 *
 * @param tagIds 标签 ID 列表(1-10 个)
 * @returns 更新后的标签列表
 */
export async function updateMyTags(tagIds: string[]): Promise<TagDTO[]> {
  const res = await request<{ tags: TagDTO[] }>({
    url: '/api/users/me/tags',
    method: 'PUT',
    data: { tagIds },
  })
  return res.tags
}

/**
 * 更新当前用户的隐私设置。
 * - PUT /api/users/me/privacy
 * - `allowMatch=false` 时该用户不出现在他人的"同频的人"匹配结果
 *
 * @param settings 隐私设置
 * @returns 后端实际持久化的 PrivacySettings
 */
export async function updatePrivacy(
  settings: PrivacySettings
): Promise<PrivacySettings> {
  const res = await request<{ privacySettings: PrivacySettings }>({
    url: '/api/users/me/privacy',
    method: 'PUT',
    data: settings as unknown as Record<string, unknown>,
  })
  return res.privacySettings
}

/**
 * 业务资料更新请求体(role / phone / practiceYears / activityLevel)。
 * 对应后端 `PATCH /api/users/me/profile` zod schema。
 */
export interface UpdateProfileInput {
  /** 角色:仅允许 USER / TEACHER(禁止 ADMIN,防越权提权) */
  role?: 'USER' | 'TEACHER'
  /** 手机号(空串视为清除,后端归一为 null) */
  phone?: string
  /** 练习年限(0-100 整数) */
  practiceYears?: number
  /** 活跃度等级 */
  activityLevel?: 'low' | 'medium' | 'high'
}

/**
 * 更新当前用户的业务资料(role / phone / practiceYears / activityLevel)。
 * - PATCH /api/users/me/profile
 * - 与 `updateMyProfile`(PATCH /api/auth/me,负责 name/email/avatarUrl)分工:
 *   本函数负责 spec 新增的业务字段
 * - 后端返回完整 UserProfileDTO(含 tags),前端用 UserProfile 接收
 *
 * @param patch 业务字段(至少传 1 个)
 * @returns 更新后的 UserProfile
 */
export async function updateProfile(
  patch: UpdateProfileInput
): Promise<UserProfile> {
  return request<UserProfile>({
    url: '/api/users/me/profile',
    method: 'PATCH',
    data: patch as Record<string, unknown>,
  })
}
