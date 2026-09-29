<script lang="ts" setup>
import type { Ref } from 'vue'
import { computed, ref, watch } from 'vue'
import { onReachBottom, onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { useMatchStore } from '@/store/match'
import { useSettingsStore } from '@/store/settings'
import { getMyProfile, updateMyTags, updateProfile } from '@/api/auth'
import { matchCircles, matchPeople } from '@/api/locations'
import { getUnreadNotificationCount } from '@/api/notifications'
import { LOGIN_PAGE } from '@/router/config'
import { useDialog } from '@wot-ui/ui/components/wd-dialog'
import { getCurrentLocation } from '@/utils/location'
import { reverseGeocode } from '@/utils/geo'
import { saveGuestLocation, saveGuestTags } from '@/utils/guest-profile'
import { closeHomeMbtiEntry, isHomeMbtiEntryClosed } from '@/utils/home-mbti-entry'
import { activityLevelText, formatDateTime, formatDistance } from '@/utils/format'
import { useShare } from '@/composables/useShare'
import MatchFilterBar from '@/components/MatchFilterBar/MatchFilterBar.vue'
import ProfileSetupPopup from '@/components/ProfileSetupPopup/ProfileSetupPopup.vue'
import type { UpdateProfileInput } from '@/api/types/login'
import type { MatchCircleDTO, MatchPersonDTO, Paginated } from '@/types'

definePage({
  layout: 'default',
  // 首页:自动匹配主界面
  type: 'home',
  style: {
    navigationBarTitleText: '趣邻圈',
    navigationStyle: 'custom',
    // 距底部 100px 提前触发触底加载,减少列表加载等待
    onReachBottomDistance: 100,
  },
  excludeLoginPath: true,
})

/** 标签展示最大数量 */
const MAX_TAG_VISIBLE = 3

/** 匹配结果子 Tab:同趣的人 / 同趣的圈子 */
type MatchTab = 'person' | 'circle'

const userStore = useUserStore()
const matchStore = useMatchStore()
const settingsStore = useSettingsStore()
const dialog = useDialog()

// 首页分享(右上角菜单:好友/朋友圈)
const { shareAppMessage, shareTimeline } = useShare({
  title: '趣邻圈',
  path: '/pages/index/index',
  desc: ' 选择兴趣,遇见附近同趣的人与圈子'
})

// 分享钩子必须在页面顶层直接注册, 编译器才能生成微信小程序 Page 配置
// #ifdef MP-WEIXIN
onShareAppMessage(shareAppMessage)
onShareTimeline(shareTimeline)
// #endif

const user = computed(() => userStore.userInfo)

/** 账号兴趣标签(用户资料中的标签,首页未手动筛选时作为默认筛选条件) */
const accountTags = computed(() => user.value?.tags || [])

// ====== 首页筛选条件(仅用于本次匹配;账号资料为空时会被回填,见 fillAccountProfileFromMatch) ======
/**
 * 首页手动选择的兴趣标签:
 * - null:尚未在首页选择,跟随账号标签展示与匹配;
 * - string[]:已在首页选择,仅作为本次匹配的筛选条件;
 *   账号标签为空时由 fillAccountProfileFromMatch 回填到账号。
 */
const filterTags = ref<string[] | null>(null)

/** 当前生效的筛选标签(首页手动选择优先,否则跟随账号标签) */
const effectiveTags = computed(() => filterTags.value ?? accountTags.value)

// ====== 资料补全引导 ======
/**
 * 已登录且昵称为纯数字(手机号登录的默认昵称)时,在页面底部弹出补全弹窗。
 * 弹窗是独立浮层:不读写首页匹配数据、不触发跳转,仅更新用户资料;
 * 保存成功或用户主动关闭后,本页生命周期内不再自动弹出,避免反复打扰。
 */
const needProfileSetup = computed(
  () => userStore.isLoggedIn && /^\d+$/.test(userStore.userInfo?.name ?? ''),
)

const profileSetupVisible = ref(false)
/** 本页生命周期内是否已处理(保存成功 / 主动关闭) */
let profileSetupSettled = false

/** 满足条件时打开补全弹窗(幂等) */
function maybeOpenProfileSetup(): void {
  if (profileSetupSettled || profileSetupVisible.value || !needProfileSetup.value)
    return
  profileSetupVisible.value = true
}

/** 保存成功:关闭弹窗(用户信息已由组件同步 store) */
function handleProfileSetupSuccess(): void {
  profileSetupSettled = true
  profileSetupVisible.value = false
  uni.showToast({ title: '资料已完善', icon: 'success' })
}

/** 主动关闭:本次不再弹出 */
function handleProfileSetupCancel(): void {
  profileSetupSettled = true
  profileSetupVisible.value = false
}

// 用户资料可能晚于页面挂载才从本地存储恢复,变化后补弹一次
watch(needProfileSetup, (need) => {
  if (need)
    maybeOpenProfileSetup()
})

/** 当前坐标与地址(优先 store/match → user → 默认空) */
const latitude = ref<number | null>(matchStore.location?.latitude ?? user.value?.location?.latitude ?? null)
const longitude = ref<number | null>(matchStore.location?.longitude ?? user.value?.location?.longitude ?? null)
const address = ref<string>(user.value?.address || '')

/**
 * 本次会话用户是否在首页手动选过位置。
 * 手动选择优先:置位后不再被账号资料默认地址覆盖,登录完成时重置。
 */
let locationPicked = false

/**
 * 已登录且账号已设置位置时,用账号资料的坐标/地址回填首页默认位置。
 * - 仅更新首页筛选状态,不写入账号资料;
 * - 返回是否发生实际变化,调用方据此决定是否重新匹配(避免重复请求)。
 */
function applyAccountLocation(): boolean {
  const loc = user.value?.location
  if (!userStore.isLoggedIn || loc?.latitude == null || loc?.longitude == null)
    return false
  const nextAddress = user.value?.address || ''
  const changed = latitude.value !== loc.latitude
    || longitude.value !== loc.longitude
    || address.value !== nextAddress
  latitude.value = loc.latitude
  longitude.value = loc.longitude
  address.value = nextAddress
  return changed
}

/**
 * 登录完成(未登录 → 已登录):首页筛选恢复为账号资料默认值。
 * - 兴趣标签:重置为跟随账号标签(filterTags = null),登录前的手动筛选不再保留;
 * - 位置:清除手动标记,回到首页时由 onShow 用账号地址回填。
 */
watch(() => userStore.isLoggedIn, (loggedIn) => {
  if (!loggedIn)
    return
  filterTags.value = null
  locationPicked = false
})

const rangeKm = ref<number>(5)
/** 分页大小 */
const PAGE_SIZE = 20
/** 当前展示的匹配子 Tab(同趣的人 / 同趣的圈子) */
const activeTab = ref<MatchTab>('person')

/** 兴趣/位置完备性 */
const locationReady = computed(() => latitude.value != null && longitude.value != null)
/** 匹配就绪:仅需位置;兴趣可选,未选择时按距离/活跃度推荐 */
const ready = computed(() => locationReady.value)

/**
 * 创建单个子 Tab 的分页列表状态(人/圈子各自独立,切换 Tab 不清空对方已加载数据)。
 * @param fetcher 具体匹配接口(坐标/标签/范围读取页面当前筛选状态)
 * @param onFirstPage 第一页加载成功回调(同步 match store / 回填账号资料)
 */
function createMatchPagedList<T>(
  fetcher: (params: { page: number, pageSize: number }) => Promise<Paginated<T>>,
  onFirstPage?: (list: T[], total: number) => void,
) {
  const list = ref<T[]>([]) as Ref<T[]>
  const loading = ref(false)
  const finished = ref(false)
  let page = 1
  /** 请求序号:筛选条件变化后自增,丢弃过期响应 */
  let seq = 0

  /** 拉取列表;reset=true 时回到第一页 */
  async function fetchList(reset = false): Promise<void> {
    if (loading.value || !ready.value)
      return
    if (reset) {
      page = 1
      finished.value = false
    }
    const requestSeq = ++seq
    loading.value = true
    try {
      const res = await fetcher({ page, pageSize: PAGE_SIZE })
      if (requestSeq !== seq)
        return // 已有更新的请求(筛选变化重置),丢弃本次结果
      list.value = reset ? res.list : [...list.value, ...res.list]
      page += 1
      // total 统计口径可能与 list 略有偏差,同时以「不足一页」兜底判定到底
      if (list.value.length >= res.total || res.list.length < PAGE_SIZE)
        finished.value = true
      if (reset)
        onFirstPage?.(list.value, res.total)
    }
    catch (e) {
      if (requestSeq !== seq)
        return
      console.error('[index] match list load failed:', e)
      uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
    }
    finally {
      if (requestSeq === seq)
        loading.value = false
    }
  }

  /** 清空状态(筛选条件变化后两个 Tab 缓存一并失效,切换时再懒加载) */
  function resetState(): void {
    seq += 1 // 使进行中的请求过期
    list.value = []
    loading.value = false
    finished.value = false
    page = 1
  }

  return { list, loading, finished, fetchList, resetState }
}

/** 同趣的人分页状态(第一页成功后同步 match store 并尝试回填账号资料) */
const peopleState = createMatchPagedList<MatchPersonDTO>(
  ({ page, pageSize }) => matchPeople({
    latitude: latitude.value!,
    longitude: longitude.value!,
    tags: effectiveTags.value,
    rangeKm: rangeKm.value,
    page,
    pageSize,
  }),
  (people, total) => {
    matchStore.setMatchResult({
      people,
      totalPeople: total,
      rangeKm: rangeKm.value,
      location: { latitude: latitude.value!, longitude: longitude.value! },
      tags: effectiveTags.value,
    })
    void fillAccountProfileFromMatch()
  },
)

/** 同趣的圈子分页状态 */
const circleState = createMatchPagedList<MatchCircleDTO>(
  ({ page, pageSize }) => matchCircles({
    latitude: latitude.value!,
    longitude: longitude.value!,
    tags: effectiveTags.value,
    rangeKm: rangeKm.value,
    page,
    pageSize,
  }),
  (circles, total) => {
    matchStore.setMatchResult({
      circles,
      totalCircles: total,
      rangeKm: rangeKm.value,
      location: { latitude: latitude.value!, longitude: longitude.value! },
      tags: effectiveTags.value,
    })
    void fillAccountProfileFromMatch()
  },
)

// 模板内直接使用(顶层 ref 自动解包)
const peopleItems = peopleState.list
const peopleLoading = peopleState.loading
const peopleFinished = peopleState.finished
const circleItems = circleState.list
const circleLoading = circleState.loading
const circleFinished = circleState.finished

/** 拉取当前 Tab 的列表(reset=true 回到第一页) */
function fetchActiveTab(reset = false): Promise<void> {
  return activeTab.value === 'person'
    ? peopleState.fetchList(reset)
    : circleState.fetchList(reset)
}

/**
 * 筛选条件(兴趣/位置/范围)变化后的整体重载:
 * 清空两个 Tab 的缓存并拉取当前 Tab 第一页,另一个 Tab 切换时再懒加载。
 */
function reloadMatch(): void {
  peopleState.resetState()
  circleState.resetState()
  void fetchActiveTab(true)
}

/** 触底加载当前 Tab 下一页 */
onReachBottom(() => {
  const state = activeTab.value === 'person' ? peopleState : circleState
  if (state.finished.value || state.loading.value)
    return
  void state.fetchList()
})

// 切换 Tab:目标 Tab 尚未加载过(无数据且未到底)时才拉取,已加载的复用缓存
watch(activeTab, (tab) => {
  const state = tab === 'person' ? peopleState : circleState
  if (state.list.value.length === 0 && !state.finished.value && !state.loading.value)
    void state.fetchList(true)
})

// ====== 账号资料补全(用当前匹配回填为空字段) ======
/** 位置占位文案:未拿到真实地址时不作为账号地址写入 */
const ADDRESS_PLACEHOLDER = '已定位'

/** 是否正在回填账号资料(避免并发重复提交) */
let profileFilling = false

/**
 * 已登录时,把当前匹配使用的兴趣标签 / 地址回填到账号资料。
 * - 逐字段独立判断:兴趣标签、地址、坐标任一为空且当前匹配侧有值时补全该字段,
 *   已有值的字段绝不覆盖(地址与坐标由后端分别更新,缺哪个补哪个);
 * - 是否为空以服务端资料为准(getMyProfile),避免本地缓存陈旧导致误覆盖;
 * - 兴趣:账号无标签且本次匹配带了标签时写入(接口限制 1-10 项,超出截断);
 * - 地址:账号无地址时写入首页展示的真实地址;账号无坐标时写入本次匹配坐标;
 * - 失败静默:资料补全失败不影响首页匹配主流程。
 */
async function fillAccountProfileFromMatch(): Promise<void> {
  if (!userStore.isLoggedIn || profileFilling)
    return
  const matchTags = matchStore.tags
  const loc = matchStore.location
  const matchAddress = address.value.trim()
  const hasRealAddress = matchAddress !== '' && matchAddress !== ADDRESS_PLACEHOLDER
  // 本地预判:仅当账号侧字段为空且当前匹配侧有值时才需要请求服务端确认
  const canFillTags = accountTags.value.length === 0 && matchTags.length > 0
  const canFillAddress = !user.value?.address && hasRealAddress
  const canFillCoords = !user.value?.location && loc != null
  if (!canFillTags && !canFillAddress && !canFillCoords)
    return

  profileFilling = true
  try {
    const profile = await getMyProfile()
    userStore.setProfile(profile)

    // 兴趣:仅当服务端也未设置且本次匹配带了标签时写入
    if (canFillTags && !(Array.isArray(profile.tags) && profile.tags.length > 0)) {
      const saved = await updateMyTags(matchTags.slice(0, 10))
      userStore.setTags(saved)
    }

    // 地址 / 坐标:服务端侧为空的字段才写入,已有值的字段保留
    const patch: UpdateProfileInput = {}
    if (canFillAddress && !profile.address)
      patch.address = matchAddress
    if (canFillCoords && loc && !profile.location) {
      patch.latitude = loc.latitude
      patch.longitude = loc.longitude
    }
    if (Object.keys(patch).length > 0)
      userStore.setProfile(await updateProfile(patch))
  }
  catch (e) {
    console.warn('[index] fill account profile from match failed:', e)
  }
  finally {
    profileFilling = false
  }
}

// ====== 进入时尝试定位 ======
onShow(() => {
  // 消费来源页(MBTI 等)带入的兴趣筛选:写入本次筛选条件,由下方逻辑触发按该兴趣重新匹配
  const incomingTags = matchStore.consumePendingTags()
  if (incomingTags)
    filterTags.value = incomingTags
  // 每次回到首页同步一次系统设置(命中 10 分钟缓存时无网络开销),避免冷启动竞态与 TTL 内不更新
  void settingsStore.getSettings().catch(() => { /* 拉取失败沿用旧值 */ })
  // 每次回到首页刷新未读消息角标(从通知页返回后也能同步)
  void fetchUnreadCount()
  // 昵称为纯数字时引导完善资料(不影响下方定位/匹配流程)
  maybeOpenProfileSetup()
  // 已登录且未手动选过位置:默认填写账号资料的地址(登录 / 资料页更新后同步)
  if (!locationPicked && applyAccountLocation()) {
    reloadMatch()
    return
  }
  // 同步 store 与 user 中已有的位置(可能在 profile 页刚被更新)
  if (!latitude.value || !longitude.value) {
    if (user.value?.location?.latitude && user.value?.location?.longitude) {
      latitude.value = user.value.location.latitude
      longitude.value = user.value.location.longitude
      address.value = user.value.address || ''
      reloadMatch()
      return
    }
    // 尝试自动定位(失败时由 LocationSetter 引导手动选择)
    getCurrentLocation()
      .then((res) => {
        latitude.value = res.latitude
        longitude.value = res.longitude
        reloadMatch()
        // getCurrentLocation 仅返回坐标,地址由各端逆地理编码补全
        // (H5 走高德 JS API,小程序/其他端走后端 /api/geo/reverse)
        reverseGeocode(res.latitude, res.longitude).then((addr) => {
          address.value = addr || ADDRESS_PLACEHOLDER
          // 拿到真实地址后再尝试回填账号资料(占位文案不写入)
          if (addr)
            void fillAccountProfileFromMatch()
        })
      })
      .catch((err) => {
        console.warn('[index] getCurrentLocation failed:', err?.message || err)
      })
  }
  else {
    // 生效筛选标签变化(如账号标签在资料页更新)时整体重载;否则仅当前 Tab 无数据且未到底时拉取,避免重复请求
    const matchedTagsKey = matchStore.tags.join(',')
    const effectiveTagsKey = effectiveTags.value.join(',')
    if (matchedTagsKey !== effectiveTagsKey) {
      reloadMatch()
    }
    else {
      const state = activeTab.value === 'person' ? peopleState : circleState
      if (state.list.value.length === 0 && !state.finished.value && !state.loading.value)
        void state.fetchList(true)
    }
  }
})

/**
 * 兴趣标签确认:作为本次匹配的筛选条件。
 * - 已登录:账号标签为空时由 fillAccountProfileFromMatch 回填到账号,已有标签则不写入;
 * - 未登录:更新本地状态并暂存 storage,登录成功后由 restoreGuestProfile 回填到账号。
 */
function handleTagsConfirmed(tags: string[]): void {
  filterTags.value = tags
  if (!userStore.isLoggedIn) {
    userStore.setTags(tags)
    saveGuestTags(tags)
  }
  if (latitude.value != null && longitude.value != null) {
    reloadMatch()
  }
}

/**
 * 清除首页全部兴趣标签:仅清空本次匹配的筛选条件。
 * - 不调用 saveGuestTags:清除结果不写入本地暂存,不参与登录后回填;
 * - 清除后当前匹配标签为空,fillAccountProfileFromMatch 不会回填账号(空值不写入);
 * - 清空后按距离展示附近的人与圈子(匹配请求不带 tags)。
 */
function handleClearTags(): void {
  filterTags.value = []
  if (latitude.value != null && longitude.value != null) {
    reloadMatch()
  }
}

/** 跳创建圈子页(任意登录用户均可创建,未登录由页面内登录守卫拦截) */
function handleCreateCircle(): void {
  uni.navigateTo({ url: '/pages/create-circle/create-circle' })
}

/** 跳创建活动页(任意登录用户均可发布,未登录由页面内登录守卫拦截) */
function handleCreateActivity(): void {
  uni.navigateTo({ url: '/pages/create-activity/create-activity' })
}

/** 跳通知消息页 */
function handleGoNotification(): void {
  uni.navigateTo({ url: '/pages/notifications/notifications' })
}

/** 跳 MBTI 介绍页(反向导流:测完人格可就势用推荐兴趣匹配同趣的人与圈子;页面在 mbti_subpages 分包内) */
function handleGoMbti(): void {
  uni.navigateTo({ url: '/mbti_subpages/intro/intro' })
}

/** 首页 MBTI 入口是否可见(用户可关闭,关闭后设备维度不再展示) */
const mbtiEntryVisible = ref(!isHomeMbtiEntryClosed())

/** 关闭首页 MBTI 入口:仅隐藏该区块,不影响页面其他内容 */
function handleCloseMbtiEntry(): void {
  mbtiEntryVisible.value = false
  closeHomeMbtiEntry()
}

// ====== 未读消息角标 ======
/** 未读消息数量(>0 时通知按钮显示角标) */
const unreadCount = ref(0)

/** 拉取未读消息数(失败静默,不影响其他功能) */
async function fetchUnreadCount(): Promise<void> {
  if (!userStore.isLoggedIn) {
    unreadCount.value = 0
    return
  }
  try {
    const res = await getUnreadNotificationCount()
    unreadCount.value = res.count ?? 0
  }
  catch {
    // 静默:角标获取失败不影响首页主流程
  }
}

// ====== 右下角浮动按钮 ======
/** 系统设置 isAppDeploying 为 true 时(应用发布维护中)隐藏浮动按钮,直接读取 store 计算属性 */
const isAppDeploying = computed(() => settingsStore.isAppDeploying)
/** fab 展开状态 */
const fabActive = ref(false)
/** fab 距底部偏移:避开 tabbar(50px) + 安全区 + 呼吸间距 */
const fabGap = computed(() => {
  const safeBottom = uni.getSystemInfoSync().safeAreaInsets?.bottom ?? 0
  return { right: 16, bottom: 50 + safeBottom + 12 }
})

/** 点击 fab 菜单项:先收起再执行跳转 */
function handleFabAction(action: () => void): void {
  fabActive.value = false
  action()
}

/** 范围切换 */
function handleRangeChange(range: number): void {
  if (range === rangeKm.value)
    return
  rangeKm.value = range
  if (ready.value) {
    reloadMatch()
  }
}

/**
 * LocationSetter 选点完成:作为本次匹配的筛选条件,本次会话内以手动选择优先。
 * - 已登录:账号未设置位置/地址时由 fillAccountProfileFromMatch 回填到账号,已有则不写入;
 * - 未登录:更新本地状态并暂存 storage,登录成功后由 restoreGuestProfile 回填到账号。
 */
function handleLocationUpdated(loc: { latitude: number, longitude: number, address: string }): void {
  // 用户手动选择位置:本次会话优先,不再被账号资料默认地址覆盖
  locationPicked = true
  // 先更新本地坐标/地址,让 UI 立即回显(仅本次会话有效)
  latitude.value = loc.latitude
  longitude.value = loc.longitude
  address.value = loc.address

  if (!userStore.isLoggedIn) {
    userStore.setLocation(
      { latitude: loc.latitude, longitude: loc.longitude },
      loc.address,
    )
    saveGuestLocation(loc)
  }

  reloadMatch()
}

/** 点击人卡片:已登录则跳转到对方个人主页,未登录提示先登录 */
function handlePersonClick(person: { userId: string | number } | null | undefined): void {
  if (!person?.userId) {
    uni.showToast({ title: '用户数据异常', icon: 'none' })
    return
  }
  if (!userStore.isLoggedIn) {
    dialog.confirm({
      title: '需要登录',
      msg: '查看同趣的人需要先登录,是否前往登录页?',
      confirmButtonText: '去登录',
      cancelButtonText: '取消',
    }).then((res) => {
      if (res.action === 'confirm')
        uni.navigateTo({ url: LOGIN_PAGE })
    })
    return
  }
  uni.navigateTo({ url: `/pages/user-home/user-home?id=${person.userId}` })
}

/** 点击圈子卡片:跳圈子详情 */
function handleCircleClick(circleId: string): void {
  uni.navigateTo({ url: `/pages/circle/circle?id=${circleId}` })
}
</script>

<template>
  <view class="flex flex-col">
    <!-- ====== 顶部品牌区(青绿渐变) ====== -->
    <view class="sticky top-0 z-10 from-[#018d71] to-[#0aa07f] bg-gradient-to-b p-6 px-5">
      <view class="flex items-center justify-between">
        <view class="flex flex-col  justify-betweeen">
          <view class="flex items-center gap-1">
            <image src="/static/images/logo.png" class="h-[40px] w-[40px]" />
            <text class="text-xl text-white font-semibold">
              趣邻圈
            </text>
          </view>
          <text class="mt-1 text-md text-white/80">
            选择兴趣,遇见附近同趣的人与圈子
          </text>
        </view>
        <view class="flex gap-2 items-end">
          <wd-badge
            v-if="userStore.isLoggedIn"
            :model-value="unreadCount"
            :max="99"
            :hidden="unreadCount <= 0"
          >
            <wd-button type="info" variant="text" size="large" icon="notification" @click="handleGoNotification">
            </wd-button>
          </wd-badge>
        </view>
      </view>
    </view>

    <!-- ====== MBTI 反向入口:测人格,找同好(可关闭) ====== -->
    <view
      v-if="mbtiEntryVisible"
      class="relative mx-4 mt-3 rounded-2xl bg-white shadow-sm active:opacity-80"
      @click="handleGoMbti"
    >
      <!-- 关闭:阻止冒泡,避免误触进入 MBTI -->
      <view
        class="absolute left-1.5 top-1.5 z-1 h-5 w-5 flex items-center justify-center"
        @click.stop="handleCloseMbtiEntry"
      >
        <view class="i-carbon:close text-[18px] text-[#ccc] leading-none" />
      </view>
      <view class="flex items-center justify-between py-3 pl-7 pr-4">
        <view class="min-w-0 flex items-center gap-3">
          <text class="text-lg">🧠</text>
          <view class="min-w-0">
            <text class="block text-sm text-[#333] font-medium">
              测 MBTI,一键找同好
            </text>
            <text class="mt-0.5 block text-xs text-[#999]">
              按性格推荐兴趣,匹配同趣的人与圈子
            </text>
          </view>
        </view>
        <text class="shrink-0 text-xs text-[#018d71]">
          ›
        </text>
      </view>
    </view>

    <!-- ====== 兴趣卡片 + 位置卡片 + 范围选择(纯输入/输出组件) ====== -->
    <MatchFilterBar
      :user-tags="effectiveTags"
      :latitude="latitude"
      :longitude="longitude"
      :address="address"
      :range-km="rangeKm"
      :ready="ready"
      @confirm-tags="handleTagsConfirmed"
      @clear-tags="handleClearTags"
      @update:location="handleLocationUpdated"
      @change-range="handleRangeChange"
    />

    <!-- ====== 匹配结果区:同趣的人 / 同趣的圈子分 Tab 展示(切换懒加载,触底加载下一页) ====== -->
    <view v-if="ready" class="flex-1 pb-32">
      <wd-tabs v-model="activeTab">
        <!-- Tab:同趣的人 -->
S       <wd-tab title="同趣的人" name="person">
          <view class="mx-4 mt-3">
            <view v-if="peopleLoading && peopleItems.length === 0" class="flex flex-col items-center pt-20">
              <text class="text-sm text-[#999]">
                发现同趣中...
              </text>
            </view>
            <view v-else-if="peopleItems.length === 0" class="flex flex-col items-center pt-20">
              <text class="text-sm text-[#999]">
                附近暂无同趣的人,试试扩大范围或调整兴趣
              </text>
            </view>
            <view v-else class="flex flex-col gap-3">
              <view
                v-for="(p, idx) in peopleItems"
                :key="`p-${p.userId}-${idx}`"
                class="rounded-2xl bg-white p-4 shadow-sm"
                @click="handlePersonClick(p)"
              >
                <view class="flex items-center gap-3">
                  <view class="h-12 w-12 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1]">
                    <image v-if="p.avatarUrl" :src="p.avatarUrl" class="h-full w-full" mode="aspectFill" />
                    <text v-else class="text-lg text-[#018d71] font-medium">
                      {{ p.name ? p.name[0] : '?' }}
                    </text>
                  </view>
                  <view class="min-w-0 flex-1">
                    <view class="flex items-center justify-between">
                      <text class="truncate text-base text-[#333] font-medium">
                        {{ p.name }}
                      </text>
                      <text class="shrink-0 text-xs text-[#999]">
                        {{ formatDistance(p.distanceKm) }}
                      </text>
                    </view>
                    <view class="mt-1">
                      <text class="text-xs text-[#999]">
                        {{ activityLevelText(p.activityLevel) }}
                        <template v-if="p.practiceYears !== null && p.practiceYears !== undefined">
                          · {{ p.practiceYears }}年
                        </template>
                      </text>
                    </view>
                  </view>
                </view>
                <view v-if="p.tags.length > 0" class="mt-3 flex flex-wrap gap-2">
                  <template v-for="(name, i) in p.tags" :key="name">
                    <text v-if="i < MAX_TAG_VISIBLE" class="rounded-full bg-[#e8f5f1] px-2.5 py-1 text-xs text-[#018d71]">
                      {{ name }}
                    </text>
                  </template>
                  <text v-if="p.tags.length > MAX_TAG_VISIBLE" class="text-xs text-[#999]">
                    +{{ p.tags.length - MAX_TAG_VISIBLE }}
                  </text>
                </view>
              </view>
              <!-- 触底加载状态 -->
              <view v-if="peopleLoading" class="py-3 text-center">
                <text class="text-xs text-[#999]">
                  加载中...
                </text>
              </view>
              <view v-else-if="peopleFinished" class="py-3 text-center">
                <text class="text-xs text-[#999]">
                  没有更多了
                </text>
              </view>
            </view>
          </view>
        </wd-tab>

        <!-- Tab:同趣的圈子 -->
        <wd-tab title="同趣的圈子" name="circle">
          <view class="mx-4 mt-3">
            <view v-if="circleLoading && circleItems.length === 0" class="flex flex-col items-center pt-20">
              <text class="text-sm text-[#999]">
                发现同趣中...
              </text>
            </view>
            <view v-else-if="circleItems.length === 0" class="flex flex-col items-center pt-20">
              <text class="text-sm text-[#999]">
                附近暂无同趣的圈子,试试扩大范围或调整兴趣
              </text>
            </view>
            <view v-else class="flex flex-col gap-3">
              <view
                v-for="(c, idx) in circleItems"
                :key="`c-${c.circleId}-${idx}`"
                class="rounded-2xl bg-white p-4 shadow-sm"
                @click="handleCircleClick(c.circleId)"
              >
                <view class="flex items-center gap-3">
                  <view class="h-12 w-12 flex shrink-0 items-center justify-center rounded-full bg-[#fdf3e7]">
                    <text class="text-lg text-[#e68a00] font-medium">
                      圈
                    </text>
                  </view>
                  <view class="min-w-0 flex-1">
                    <view class="flex items-center justify-between">
                      <text class="truncate text-base text-[#333] font-medium">
                        {{ c.title }}
                      </text>
                      <text class="shrink-0 text-xs text-[#999]">
                        {{ formatDistance(c.distanceKm) }}
                      </text>
                    </view>
                    <view class="mt-1">
                      <text class="text-xs text-[#999]">
                        {{ c.activityTime }}
                      </text>
                    </view>
                  </view>
                </view>
                <view v-if="c.tags.length > 0" class="mt-3 flex flex-wrap gap-2">
                  <template v-for="(name, i) in c.tags" :key="name">
                    <text v-if="i < MAX_TAG_VISIBLE" class="rounded-full bg-[#fdf3e7] px-2.5 py-1 text-xs text-[#e68a00]">
                      {{ name }}
                    </text>
                  </template>
                  <text v-if="c.tags.length > MAX_TAG_VISIBLE" class="text-xs text-[#999]">
                    +{{ c.tags.length - MAX_TAG_VISIBLE }}
                  </text>
                </view>
              </view>
              <!-- 触底加载状态 -->
              <view v-if="circleLoading" class="py-3 text-center">
                <text class="text-xs text-[#999]">
                  加载中...
                </text>
              </view>
              <view v-else-if="circleFinished" class="py-3 text-center">
                <text class="text-xs text-[#999]">
                  没有更多了
                </text>
              </view>
            </view>
          </view>
        </wd-tab>
      </wd-tabs>
    </view>

    <!-- 留白区:ready 为 false 时占位,避免内容过短露出底部 -->
    <view v-if="!ready" class="flex-1" />

    <!-- ====== 右下角浮动创建入口 ====== -->
    <wd-fab
      v-model:active="fabActive"
      position="right-bottom"
      direction="top"
      type="primary"
      :gap="fabGap"
    >
      <view class="fab-item" @click="handleFabAction(handleCreateActivity)">
        <text class="i-carbon-calendar fab-item__icon" />
        <text class="fab-item__label">创建活动</text>
      </view>
      <view class="fab-item" @click="handleFabAction(handleCreateCircle)">
        <text class="i-carbon-group fab-item__icon" />
        <text class="fab-item__label">创建圈子</text>
      </view>
    </wd-fab>

    <!-- 资料补全引导弹窗(底部;完成或主动关闭前保持可见) -->
    <ProfileSetupPopup
      v-model="profileSetupVisible"
      @success="handleProfileSetupSuccess"
      @cancel="handleProfileSetupCancel"
    />
  </view>
</template>

<style lang="scss" scoped>
/* 首页匹配 tabs:激活标题/下划线改主题青绿色,导航字号调小一档(默认 16px) */
:deep(.wd-tabs) {
  --wot-tabs-nav-color-active: var(--wot-color-theme, #018d71);
  --wot-tabs-nav-line-bg: var(--wot-color-theme, #018d71);
  --wot-tabs-nav-item-font-size: 15px;
}

.fab-item {
  display: flex;
  align-items: center;
  margin-bottom: 20rpx;
  padding: 20rpx 28rpx;
  border-radius: 999rpx;
  background: #fff;
  box-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.12);
}

.fab-item__icon {
  margin-right: 10rpx;
  font-size: 28rpx;
  color: var(--wot-color-theme, #018d71);
}

.fab-item__label {
  font-size: 26rpx;
  color: #333;
  white-space: nowrap;
}
</style>
