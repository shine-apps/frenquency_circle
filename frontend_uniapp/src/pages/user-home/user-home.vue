<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app'
import { getActivities } from '@/api/activities'
import { getFollowedCircles, getUserCircles } from '@/api/circles'
import { getCourses } from '@/api/courses'
import { getUserProfile } from '@/api/search'
import {
  acceptContactRequest,
  cancelContactRequest,
  createContactRequest,
  followUser,
  getFollowedUsers,
  rejectContactRequest,
  unfollowUser,
} from '@/api/users'
import { toLoginPage } from '@/utils/toLoginPage'
import { activityLevelShortText, formatDate, formatDateTime, practiceYearsText } from '@/utils/format'
import { canPublish } from '@/utils/role'
import { useUserStore } from '@/store/user'
import { useSettingsStore } from '@/store/settings'
import { useShare } from '@/composables/useShare'
import type { HttpError } from '@/http/types'
import type { ActivityDTO, CircleDTO, FollowedCircleDTO, FollowedUserDTO, PublicCourseDTO, PublicUserProfileDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '用户主页',
  },
  excludeLoginPath: true,
})

/** 标签展示最大数量 */
const MAX_TAG_VISIBLE = 5

/** 打招呼留言最大长度 */
const MESSAGE_MAX = 100

const userStore = useUserStore()
const settingsStore = useSettingsStore()

/** 应用发布维护中(isAppDeploying 为 true):隐藏「视频课程」tab(课程入口统一口径) */
const isAppDeploying = computed(() => settingsStore.isAppDeploying)

const userId = ref('')
const profile = ref<PublicUserProfileDTO | null>(null)
const loading = ref(true)
const notFound = ref(false)

/** 是否查看自己的主页(自己主页不展示联系/关注操作条) */
const isSelf = computed(() => !!profile.value && profile.value.id === userStore.userInfo.id)

// ====== 分享(小程序好友/朋友圈 + H5 微信 JSSDK;内容实时读取,兼容异步加载) ======
const { share, shareAppMessage, shareTimeline } = useShare({
  title: () => (profile.value ? `${profile.value.name}的主页｜趣邻圈` : '趣邻圈'),
  path: '/pages/user-home/user-home',
  query: () => (profile.value ? { id: profile.value.id } : {}),
  imageUrl: () => profile.value?.avatarUrl ?? '',
  desc: () => {
    const p = profile.value
    if (!p)
      return ''
    const tagText = p.tags.slice(0, 4).join('、')
    return tagText ? `在趣邻圈,TA 的兴趣是:${tagText}` : `在趣邻圈认识 ${p.name}`
  },
})

// 分享钩子必须在页面顶层直接注册, 编译器才能生成微信小程序 Page 配置
// #ifdef MP-WEIXIN
onShareAppMessage(shareAppMessage)
onShareTimeline(shareTimeline)
// #endif

/** 拉取用户公开资料 */
async function fetchProfile(id: string) {
  if (!id) {
    notFound.value = true
    loading.value = false
    return
  }
  loading.value = true
  try {
    const data = await getUserProfile(id)
    profile.value = data
    notFound.value = false
    // 资料到位后并行拉取内容区块,不阻塞资料展示
    void fetchProfileContent(data)
  }
  catch (e) {
    const err = e as HttpError
    // 未登录访问(后端 401):引导登录而非展示"用户不存在"的迷惑态
    if (err.statusCode === 401) {
      notFound.value = false
      toLoginPage()
    }
    else {
      console.warn('[UserHome] fetch error:', err?.message)
      notFound.value = true
    }
  }
  finally {
    loading.value = false
  }
}

onLoad((options) => {
  userId.value = (options as any)?.id || ''
})

/** 每次展示都重拉(从请求列表 accept/reject 返回后状态需刷新) */
onShow(() => {
  // 同步系统设置(命中 10 分钟缓存时无网络开销),保证维护开关变化即时生效
  void settingsStore.getSettings().catch(() => { /* 拉取失败沿用旧值 */ })
  fetchProfile(userId.value)
})

// ====== 主页内容区块(TA 的关注:圈子 / 趣友;TA 的发布:圈子 / 活动 / 视频课程) ======
/** 区块预览条数 */
const PREVIEW_SIZE = 3
/** 「查看全部」时一次性拉取的条数 */
const EXPANDED_SIZE = 50

/** 列表区块状态 */
interface ContentSection<T> {
  list: T[]
  total: number
  loading: boolean
  /** 是否已成功拉取过一次(tab 懒加载判据):加载过且未换人时不重复请求 */
  loaded: boolean
}

function createSection<T>(): ContentSection<T> {
  return { list: [], total: 0, loading: false, loaded: false }
}

/** TA 关注的圈子 */
const followedSection = ref<ContentSection<FollowedCircleDTO>>(createSection())
/** TA 关注的趣友(关注的人) */
const followedUsersSection = ref<ContentSection<FollowedUserDTO>>(createSection())
/** TA 发布的圈子(仅老师 / 管理员主页展示) */
const publishedCirclesSection = ref<ContentSection<CircleDTO>>(createSection())
/** TA 发布的活动(仅老师 / 管理员主页展示) */
const publishedActivitiesSection = ref<ContentSection<ActivityDTO>>(createSection())
/** TA 发布的视频课程(仅老师 / 管理员主页展示) */
const publishedCoursesSection = ref<ContentSection<PublicCourseDTO>>(createSection())

/** 各区块是否已展开全部(展开后隐藏入口) */
const followedExpanded = ref(false)
const followedUsersExpanded = ref(false)
const publishedCirclesExpanded = ref(false)
const publishedActivitiesExpanded = ref(false)
const publishedCoursesExpanded = ref(false)

/** 关注内容 tab:圈子 / 趣友(关注的人) */
type FollowTab = 'circles' | 'users'

/** 关注内容 tab 定义(按需懒加载:首次点开某个 tab 时才请求该类数据) */
const FOLLOW_TABS: { key: FollowTab, label: string }[] = [
  { key: 'circles', label: '关注的圈子' },
  { key: 'users', label: '关注的趣友' },
]

/** 当前选中的关注内容 tab */
const activeFollowTab = ref<FollowTab>('circles')

/** 当前关注 tab 的条目总数(右上角数量提示) */
const activeFollowedTotal = computed(() => (
  activeFollowTab.value === 'circles'
    ? followedSection.value.total
    : followedUsersSection.value.total
))

/** 当前关注 tab 的数量量词(趣友用「位」,圈子用「个」) */
const activeFollowedUnit = computed(() => (activeFollowTab.value === 'users' ? '位' : '个'))

/** 是否展示「TA 的发布」:任意用户均可发布(维护期隐藏,与创建入口口径一致) */
const showPublished = computed(() => canPublish(profile.value?.role))

/** 发布内容 tab:圈子 / 活动 / 视频课程 */
type PublishTab = 'circles' | 'activities' | 'courses'

/** 发布内容 tab 定义(按需懒加载:首次点开某个 tab 时才请求该类数据;维护期隐藏「视频课程」) */
const PUBLISH_TABS = computed<{ key: PublishTab, label: string }[]>(() => {
  const tabs: { key: PublishTab, label: string }[] = [
    { key: 'circles', label: '圈子' },
    { key: 'activities', label: '活动' },
  ]
  if (!isAppDeploying.value)
    tabs.push({ key: 'courses', label: '视频课程' })
  return tabs
})

/** 当前选中的发布内容 tab */
const activePublishTab = ref<PublishTab>('circles')

// 维护期开启时,若当前停留在「视频课程」tab,切回「圈子」,避免停留在已隐藏的 tab
watch(isAppDeploying, (deploying) => {
  if (deploying && activePublishTab.value === 'courses')
    activePublishTab.value = 'circles'
})

/** 当前 tab 的条目总数(右上角数量提示) */
const activePublishedTotal = computed(() => {
  switch (activePublishTab.value) {
    case 'circles':
      return publishedCirclesSection.value.total
    case 'activities':
      return publishedActivitiesSection.value.total
    default:
      return publishedCoursesSection.value.total
  }
})

/** 当前 tab 的数量量词(课程用「门」,圈子 / 活动用「个」) */
const activePublishUnit = computed(() => (activePublishTab.value === 'courses' ? '门' : '个'))

/** 主页归属人称:自己的主页用「我」,他人主页用「TA」 */
const ownerLabel = computed(() => (isSelf.value ? '我' : 'TA'))

/**
 * 拉取指定用户关注的圈子;失败静默,不干扰资料展示。
 * @returns 是否拉取成功,供「查看全部」判断能否收起入口
 */
async function loadFollowedCircles(userId: string, expand = false): Promise<boolean> {
  followedSection.value.loading = true
  try {
    const res = await getFollowedCircles({
      userId,
      page: 1,
      pageSize: expand ? EXPANDED_SIZE : PREVIEW_SIZE,
    })
    followedSection.value.list = res.list
    followedSection.value.total = res.total
    followedSection.value.loaded = true
    return true
  }
  catch (e) {
    console.warn('[UserHome] followed circles error:', (e as Error)?.message)
    return false
  }
  finally {
    followedSection.value.loading = false
  }
}

/**
 * 拉取指定用户关注的趣友(关注的人)。
 * @returns 是否拉取成功
 */
async function loadFollowedUsers(userId: string, expand = false): Promise<boolean> {
  followedUsersSection.value.loading = true
  try {
    const res = await getFollowedUsers({
      userId,
      page: 1,
      pageSize: expand ? EXPANDED_SIZE : PREVIEW_SIZE,
    })
    followedUsersSection.value.list = res.list
    followedUsersSection.value.total = res.total
    followedUsersSection.value.loaded = true
    return true
  }
  catch (e) {
    console.warn('[UserHome] followed users error:', (e as Error)?.message)
    return false
  }
  finally {
    followedUsersSection.value.loading = false
  }
}

/**
 * 拉取指定用户发布的圈子(仅 active)。
 * @returns 是否拉取成功
 */
async function loadPublishedCircles(userId: string, expand = false): Promise<boolean> {
  publishedCirclesSection.value.loading = true
  try {
    const res = await getUserCircles(userId, {
      page: 1,
      pageSize: expand ? EXPANDED_SIZE : PREVIEW_SIZE,
    })
    publishedCirclesSection.value.list = res.list
    publishedCirclesSection.value.total = res.total
    publishedCirclesSection.value.loaded = true
    return true
  }
  catch (e) {
    console.warn('[UserHome] published circles error:', (e as Error)?.message)
    return false
  }
  finally {
    publishedCirclesSection.value.loading = false
  }
}

/**
 * 拉取指定用户发布的活动(仅 active)。
 * @returns 是否拉取成功
 */
async function loadPublishedActivities(userId: string, expand = false): Promise<boolean> {
  publishedActivitiesSection.value.loading = true
  try {
    const res = await getActivities({
      creatorId: userId,
      page: 1,
      pageSize: expand ? EXPANDED_SIZE : PREVIEW_SIZE,
    })
    publishedActivitiesSection.value.list = res.list
    publishedActivitiesSection.value.total = res.total
    publishedActivitiesSection.value.loaded = true
    return true
  }
  catch (e) {
    console.warn('[UserHome] published activities error:', (e as Error)?.message)
    return false
  }
  finally {
    publishedActivitiesSection.value.loading = false
  }
}

/**
 * 拉取指定用户发布的视频课程(仅已上线)。
 * @returns 是否拉取成功
 */
async function loadPublishedCourses(userId: string, expand = false): Promise<boolean> {
  publishedCoursesSection.value.loading = true
  try {
    const res = await getCourses({
      creatorId: userId,
      page: 1,
      pageSize: expand ? EXPANDED_SIZE : PREVIEW_SIZE,
    })
    publishedCoursesSection.value.list = res.list
    publishedCoursesSection.value.total = res.total
    publishedCoursesSection.value.loaded = true
    return true
  }
  catch (e) {
    console.warn('[UserHome] published courses error:', (e as Error)?.message)
    return false
  }
  finally {
    publishedCoursesSection.value.loading = false
  }
}

/** 上一次拉取内容区块的用户 id:变化时复位展开态,并清空关注 / 发布内容的缓存(当前 tab 会重新拉取) */
let contentUserId = ''

/**
 * 确保当前关注 tab 的内容已加载:未加载过才发起请求,已加载过直接复用缓存。
 * @returns 是否可用(命中缓存同样返回 true)
 */
function ensureActiveFollowedLoaded(userId: string): Promise<boolean> {
  if (activeFollowTab.value === 'circles') {
    // 已加载或正在加载中都不重复发起(避免快速切 tab 造成同一接口重复请求)
    if (followedSection.value.loaded || followedSection.value.loading)
      return Promise.resolve(true)
    return loadFollowedCircles(userId)
  }
  if (followedUsersSection.value.loaded || followedUsersSection.value.loading)
    return Promise.resolve(true)
  return loadFollowedUsers(userId)
}

/**
 * 切换关注内容 tab:首次点开某个 tab 时才拉取对应数据,已加载过的 tab 直接用缓存。
 * 数据加载失败时不置 `loaded`,下次切回该 tab 会自动重试。
 */
function handleFollowTabChange(tab: FollowTab) {
  if (activeFollowTab.value === tab)
    return
  activeFollowTab.value = tab
  const profileId = profile.value?.id
  if (!profileId)
    return
  void ensureActiveFollowedLoaded(profileId)
}

/**
 * 确保当前 tab 的发布内容已加载:未加载过才发起请求,已加载过直接复用缓存。
 * @returns 是否可用(命中缓存同样返回 true)
 */
function ensureActivePublishedLoaded(userId: string): Promise<boolean> {
  switch (activePublishTab.value) {
    case 'circles':
      // 已加载或正在加载中都不重复发起(避免快速切 tab 造成同一接口重复请求)
      if (publishedCirclesSection.value.loaded || publishedCirclesSection.value.loading)
        return Promise.resolve(true)
      return loadPublishedCircles(userId)
    case 'activities':
      if (publishedActivitiesSection.value.loaded || publishedActivitiesSection.value.loading)
        return Promise.resolve(true)
      return loadPublishedActivities(userId)
    default:
      if (publishedCoursesSection.value.loaded || publishedCoursesSection.value.loading)
        return Promise.resolve(true)
      return loadPublishedCourses(userId)
  }
}

/**
 * 切换发布内容 tab:首次点开某个 tab 时才拉取对应数据,已加载过的 tab 直接用缓存。
 * 数据加载失败时不置 `loaded`,下次切回该 tab 会自动重试。
 */
function handlePublishTabChange(tab: PublishTab) {
  if (activePublishTab.value === tab)
    return
  activePublishTab.value = tab
  const profileId = profile.value?.id
  if (!profileId || !canPublish(profile.value?.role))
    return
  void ensureActivePublishedLoaded(profileId)
}

/**
 * 拉取主页内容区块。
 * 「TA 的关注」「TA 的发布」均按 tab 懒加载:进入主页只加载各自的当前 tab,
 * 其余 tab 首次点开时才请求。
 * 仅当查看对象变化时复位展开态与缓存,避免从详情页返回(onShow 重拉)后折叠已展开的列表、重复请求。
 */
function fetchProfileContent(p: PublicUserProfileDTO) {
  const switched = contentUserId !== p.id
  contentUserId = p.id
  if (switched) {
    followedExpanded.value = false
    followedUsersExpanded.value = false
    publishedCirclesExpanded.value = false
    publishedActivitiesExpanded.value = false
    publishedCoursesExpanded.value = false
    // 换人:清空上一个用户缓存的关注 / 发布内容,当前 tab 重新拉取
    followedSection.value = createSection()
    followedUsersSection.value = createSection()
    publishedCirclesSection.value = createSection()
    publishedActivitiesSection.value = createSection()
    publishedCoursesSection.value = createSection()
  }

  const tasks: Promise<boolean>[] = [
    // 只加载当前 tab 对应的关注内容,另一个 tab 首次点开时再拉
    ensureActiveFollowedLoaded(p.id),
  ]
  if (canPublish(p.role)) {
    // 只加载当前 tab 对应的发布内容,其余 tab 首次点开时再拉
    tasks.push(ensureActivePublishedLoaded(p.id))
  }
  else {
    publishedCirclesSection.value = createSection()
    publishedActivitiesSection.value = createSection()
    publishedCoursesSection.value = createSection()
  }
  return Promise.all(tasks)
}

/** 展开「TA 关注的圈子」全部(拉取成功才收起入口,失败保留入口以便重试) */
async function handleExpandFollowed() {
  if (!profile.value || followedExpanded.value)
    return
  if (await loadFollowedCircles(profile.value.id, true))
    followedExpanded.value = true
}

/** 展开「TA 关注的趣友」全部(失败可重试) */
async function handleExpandFollowedUsers() {
  if (!profile.value || followedUsersExpanded.value)
    return
  if (await loadFollowedUsers(profile.value.id, true))
    followedUsersExpanded.value = true
}

/** 展开「TA 发布的圈子」全部(失败可重试) */
async function handleExpandPublishedCircles() {
  if (!profile.value || publishedCirclesExpanded.value)
    return
  if (await loadPublishedCircles(profile.value.id, true))
    publishedCirclesExpanded.value = true
}

/** 展开「TA 发布的活动」全部(失败可重试) */
async function handleExpandPublishedActivities() {
  if (!profile.value || publishedActivitiesExpanded.value)
    return
  if (await loadPublishedActivities(profile.value.id, true))
    publishedActivitiesExpanded.value = true
}

/** 展开「TA 发布的视频课程」全部(失败可重试) */
async function handleExpandPublishedCourses() {
  if (!profile.value || publishedCoursesExpanded.value)
    return
  if (await loadPublishedCourses(profile.value.id, true))
    publishedCoursesExpanded.value = true
}

/** 跳圈子详情 */
function handleCircleClick(circleId: string) {
  uni.navigateTo({ url: `/pages/circle/circle?id=${circleId}` })
}

/** 跳趣友主页(TA 关注的人) */
function handleUserClick(userId: string) {
  uni.navigateTo({ url: `/pages/user-home/user-home?id=${userId}` })
}

/** 跳活动详情 */
function handleActivityClick(activityId: string) {
  uni.navigateTo({ url: `/pages/activity/activity?activityId=${activityId}` })
}

/** 跳视频课程详情(进入后可查看课时并播放) */
function handleCourseClick(courseId: string) {
  uni.navigateTo({ url: `/pages/course-detail/course-detail?id=${courseId}` })
}

// ====== 底部操作状态机 ======
type ActionState
  = | 'self'
    | 'not_provided'
    | 'can_request'
    | 'pending_sent'
    | 'pending_received'
    | 'accepted'

/** 依据 contact/relation 推导底部操作条状态 */
const actionState = computed<ActionState | null>(() => {
  if (!profile.value || isSelf.value)
    return isSelf.value ? 'self' : null
  const { contact, relation } = profile.value
  if (relation.contactStatus === 'accepted')
    return 'accepted'
  if (relation.contactStatus === 'pending_sent')
    return 'pending_sent'
  if (relation.contactStatus === 'pending_received')
    return 'pending_received'
  if (contact.reason === 'not_provided')
    return 'not_provided'
  // need_request / rejected(被拒后可再次发起)
  return 'can_request'
})

/** 操作进行中标记(按钮防重复点击) */
const acting = ref(false)

/** 未登录则引导登录 */
function ensureLogin(): boolean {
  if (userStore.isLoggedIn)
    return true
  toLoginPage()
  return false
}

// ====== 关注 / 取关 ======
async function handleToggleFollow() {
  if (!ensureLogin() || acting.value || !profile.value)
    return
  acting.value = true
  try {
    if (profile.value.relation.followed) {
      await unfollowUser(profile.value.id)
      profile.value.relation.followed = false
      uni.showToast({ title: '已取消关注', icon: 'none' })
    }
    else {
      await followUser(profile.value.id)
      profile.value.relation.followed = true
      uni.showToast({ title: '已关注', icon: 'none' })
    }
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '操作失败', icon: 'none' })
  }
  finally {
    acting.value = false
  }
}

// ====== 打招呼弹层 ======
const requestPopupVisible = ref(false)
const requestMessage = ref('')
/** 被拒绝后再次发起提示 */
const wasRejected = computed(() => profile.value?.relation.contactStatus === 'rejected')

function openRequestPopup() {
  if (!ensureLogin())
    return
  requestMessage.value = ''
  requestPopupVisible.value = true
}

/** 发送打招呼请求(空留言可直发) */
async function handleSendRequest() {
  if (acting.value || !profile.value)
    return
  acting.value = true
  try {
    const message = requestMessage.value.trim()
    await createContactRequest({
      toUserId: profile.value.id,
      ...(message ? { message } : {}),
    })
    requestPopupVisible.value = false
    uni.showToast({ title: '已发送,等待对方接受', icon: 'none' })
    await fetchProfile(userId.value)
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '发送失败', icon: 'none' })
  }
  finally {
    acting.value = false
  }
}

// ====== 撤回我发出的请求 ======
async function handleCancelRequest() {
  const requestId = profile.value?.relation.requestId
  if (!ensureLogin() || acting.value || !requestId)
    return
  acting.value = true
  try {
    await cancelContactRequest(requestId)
    uni.showToast({ title: '已撤回', icon: 'none' })
    await fetchProfile(userId.value)
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '撤回失败', icon: 'none' })
  }
  finally {
    acting.value = false
  }
}

// ====== 接受 / 拒绝收到的请求 ======
async function handleRespond(accept: boolean) {
  const requestId = profile.value?.relation.requestId
  if (!ensureLogin() || acting.value || !requestId)
    return
  acting.value = true
  try {
    if (accept)
      await acceptContactRequest(requestId)
    else
      await rejectContactRequest(requestId)
    uni.showToast({ title: accept ? '已接受,可查看对方微信号' : '已拒绝', icon: 'none' })
    await fetchProfile(userId.value)
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '操作失败', icon: 'none' })
  }
  finally {
    acting.value = false
  }
}

// ====== 联系方式展示(仅 accepted 态可见,公开设置不影响解锁) ======
/** 当前可展示/复制/拨打的联系方式(微信号优先,缺失时兜底手机号) */
const visibleContact = computed(() => {
  if (!profile.value)
    return { value: '', type: null as 'wechat' | 'phone' | null }
  const c = profile.value.contact
  const value = c.wechat ?? c.phone ?? ''
  const type = c.contactType ?? (c.wechat ? 'wechat' : c.phone ? 'phone' : null)
  return { value, type }
})

/** 复制联系方式 */
function copyContact() {
  const { value, type } = visibleContact.value
  if (!value)
    return
  uni.setClipboardData({
    data: value,
    success: () => uni.showToast({ title: type === 'phone' ? '手机号已复制' : '微信号已复制', icon: 'none' }),
  })
}

/** 拨打手机号(仅 phone 类型可用) */
function callPhone() {
  const { value, type } = visibleContact.value
  if (type !== 'phone' || !value)
    return
  uni.makePhoneCall({ phoneNumber: value })
}

// ====== 展示辅助 ======
function activityLevelColor(level: string): string {
  if (level === 'low')
    return '#f56c6c'
  if (level === 'medium')
    return '#e68a00'
  return '#018d71'
}

function renderTags(tags: string[]): { visible: string[], rest: number } {
  const visible = tags.slice(0, MAX_TAG_VISIBLE)
  return { visible, rest: tags.length - visible.length }
}
</script>

<template>
  <view class="flex flex-col">
    <!-- 加载态 -->
    <view v-if="loading" class="flex flex-1 flex-col items-center justify-center">
      <text class="text-sm text-[#999]">加载中...</text>
    </view>

    <!-- 不存在态 -->
    <view v-else-if="notFound || !profile" class="flex flex-1 flex-col items-center justify-center pb-20">
      <text class="text-[#ccc]" style="font-size: 56px;">😕</text>
      <text class="mt-3 text-sm text-[#999]">用户不存在或已注销</text>
    </view>

    <!-- 资料卡片 -->
    <template v-else>
      <!-- 头像与名称 -->
      <view class="relative bg-white px-5 pb-6 pt-10">
        <!-- 分享入口:小程序原生转发按钮 / H5 引导右上角分享 -->
        <view class="absolute right-4 top-9 z-10">
          <!-- #ifdef MP-WEIXIN -->
          <wd-button plain round size="small" open-type="share">
            分享
          </wd-button>
          <!-- #endif -->
          <!-- #ifdef H5 -->
          <wd-button plain round size="small" @click="share">
            分享
          </wd-button>
          <!-- #endif -->
        </view>
        <view class="flex flex-col items-center">
          <view class="h-20 w-20 flex items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1] shadow-sm">
            <image
              v-if="profile.avatarUrl"
              :src="profile.avatarUrl"
              class="h-full w-full"
              mode="aspectFill"
            />
            <text v-else class="text-3xl text-[#018d71] font-bold">
              {{ profile.name ? profile.name[0] : '?' }}
            </text>
          </view>
          <text class="mt-3 text-lg text-[#333] font-semibold">
            {{ profile.name }}
          </text>
        </view>
      </view>

      <!-- 信息块 -->
      <view class="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
        <!-- 活跃度 -->
        <view class="flex items-center justify-between border-b border-[#f5f5f5] pb-3.5">
          <text class="text-sm text-[#999]">活跃度</text>
          <text class="text-sm font-medium" :style="{ color: activityLevelColor(profile.activityLevel) }">
            {{ activityLevelShortText(profile.activityLevel) }}
          </text>
        </view>

        <!-- 练习年限 -->
        <view class="flex items-center justify-between border-b border-[#f5f5f5] py-3.5">
          <text class="text-sm text-[#999]">练习年限</text>
          <text class="text-sm text-[#333] font-medium">
            {{ practiceYearsText(profile.practiceYears, '未设置') }}
          </text>
        </view>

        <!-- 地址 -->
        <view class="flex items-center justify-between border-b border-[#f5f5f5] py-3.5">
          <text class="text-sm text-[#999]">所在地区</text>
          <text class="text-sm text-[#333]">
            {{ profile.address || '未设置' }}
          </text>
        </view>

        <!-- 加入时间 -->
        <view class="flex items-center justify-between pt-3.5">
          <text class="text-sm text-[#999]">加入时间</text>
          <text class="text-sm text-[#333]">
            {{ formatDate(profile.createdAt, '未知', '/') }}
          </text>
        </view>
      </view>

      <!-- 兴趣标签 -->
      <view v-if="profile.tags.length > 0" class="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
        <text class="mb-3 block text-sm text-[#333] font-medium">兴趣标签</text>
        <view class="flex flex-wrap gap-2.5">
          <text
            v-for="name in renderTags(profile.tags).visible"
            :key="name"
            class="rounded-full bg-[#e8f5f1] px-3.5 py-1.5 text-xs text-[#018d71]"
          >
            {{ name }}
          </text>
          <text
            v-if="renderTags(profile.tags).rest > 0"
            class="border border-[#e0e0e0] rounded-full bg-white px-3.5 py-1.5 text-xs text-[#999]"
          >
            +{{ renderTags(profile.tags).rest }}
          </text>
        </view>
      </view>

      <!-- ====== {{ ownerLabel }}的关注:圈子 / 趣友(所有用户可见) ====== -->
      <view class="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
        <view class="flex items-center justify-between">
          <text class="text-sm text-[#333] font-medium">
            {{ ownerLabel }}的关注
          </text>
          <text v-if="activeFollowedTotal > 0" class="text-xs text-[#999]">
            共 {{ activeFollowedTotal }} {{ activeFollowedUnit }}
          </text>
        </view>

        <!-- Tab 切换:关注的圈子 / 关注的趣友 -->
        <view class="mt-3 flex items-center gap-1 rounded-full bg-[#f5f7f6] p-1">
          <view
            v-for="tab in FOLLOW_TABS"
            :key="tab.key"
            class="flex-1 rounded-full py-1.5 text-center"
            :class="activeFollowTab === tab.key ? 'bg-white shadow-sm' : ''"
            @click="handleFollowTabChange(tab.key)"
          >
            <text
              class="text-xs"
              :class="activeFollowTab === tab.key ? 'text-[#018d71] font-medium' : 'text-[#666]'"
            >
              {{ tab.label }}
            </text>
          </view>
        </view>

        <!-- 关注的圈子 -->
        <template v-if="activeFollowTab === 'circles'">
          <view v-if="followedSection.loading" class="flex flex-col items-center py-4">
            <text class="text-xs text-[#999]">
              加载中...
            </text>
          </view>
          <view v-else-if="followedSection.list.length === 0" class="flex flex-col items-center py-4">
            <text class="text-xs text-[#999]">
              {{ ownerLabel }}还没有关注任何圈子
            </text>
          </view>
          <view v-else class="mt-3 flex flex-col gap-2.5">
            <view
              v-for="c in followedSection.list"
              :key="c.id"
              class="rounded-xl bg-[#f7f9f8] px-4 py-3 active:bg-[#eef4f2]"
              @click="handleCircleClick(c.id)"
            >
              <text class="block truncate text-sm text-[#333] font-medium">{{ c.title }}</text>
              <view class="mt-1 flex items-center justify-between gap-2">
                <text class="min-w-0 flex-1 truncate text-xs text-[#999]">{{ c.address }}</text>
                <text class="shrink-0 text-xs text-[#999]">关注于 {{ formatDate(c.followedAt) }}</text>
              </view>
            </view>
            <view
              v-if="!followedExpanded && followedSection.total > followedSection.list.length"
              class="flex items-center justify-center pt-1"
              @click="handleExpandFollowed"
            >
              <text class="text-xs text-[#018d71]">
                查看全部 {{ followedSection.total }} 个 ›
              </text>
            </view>
          </view>
        </template>

        <!-- 关注的趣友 -->
        <template v-else>
          <view v-if="followedUsersSection.loading" class="flex flex-col items-center py-4">
            <text class="text-xs text-[#999]">
              加载中...
            </text>
          </view>
          <view v-else-if="followedUsersSection.list.length === 0" class="flex flex-col items-center py-4">
            <text class="text-xs text-[#999]">
              {{ ownerLabel }}还没有关注任何趣友
            </text>
          </view>
          <view v-else class="mt-3 flex flex-col gap-2.5">
            <view
              v-for="u in followedUsersSection.list"
              :key="u.id"
              class="rounded-xl bg-[#f7f9f8] px-4 py-3 active:bg-[#eef4f2]"
              @click="handleUserClick(u.id)"
            >
              <view class="flex items-center gap-3">
                <view class="h-9 w-9 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1]">
                  <image v-if="u.avatarUrl" :src="u.avatarUrl" class="h-full w-full" mode="aspectFill" />
                  <text v-else class="text-sm text-[#018d71] font-medium">
                    {{ u.name ? u.name[0] : '?' }}
                  </text>
                </view>
                <view class="min-w-0 flex-1">
                  <view class="flex items-center justify-between gap-2">
                    <text class="truncate text-sm text-[#333] font-medium">{{ u.name }}</text>
                    <text class="shrink-0 text-xs text-[#999]">{{ activityLevelShortText(u.activityLevel) }}</text>
                  </view>
                  <text class="mt-0.5 block text-xs text-[#999]">
                    关注于 {{ formatDate(u.followedAt) }}
                  </text>
                </view>
              </view>
            </view>
            <view
              v-if="!followedUsersExpanded && followedUsersSection.total > followedUsersSection.list.length"
              class="flex items-center justify-center pt-1"
              @click="handleExpandFollowedUsers"
            >
              <text class="text-xs text-[#018d71]">
                查看全部 {{ followedUsersSection.total }} 位 ›
              </text>
            </view>
          </view>
        </template>
      </view>

      <!-- ====== {{ ownerLabel }}的发布:圈子 / 活动 / 视频课程(任意用户的已上线内容) ====== -->
      <view v-if="showPublished" class="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
        <view class="flex items-center justify-between">
          <text class="text-sm text-[#333] font-medium">
            {{ ownerLabel }}的发布
          </text>
          <text v-if="activePublishedTotal > 0" class="text-xs text-[#999]">
            共 {{ activePublishedTotal }} {{ activePublishUnit }}
          </text>
        </view>

        <!-- Tab 切换:三类发布内容共用一个卡片,切换只切视图,不重复请求 -->
        <view class="mt-3 flex items-center gap-1 rounded-full bg-[#f5f7f6] p-1">
          <view
            v-for="tab in PUBLISH_TABS"
            :key="tab.key"
            class="flex-1 rounded-full py-1.5 text-center"
            :class="activePublishTab === tab.key ? 'bg-white shadow-sm' : ''"
            @click="handlePublishTabChange(tab.key)"
          >
            <text
              class="text-xs"
              :class="activePublishTab === tab.key ? 'text-[#018d71] font-medium' : 'text-[#666]'"
            >
              {{ tab.label }}
            </text>
          </view>
        </view>

        <!-- 圈子 -->
        <template v-if="activePublishTab === 'circles'">
          <view v-if="publishedCirclesSection.loading" class="flex flex-col items-center py-4">
            <text class="text-xs text-[#999]">
              加载中...
            </text>
          </view>
          <view v-else-if="publishedCirclesSection.list.length === 0" class="flex flex-col items-center py-4">
            <text class="text-xs text-[#999]">
              {{ ownerLabel }}还没有发布过圈子
            </text>
          </view>
          <view v-else class="mt-3 flex flex-col gap-2.5">
            <view
              v-for="c in publishedCirclesSection.list"
              :key="c.id"
              class="rounded-xl bg-[#f7f9f8] px-4 py-3 active:bg-[#eef4f2]"
              @click="handleCircleClick(c.id)"
            >
              <text class="block truncate text-sm text-[#333] font-medium">{{ c.title }}</text>
              <view class="mt-1 flex items-center justify-between gap-2">
                <text class="min-w-0 flex-1 truncate text-xs text-[#999]">{{ c.address }}</text>
                <text class="shrink-0 text-xs text-[#999]">创建于 {{ formatDate(c.createdAt) }}</text>
              </view>
            </view>
            <view
              v-if="!publishedCirclesExpanded && publishedCirclesSection.total > publishedCirclesSection.list.length"
              class="flex items-center justify-center pt-1"
              @click="handleExpandPublishedCircles"
            >
              <text class="text-xs text-[#018d71]">
                查看全部 {{ publishedCirclesSection.total }} 个 ›
              </text>
            </view>
          </view>
        </template>

        <!-- 活动 -->
        <template v-else-if="activePublishTab === 'activities'">
          <view v-if="publishedActivitiesSection.loading" class="flex flex-col items-center py-4">
            <text class="text-xs text-[#999]">
              加载中...
            </text>
          </view>
          <view v-else-if="publishedActivitiesSection.list.length === 0" class="flex flex-col items-center py-4">
            <text class="text-xs text-[#999]">
              {{ ownerLabel }}还没有发布过活动
            </text>
          </view>
          <view v-else class="mt-3 flex flex-col gap-2.5">
            <view
              v-for="a in publishedActivitiesSection.list"
              :key="a.id"
              class="rounded-xl bg-[#f7f9f8] px-4 py-3 active:bg-[#eef4f2]"
              @click="handleActivityClick(a.id)"
            >
              <text class="block truncate text-sm text-[#333] font-medium">{{ a.title }}</text>
              <view class="mt-1 flex items-center justify-between gap-2">
                <text class="min-w-0 flex-1 truncate text-xs text-[#999]">
                  报名截止 {{ formatDateTime(a.registrationDeadline) }}
                </text>
                <text class="shrink-0 text-xs text-[#999]">起始 {{ formatDateTime(a.startTime) }}</text>
              </view>
            </view>
            <view
              v-if="!publishedActivitiesExpanded && publishedActivitiesSection.total > publishedActivitiesSection.list.length"
              class="flex items-center justify-center pt-1"
              @click="handleExpandPublishedActivities"
            >
              <text class="text-xs text-[#018d71]">
                查看全部 {{ publishedActivitiesSection.total }} 个 ›
              </text>
            </view>
          </view>
        </template>

        <!-- 视频课程 -->
        <template v-else>
          <view v-if="publishedCoursesSection.loading" class="flex flex-col items-center py-4">
            <text class="text-xs text-[#999]">
              加载中...
            </text>
          </view>
          <view v-else-if="publishedCoursesSection.list.length === 0" class="flex flex-col items-center py-4">
            <text class="text-xs text-[#999]">
              {{ ownerLabel }}还没有发布过视频课程
            </text>
          </view>
          <view v-else class="mt-3 flex flex-col gap-2.5">
            <view
              v-for="c in publishedCoursesSection.list"
              :key="c.id"
              class="rounded-xl bg-[#f7f9f8] px-4 py-3 active:bg-[#eef4f2]"
              @click="handleCourseClick(c.id)"
            >
              <text class="block truncate text-sm text-[#333] font-medium">{{ c.title }}</text>
              <view class="mt-1 flex items-center justify-between gap-2">
                <text class="min-w-0 flex-1 truncate text-xs text-[#999]">
                  {{ c.lessonCount }} 课时
                </text>
                <text class="shrink-0 text-xs text-[#999]">更新于 {{ formatDate(c.updatedAt) }}</text>
              </view>
            </view>
            <view
              v-if="!publishedCoursesExpanded && publishedCoursesSection.total > publishedCoursesSection.list.length"
              class="flex items-center justify-center pt-1"
              @click="handleExpandPublishedCourses"
            >
              <text class="text-xs text-[#018d71]">
                查看全部 {{ publishedCoursesSection.total }} 门 ›
              </text>
            </view>
          </view>
        </template>
      </view>

      <!-- 底部操作条占位 -->
      <view v-if="!isSelf" class="pb-32" />

      <!-- ====== 固定底部联系操作条 ====== -->
      <view
        v-if="!isSelf"
        class="fixed bottom-0 left-0 right-0 z-10 border-t border-[#f0f0f0] bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3"
      >
        <!-- 未填微信号 -->
        <template v-if="actionState === 'not_provided'">
          <view class="flex items-center gap-3">
            <view class="h-11 flex flex-1 items-center justify-center rounded-full bg-[#f5f6f7]">
              <text class="text-sm text-[#999]">对方暂未开放联系方式</text>
            </view>
            <button
              class="h-11 w-24 shrink-0 rounded-full text-sm leading-[44px]"
              :class="profile.relation.followed ? 'border border-[#018d71] bg-white text-[#018d71]' : 'bg-[#e8f5f1] text-[#018d71]'"
              @click="handleToggleFollow"
            >
              {{ profile.relation.followed ? '已关注' : '关注' }}
            </button>
          </view>
        </template>

        <!-- 可发起打招呼(need_request / rejected) -->
        <template v-else-if="actionState === 'can_request'">
          <text v-if="wasRejected" class="mb-2 block text-xs text-[#e68a00]">
            对方婉拒了本次请求,可附上自我介绍再次发起
          </text>
          <view class="flex items-center gap-3">
            <button
              class="h-11 flex-1 rounded-full from-[#018d71] to-[#0aa07f] bg-gradient-to-br text-sm text-white leading-[44px] active:scale-95"
              @click="openRequestPopup"
            >
              打个招呼
            </button>
            <button
              class="h-11 w-24 shrink-0 rounded-full text-sm leading-[44px]"
              :class="profile.relation.followed ? 'border border-[#018d71] bg-white text-[#018d71]' : 'bg-[#e8f5f1] text-[#018d71]'"
              @click="handleToggleFollow"
            >
              {{ profile.relation.followed ? '已关注' : '关注' }}
            </button>
          </view>
        </template>

        <!-- 我发出的待处理 -->
        <template v-else-if="actionState === 'pending_sent'">
          <view class="flex items-center gap-3">
            <view class="h-11 flex flex-1 items-center justify-center rounded-full bg-[#f5f6f7]">
              <text class="text-sm text-[#999]">已发送请求,等待对方接受</text>
            </view>
            <button
              class="h-11 w-24 shrink-0 border border-[#e0e0e0] rounded-full bg-white text-sm text-[#666] leading-[44px] active:scale-95"
              @click="handleCancelRequest"
            >
              撤回
            </button>
          </view>
        </template>

        <!-- 我收到的待处理 -->
        <template v-else-if="actionState === 'pending_received'">
          <view class="flex items-center gap-3">
            <button
              class="h-11 flex-1 border border-[#e0e0e0] rounded-full bg-white text-sm text-[#666] leading-[44px] active:scale-95"
              @click="handleRespond(false)"
            >
              拒绝
            </button>
            <button
              class="h-11 flex-1 rounded-full from-[#018d71] to-[#0aa07f] bg-gradient-to-br text-sm text-white leading-[44px] active:scale-95"
              @click="handleRespond(true)"
            >
              接受
            </button>
          </view>
        </template>

        <!-- 已建立联系:展示联系方式(微信/手机号) + 复制/拨打 -->
        <template v-else-if="actionState === 'accepted'">
          <view class="flex items-center gap-3">
            <view class="h-11 flex flex-1 items-center justify-between rounded-full bg-[#f5f6f7] px-4">
              <text class="min-w-0 flex-1 truncate text-sm text-[#333]">
                {{ visibleContact.type === 'phone' ? '手机号:' : '微信号:' }}{{ visibleContact.value || '对方未填写' }}
              </text>
            </view>
            <button
              v-if="visibleContact.value"
              class="h-11 w-24 shrink-0 rounded-full bg-[#e8f5f1] text-sm text-[#018d71] leading-[44px] active:scale-95"
              @click="copyContact"
            >
              复制
            </button>
            <button
              v-if="visibleContact.type === 'phone'"
              class="h-11 w-24 shrink-0 rounded-full from-[#018d71] to-[#0aa07f] bg-gradient-to-br text-sm text-white leading-[44px] active:scale-95"
              @click="callPhone"
            >
              拨打
            </button>
          </view>
        </template>
      </view>
    </template>

    <!-- 打招呼留言弹层 -->
    <wd-popup
      v-model="requestPopupVisible"
      position="bottom"
      round
      :modal="true"
      close-on-click-modal
    >
      <view class="px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-6">
        <text class="block text-center text-base text-[#333] font-semibold">
          向 {{ profile?.name }} 打个招呼
        </text>
        <text class="mt-1 block text-center text-xs text-[#999]">
          说一句自我介绍,更容易被接受;对方同意后你们将互相看到微信号
        </text>

        <view class="mt-5 rounded-2xl bg-[#f5f6f7] px-4 py-3">
          <textarea
            v-model="requestMessage"
            class="h-24 w-full text-sm text-[#333]"
            :maxlength="MESSAGE_MAX"
            placeholder="如:你好,我也在练陈氏太极拳,想约周末一起晨练"
            :disabled="acting"
          />
          <view class="mt-1 text-right">
            <text class="text-xs text-[#999]">{{ requestMessage.length }}/{{ MESSAGE_MAX }}</text>
          </view>
        </view>

        <view class="mt-5 flex gap-3">
          <wd-button
            class="flex-1 border border-[#e5e5e5]! bg-white! text-[#666]!"
            round
            size="medium"
            variant="plain"
            @click="requestPopupVisible = false"
          >
            取消
          </wd-button>
          <wd-button
            class="flex-1 border-0 from-[#018d71] to-[#0aa07f] bg-gradient-to-br shadow-[0_6px_18px_rgba(1,141,113,0.28)] text-white!"
            round
            size="medium"
            :loading="acting"
            @click="handleSendRequest"
          >
            发送请求
          </wd-button>
        </view>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
