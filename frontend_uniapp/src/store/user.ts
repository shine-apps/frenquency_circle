import type { ActivityLevel, LocationPoint, PrivacySettings, UserDTO, UserGender, UserProfile, UserRole } from '@/types'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { fromUserDTO, getMyProfile } from '@/api/auth'

/**
 * 前端用户信息模型(对应原 Taro 项目 store/user.ts 的 UserInfo)。
 * 手机号登录用户 email 形如 `13800138000@phonedomain.com`,phone 由 email 提取。
 */
export interface UserInfo {
  id: string
  /** 昵称(手机号登录用户为手机号) */
  name: string
  email: string
  /** 用户角色:管理员 / 普通爱好者 / 老师 */
  role: UserRole
  /** 绑定手机号(从 email 提取或用户填写,可能为 null) */
  phone?: string | null
  /** 微信号(可空)。人-人联系链路中唯一可对外展示的联系方式 */
  wechat?: string | null
  /** 性别(可空,资料补全前为 null) */
  gender?: UserGender | null
  /** 生日(YYYY-MM-DD,可空) */
  birthday?: string | null
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
     * 初始化用户会话(仅登录成功、建立会话时调用)。
     * - 全量替换:以初始状态为底合并登录响应,清除上一会话/本地缓存的残留字段
     * - 乐观写入:先用登录响应中的基础信息填充,随后由 `fetchUserInfo` 补全完整资料
     * - 注意:刷新服务端资料请使用 `setProfile`,本方法会重置未传字段
     */
    function initUserSession(val: UserInfo) {
      // 不写入默认头像:avatar 始终与 avatarUrl 保持一致,
      // 无头像时由各页面 v-else 兜底展示昵称首字,避免登录瞬间"图片→文字"的跳变
      userInfo.value = { ...userInfoState, ...val }
    }

    /** 删除用户信息 */
    function clearUserInfo() {
      userInfo.value = { ...userInfoState }
      uni.removeStorageSync('user')
    }

    /**
     * 从后端刷新当前用户信息。
     * - 走 `GET /api/auth/me`,返回完整 UserProfile
     */
    async function fetchUserInfo() {
      const dto = await getMyProfile()
      setProfile(dto)
      return userInfo.value
    }

    /**
     * 底层局部合并(仅 store 内部使用)。
     * 对外更新一律走语义化 setter,保证 DTO 映射与字段同步集中在一处处理。
     */
    function mergeUserInfo(patch: Partial<UserInfo>) {
      userInfo.value = { ...userInfo.value, ...patch }
    }

    /** 设置兴趣标签名称列表 */
    function setTags(tags: string[]) {
      mergeUserInfo({ tags })
    }

    /** 设置隐私设置 */
    function setPrivacy(settings: PrivacySettings) {
      mergeUserInfo({ privacySettings: settings })
    }

    /**
     * 用后端最新用户资料刷新本地 store(服务端资料更新的唯一入口)。
     * - 入参为后端原始 DTO / Profile,内部统一经 `fromUserDTO` 映射,
     *   保证 avatar / avatarUrl 等字段同步,UI 不会停留旧值
     * - 与 `initUserSession` 的分工:本方法为局部合并,只更新后端返回的字段,
     *   不会重置未传字段;登录建立会话请使用 `initUserSession`
     * - 不再对外暴露任意字段的 merge 入口,避免调用方绕过映射造成字段不同步
     */
    function setProfile(dto: UserDTO | UserProfile) {
      mergeUserInfo(fromUserDTO(dto))
    }

    /** 设置当前位置与地址 */
    function setLocation(loc: LocationPoint | null, address?: string | null) {
      mergeUserInfo(address !== undefined ? { location: loc, address } : { location: loc })
    }

    /** 从存储恢复登录态(App 启动调用) */
    function hydrate() {
      try {
        const stored = uni.getStorageSync('user_info')
        if (stored && typeof stored === 'object') {
          const tags = Array.isArray(stored.tags) ? stored.tags : []
          userInfo.value = { ...userInfoState, ...stored, tags }
        }
      }
      catch {
        userInfo.value = { ...userInfoState }
      }
    }

    return {
      userInfo,
      isLoggedIn,
      initUserSession,
      clearUserInfo,
      fetchUserInfo,
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
