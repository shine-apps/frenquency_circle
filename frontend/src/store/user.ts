import { create } from 'zustand'
import Taro from '@tarojs/taro'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'user_info'

export interface UserInfo {
  id: string
  /** 昵称(手机号登录用户为手机号) */
  name: string
  email: string
  role: string
  /** 绑定手机号(从 email 提取,可能为空) */
  phone?: string
  /** 头像 URL(可选) */
  avatar?: string
}

interface UserState {
  /** 当前用户信息(未登录为 null) */
  user: UserInfo | null
  /** JWT token(未登录为 null) */
  token: string | null
  /** 是否已登录(派生自 token) */
  isLoggedIn: boolean
  /** 登录:持久化 token + user 到存储并更新 store */
  login: (payload: { token: string; user: UserInfo }) => void
  /** 登出:清除存储并重置 store */
  logout: () => void
  /** 部分更新用户信息 */
  updateUser: (patch: Partial<UserInfo>) => void
  /** 从存储恢复登录态(App 启动调用) */
  hydrate: () => void
}

/** 同步读取本地存储的登录态 */
function readStoredAuth(): {
  token: string | null
  user: UserInfo | null
} {
  try {
    const token = Taro.getStorageSync(TOKEN_KEY) || null
    const user = Taro.getStorageSync(USER_KEY) || null
    return { token, user }
  } catch {
    return { token: null, user: null }
  }
}

/**
 * 全局用户态 Store。
 * 初始状态从 Taro 同步存储恢复,避免首屏闪烁。
 */
export const useUserStore = create<UserState>((set) => {
  const stored = readStoredAuth()
  return {
    user: stored.user,
    token: stored.token,
    isLoggedIn: !!stored.token,

    login: (payload) => {
      Taro.setStorageSync(TOKEN_KEY, payload.token)
      Taro.setStorageSync(USER_KEY, payload.user)
      set({
        token: payload.token,
        user: payload.user,
        isLoggedIn: true,
      })
    },

    logout: () => {
      Taro.removeStorageSync(TOKEN_KEY)
      Taro.removeStorageSync(USER_KEY)
      set({ token: null, user: null, isLoggedIn: false })
    },

    updateUser: (patch) =>
      set((state) => {
        if (!state.user) return {}
        const next = { ...state.user, ...patch }
        Taro.setStorageSync(USER_KEY, next)
        return { user: next }
      }),

    hydrate: () => {
      const s = readStoredAuth()
      set({
        token: s.token,
        user: s.user,
        isLoggedIn: !!s.token,
      })
    },
  }
})
