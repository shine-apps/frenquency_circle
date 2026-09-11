import type { AuthLoginResponse, ISingleTokenRes } from '@/api/types/login'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  loginByCredentials as _loginByCredentials,
  loginByPhone as _loginByPhone,
  loginByWechat as _loginByWechat,
  logout as _logout,
  sendSmsCode as _sendSmsCode,
  getWxCode,
} from '@/api/login'
import { toUserInfo } from '@/api/auth'
import { restoreGuestProfile } from '@/utils/guest-profile'
import { useUserStore } from './user'
import type { UserInfo } from './user'

/**
 * 后端未下发 `expiresIn` 时的兜底有效期(秒)。
 * 与 admin 的 `AUTH_SESSION_MAX_AGE_SECONDS` 默认值(30 天)保持一致，
 * 避免回退到错误时长导致「token 其实有效却被前端判定过期」。
 */
const DEFAULT_TOKEN_EXPIRES_IN = 30 * 24 * 60 * 60

/**
 * 登录态 store(单 token 模式)。
 *
 * 后端为单 token + JWT(见 admin 的 `authConfig.session`),不存在 refresh token，
 * 因此这里只维护：token 本身、本地过期时间、是否已登录。
 * token 过期后由 `http.ts` 的 401 分支清理登录态并跳登录页。
 */
export const useTokenStore = defineStore(
  'token',
  () => {
    const tokenInfo = ref<ISingleTokenRes>({ token: '', expiresIn: 0 })

    // 添加一个时间戳 ref 作为响应式依赖
    const nowTime = ref(Date.now())

    /**
     * 更新响应式数据:now
     * 确保 isTokenExpired 重新计算,而不是用错误过期缓存值
     * 可 useTokenStore 内部适时调用;也可链式调用:tokenStore.updateNowTime().hasLogin
     * @returns 最新的 tokenStore 实例
     */
    const updateNowTime = () => {
      nowTime.value = Date.now()
      return useTokenStore()
    }

    /** 设置 token 并记录本地过期时间 */
    const setTokenInfo = (val: ISingleTokenRes) => {
      updateNowTime()
      tokenInfo.value = val
      uni.setStorageSync('accessTokenExpireTime', Date.now() + val.expiresIn * 1000)
    }

    /** 判断 token 是否过期(无 token 或已过期均为 true) */
    const isTokenExpired = computed(() => {
      if (!tokenInfo.value.token) {
        return true
      }
      const expireTime = uni.getStorageSync('accessTokenExpireTime')
      if (!expireTime) {
        return true
      }
      return nowTime.value >= expireTime
    })

    /**
     * 退出登录 并 删除用户信息
     */
    const logout = async () => {
      try {
        await _logout()
      }
      catch (error) {
        console.error('退出登录失败:', error)
      }
      finally {
        updateNowTime()
        // 无论成功失败，都需要清除本地登录态
        uni.removeStorageSync('accessTokenExpireTime')
        tokenInfo.value = { token: '', expiresIn: 0 }
        useUserStore().clearUserInfo()
      }
    }

    // ==================== 趣邻圈业务登录 ====================

    /** 发送短信验证码 */
    async function sendSmsCode(phone: string) {
      return _sendSmsCode(phone)
    }

    /**
     * 登录成功后统一处理:设置 token + 拉取用户信息。
     * 趣邻圈后端返回 `{ token, user, expiresIn }`,单 token 模式。
     */
    async function handleLoginSuccess(res: AuthLoginResponse) {
      // 有效期以后端下发为准(与 authConfig.session.maxAge 同源);
      // 旧后端未返回时回退 DEFAULT_TOKEN_EXPIRES_IN，避免 NaN 导致「永不过期」
      setTokenInfo({
        token: res.token,
        expiresIn: res.expiresIn ?? DEFAULT_TOKEN_EXPIRES_IN,
      })
      const userStore = useUserStore()
      // 先写基础用户信息(登录响应),再异步拉取完整资料
      userStore.initUserSession(toUserInfo(res.user) as UserInfo)
      await userStore.fetchUserInfo()
      // 未登录时暂存的兴趣/位置,登录成功后尝试回填到账号
      // (内部无缓存时直接返回,失败静默,不阻断登录流程)
      await restoreGuestProfile()
      uni.showToast({
        title: '登录成功',
        icon: 'success',
      })
      return res
    }

    /** 手机号+验证码登录 */
    async function loginByPhone(phone: string, code: string) {
      try {
        const res = await _loginByPhone(phone, code)
        return await handleLoginSuccess(res)
      }
      catch (error) {
        console.error('手机号登录失败:', error)
        throw error
      }
      finally {
        updateNowTime()
      }
    }

    /** 邮箱+密码登录 */
    async function loginByCredentials(email: string, password: string) {
      try {
        const res = await _loginByCredentials(email, password)
        return await handleLoginSuccess(res)
      }
      catch (error) {
        console.error('邮箱密码登录失败:', error)
        throw error
      }
      finally {
        updateNowTime()
      }
    }

    /**
     * 微信小程序手机号授权登录(登录页「手机号一键登录」按钮)。
     * 登录成功后服务端会自动把该微信绑定到账号。
     * @param phoneCode 微信 getPhoneNumber 回调返回的 code
     */
    async function loginByWechat(phoneCode: string) {
      try {
        // 先调 uni.login 拿 js_code,再连同 phoneCode 送后端
        const code = await getWxCode()
        const res = await _loginByWechat(code.code, phoneCode)
        return await handleLoginSuccess(res)
      }
      catch (error) {
        console.error('微信登录失败:', error)
        throw error
      }
      finally {
        updateNowTime()
      }
    }

    /**
     * 微信静默登录(登录页进入时自动尝试,不需要用户点击)。
     *
     * 仅当该微信已绑定账号时才会成功；未绑定/其它失败一律抛错且不弹错误提示，
     * 由调用方 catch 后静默忽略，保持登录页正常可用。
     */
    async function loginByWechatSilent() {
      try {
        const code = await getWxCode()
        const res = await _loginByWechat(code.code, undefined, { silent: true })
        return await handleLoginSuccess(res)
      }
      catch (error) {
        // 静默场景不打扰用户：仅开发期日志，不做 toast
        console.warn('微信静默登录未成功(可能未绑定微信):', error)
        throw error
      }
      finally {
        updateNowTime()
      }
    }

    /**
     * 获取有效的 token(过期返回空串)。
     * 既支持 computed 读取,也建议链式调用:tokenStore.updateNowTime().validToken
     */
    const getValidToken = computed(() => {
      return isTokenExpired.value ? '' : tokenInfo.value.token
    })

    /** 检查是否已登录且 token 有效 */
    const hasValidLogin = computed(() => {
      return !!tokenInfo.value.token && !isTokenExpired.value
    })

    return {
      // 核心API方法
      logout,

      // 趣邻圈业务登录
      sendSmsCode,
      loginByPhone,
      loginByCredentials,
      loginByWechat,
      loginByWechatSilent,

      // 认证状态判断（最常用的）
      hasLogin: hasValidLogin,

      // 内部系统使用的方法
      updateNowTime,
      validToken: getValidToken,

      // 调试或特殊场景可能需要直接访问的信息
      tokenInfo,
    }
  },
  {
    // 添加持久化配置，确保刷新页面后token信息不丢失
    persist: true,
  },
)
