import type { AuthLoginResponse } from './types/login'
import { http } from '@/http/http'

/**
 * 退出登录
 */
export function logout() {
  return http.post<void>('/api/auth/logout')
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

// ==================== 趣邻圈鉴权 API ====================

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

/**
 * 微信小程序登录(单接口双模式)。
 *
 * - 不传 `phoneCode`：微信静默登录。要求该微信已绑定账号；未绑定后端返回 400
 *   「未绑定微信」，静默场景请传 `options.silent = true` 以避免自动错误提示。
 * - 传 `phoneCode`：手机号授权登录（getPhoneNumber 回调返回的 code），
 *   登录成功后服务端自动把该微信绑定到账号。
 *
 * @param code `wx.login()` 返回的 js_code
 * @param phoneCode getPhoneNumber 回调返回的 phone_code（静默登录时不传）
 * @param options.silent 为 true 时隐藏 http 层自动错误 toast（静默登录用）
 */
export function loginByWechat(
  code: string,
  phoneCode?: string,
  options?: { silent?: boolean },
) {
  return http.post<AuthLoginResponse>(
    '/api/auth/wechat-miniprogram/login',
    phoneCode ? { code, phoneCode } : { code },
    undefined,
    undefined,
    options?.silent ? { hideErrorToast: true } : undefined,
  )
}
