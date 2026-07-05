import { create } from 'zustand'
import Taro from '@tarojs/taro'

const TOKEN_KEY = 'auth_token'
const USER_KEY = 'user_info'

export interface UserInfo {
  id: string
  /** 昵称(手机号登录用户为手机号) */
  name: string
  email: string
  /** 用户角色:管理员 / 普通爱好者 / 传承人(老师) */
  role: UserRole
  /** 绑定手机号(从 email 提取或用户填写,可能为 null) */
  phone?: string | null
  /** 头像 URL(可选,用于 Avatar 组件展示) */
  avatar?: string
  /** 头像 URL(后端原字段,profile 页回填用) */
  avatarUrl?: string
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
  /** 用户已绑定的兴趣标签列表(默认空数组) */
  tags: TagDTO[]
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
  /** 设置兴趣标签列表 */
  setTags: (tags: TagDTO[]) => void
  /** 设置隐私设置 */
  setPrivacy: (settings: PrivacySettings) => void
  /** 部分更新业务字段(来自 UserProfile) */
  setProfile: (patch: Partial<UserProfile>) => void
  /** 设置当前位置与地址 */
  setLocation: (loc: LocationPoint | null, address?: string | null) => void
  /** 从存储恢复登录态(App 启动调用) */
  hydrate: () => void
}

/**
 * 同步读取本地存储的登录态。
 * 兼容旧版本存储:若 user 缺少 `tags` 字段,默认补空数组。
 */
function readStoredAuth(): {
  token: string | null
  user: UserInfo | null
} {
  try {
    const token = Taro.getStorageSync(TOKEN_KEY) || null
    const user = Taro.getStorageSync(USER_KEY) || null
    if (user && !Array.isArray(user.tags)) {
      user.tags = []
    }
    return { token, user }
  } catch {
    return { token: null, user: null }
  }
}

/**
 * 全局用户态 Store。
 * 初始状态从 Taro 同步存储恢复,避免首屏闪烁。
 */
export const useUserStore = create<UserState>((set, get) => {
  const stored = readStoredAuth()
  return {
    user: stored.user,
    token: stored.token,
    isLoggedIn: !!stored.token,

    login: (payload) => {
      // 兼容性:登录响应不含 tags,调用方传空数组;此处兜底补齐
      const user: UserInfo = {
        ...payload.user,
        tags: Array.isArray(payload.user.tags) ? payload.user.tags : [],
      }
      Taro.setStorageSync(TOKEN_KEY, payload.token)
      Taro.setStorageSync(USER_KEY, user)
      set({
        token: payload.token,
        user,
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

    setTags: (tags) => get().updateUser({ tags }),

    setPrivacy: (settings) => get().updateUser({ privacySettings: settings }),

    // 从 UserProfile 部分提取与 UserInfo 重叠的业务字段并更新
    setProfile: (patch) => {
      const update: Partial<UserInfo> = {}
      if (patch.name !== undefined) update.name = patch.name
      if (patch.email !== undefined) update.email = patch.email
      if (patch.role !== undefined) update.role = patch.role
      if (patch.avatarUrl !== undefined) {
        // UserInfo.avatarUrl 是 string | undefined;UserProfile.avatarUrl 是 string | null
        update.avatarUrl = patch.avatarUrl ?? undefined
        // avatar 字段沿用旧语义(头像展示),与 fromUserDTO 保持一致
        update.avatar = patch.avatarUrl ?? undefined
      }
      if (patch.phone !== undefined) update.phone = patch.phone
      if (patch.practiceYears !== undefined) update.practiceYears = patch.practiceYears
      if (patch.activityLevel !== undefined) update.activityLevel = patch.activityLevel
      if (patch.privacySettings !== undefined) update.privacySettings = patch.privacySettings
      if (patch.location !== undefined) update.location = patch.location
      if (patch.address !== undefined) update.address = patch.address
      if (Array.isArray(patch.tags)) update.tags = patch.tags
      get().updateUser(update)
    },

    setLocation: (loc, address) =>
      get().updateUser(
        address !== undefined ? { location: loc, address } : { location: loc }
      ),

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
