import type {
  AuthLoginResponse,
  AuthUser,
  ICaptcha,
  IDoubleTokenRes,
  IUpdateInfo,
  IUpdatePassword,
  IUserInfoRes,
  IAuthLoginRes,
} from './types/login'
import { http } from '@/http/http'

/**
 * 登录表单
 */
export interface ILoginForm {
  username: string
  password: string
}

/**
 * 获取验证码
 * @returns ICaptcha 验证码
 */
export function getCode() {
  return http.get<ICaptcha>('/user/getCode')
}

/**
 * 用户登录
 * @param loginForm 登录表单
 */
export function login(loginForm: ILoginForm) {
  return http.post<IAuthLoginRes>('/auth/login', loginForm)
}

/**
 * 刷新token
 * @param refreshToken 刷新token
 */
export function refreshToken(refreshToken: string) {
  return http.post<IDoubleTokenRes>('/auth/refreshToken', { refreshToken })
}

/**
 * 获取用户信息
 */
export function getUserInfo() {
  return http.get<IUserInfoRes>('/user/info')
}

/**
 * 退出登录
 */
export function logout() {
  return http.get<void>('/auth/logout')
}

/**
 * 修改用户信息
 */
export function updateInfo(data: IUpdateInfo) {
  return http.post('/user/updateInfo', data)
}

/**
 * 修改用户密码
 */
export function updateUserPassword(data: IUpdatePassword) {
  return http.post('/user/updatePassword', data)
}

/**
 * 获取微信登录凭证
 * @returns Promise 包含微信登录凭证(code)
 */
export function getWxCode() {
  return new Promise<UniApp.LoginRes>((resolve, reject) => {
    uni.login({
      provider: 'weixin',
      success: res => resolve(res),
      fail: err => reject(new Error(err)),
    })
  })
}

/**
 * 微信登录
 * @param params 微信登录参数，包含code
 * @returns Promise 包含登录结果
 */
export function wxLogin(data: { code: string }) {
  return http.post<IAuthLoginRes>('/auth/wxLogin', data)
}

// ==================== 同频圈鉴权 API（与原 frontend/src/services/auth.ts 对齐）====================

/** 发送短信验证码(无需鉴权) */
export function sendSmsCode(phone: string) {
  return http.post<void>('/api/auth/sms/send', { phone })
}

/** 邮箱+密码登录 */
export function loginByCredentials(email: string, password: string) {
  return http.post<AuthLoginResponse>('/api/auth/login/credentials', { email, password })
}

/** 手机号+验证码登录 */
export function loginByPhone(phone: string, code: string) {
  return http.post<AuthLoginResponse>('/api/auth/login/phone', { phone, code })
}

/** 微信小程序手机号快捷登录 */
export function loginByWechat(code: string, phoneCode: string) {
  return http.post<AuthLoginResponse>('/api/auth/wechat-miniprogram/login', { code, phoneCode })
}
