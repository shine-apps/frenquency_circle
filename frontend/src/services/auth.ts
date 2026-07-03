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
  createdAt: string
  updatedAt: string
}

/**
 * 将 AuthUser 映射为前端 UserInfo。
 * 手机号登录用户的 email 形如 `13800138000@phonedomain.com`,从中提取手机号。
 */
export function toUserInfo(auth: AuthUser): UserInfo {
  const phoneMatch = /^(\d{11})@/.exec(auth.email)
  return {
    id: auth.id,
    name: auth.name,
    email: auth.email,
    role: auth.role,
    phone: phoneMatch ? phoneMatch[1] : undefined,
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
