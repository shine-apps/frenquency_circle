import type { ActivityLevel, LocationPoint, PrivacySettings, UserRole } from '@/types'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fetchCurrentUser, fromUserDTO } from '@/api/auth'

/**
 * 前端用户信息模型(对应原 Taro 项目 store/user.ts 的 UserInfo)。
 * 手机号登录用户 email 形如 `13800138000@phonedomain.com`,phone 由 email 提取。
 */
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
  /** 用户已绑定的兴趣标签名称数组(默认空数组,存 hobby_tags.name) */
  tags: string[]
  // 以下字段用于兼容 unibest 模板的 IUserInfoRes 结构
  username?: string
  nickname?: string
  roles?: UserRole[]
  userId?: number
}

/** 初始化状态(未登录) */
const userInfoState: UserInfo = {
  id: '',
  name: '',
  email: '',
  role: 'USER',
  tags: [],
}

export const useUserStore = defineStore(
  'user',
  () => {
    /** 当前用户信息(未登录为空对象) */
    const userInfo = ref<UserInfo>({ ...userInfoState })

    /** 是否已登录(存在用户 id) */
    const isLoggedIn = computed(() => !!userInfo.value.id)

    /**
     * 将 UserInfo 同步为兼容模板的 IUserInfoRes 字段,
     * 避免模板页面(me.vue 等)读取 username/nickname 失败。
     */
    function normalizeUserInfo(user: UserInfo): UserInfo {
      return {
        ...user,
        username: user.username ?? user.email,
        nickname: user.nickname ?? user.name,
        roles: user.roles ?? (user.role ? [user.role] : []),
        userId: user.userId ?? 0,
      }
    }

    /** 设置用户信息(全量替换) */
    function setUserInfo(val: UserInfo) {
      // 若头像为空 则使用默认头像
      if (!val.avatar) {
        val.avatar = '/static/images/default-avatar.png'
      }
      userInfo.value = normalizeUserInfo({ ...userInfoState, ...val })
    }

    /** 设置用户头像 */
    function setUserAvatar(avatar: string) {
      userInfo.value.avatar = avatar
    }

    /** 删除用户信息 */
    function clearUserInfo() {
      userInfo.value = { ...userInfoState }
      uni.removeStorageSync('user')
    }

    /**
     * 从后端刷新当前用户信息。
     * - 走 `GET /api/auth/me`,返回 UserDTO
     * - 与模板的 getUserInfo(`/user/info`) 不同,文艺同频圈后端无该接口
     */
    async function fetchUserInfo() {
      const dto = await fetchCurrentUser()
      const patch = fromUserDTO(dto)
      updateUser(patch)
      return userInfo.value
    }

    /** 部分更新用户信息(自动持久化) */
    function updateUser(patch: Partial<UserInfo>) {
      const next = normalizeUserInfo({ ...userInfo.value, ...patch })
      userInfo.value = next
    }

    /** 设置兴趣标签名称列表 */
    function setTags(tags: string[]) {
      updateUser({ tags })
    }

    /** 设置隐私设置 */
    function setPrivacy(settings: PrivacySettings) {
      updateUser({ privacySettings: settings })
    }

    /** 部分更新业务字段(来自 UserProfile) */
    function setProfile(patch: Partial<Omit<UserInfo, 'id'>>) {
      updateUser(patch)
    }

    /** 设置当前位置与地址 */
    function setLocation(loc: LocationPoint | null, address?: string | null) {
      updateUser(address !== undefined ? { location: loc, address } : { location: loc })
    }

    /** 从存储恢复登录态(App 启动调用) */
    function hydrate() {
      try {
        const stored = uni.getStorageSync('user_info')
        if (stored && typeof stored === 'object') {
          const tags = Array.isArray(stored.tags) ? stored.tags : []
          userInfo.value = normalizeUserInfo({ ...userInfoState, ...stored, tags })
        }
      }
      catch {
        userInfo.value = { ...userInfoState }
      }
    }

    return {
      userInfo,
      isLoggedIn,
      setUserInfo,
      setUserAvatar,
      clearUserInfo,
      fetchUserInfo,
      updateUser,
      setTags,
      setPrivacy,
      setProfile,
      setLocation,
      hydrate,
    }
  },
  {
    persist: {
      key: 'user_info',
      paths: ['userInfo'],
    },
  },
)
