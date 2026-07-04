import { request } from './request'
import type { UserInfo } from '@/store/user'

/** JWT 中携带的用户字段(与后端 AuthUser 对齐) */
export interface AuthUser {
  id: string
  email: string
  name: string
  role: string
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
  role: string
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
 */
export function toUserInfo(auth: AuthUser): UserInfo {
  return {
    id: auth.id,
    name: auth.name,
    email: auth.email,
    role: auth.role,
    phone: extractPhone(auth.email),
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
