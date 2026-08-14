<script lang="ts" setup>
import { computed, ref } from 'vue'
import { onShareAppMessage, onShareTimeline, onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { useMatchStore } from '@/store/match'
import { updateMyTags, updateProfile } from '@/api/auth'
import { matchCircles, matchPeople } from '@/api/locations'
import { LOGIN_PAGE } from '@/router/config'
import { useDialog } from '@wot-ui/ui/components/wd-dialog'
import { getCurrentLocation } from '@/utils/location'
import { reverseGeocode } from '@/utils/geo'
import { activityLevelText, formatDateTime, formatDistance } from '@/utils/format'
import { canCreateCircle } from '@/utils/role'
import { useShare } from '@/composables/useShare'
import LocationSetter from '@/components/LocationSetter/LocationSetter.vue'
import TagSelectorPopup from '@/components/TagSelectorPopup/TagSelectorPopup.vue'
import type { MatchCircleDTO, MatchPersonDTO } from '@/types'

defineOptions({
  name: 'Home',
})
definePage({
  // 首页:自动匹配主界面
  type: 'home',
  style: {
    navigationBarTitleText: '文艺同频圈',
    navigationStyle: 'custom',
  },
})

/** 范围 Tab 选项 */
const RANGE_OPTIONS: Array<{ label: string, value: number }> = [
  { label: '1km', value: 1 },
  { label: '5km', value: 5 },
  { label: '10km', value: 10 },
  { label: '30km', value: 30 },
]

/** 标签展示最大数量 */
const MAX_TAG_VISIBLE = 3

/** 混排列表项(人/圈子统一结构) */
interface MixedItem {
  kind: 'person' | 'circle'
  distanceKm: number
  person?: MatchPersonDTO
  circle?: MatchCircleDTO
}

const userStore = useUserStore()
const matchStore = useMatchStore()
const dialog = useDialog()

// 首页分享(右上角菜单:好友/朋友圈)
const { shareAppMessage, shareTimeline } = useShare({
  title: '文艺同频圈',
  path: '/pages/index/index',
})

// 分享钩子必须在页面顶层直接注册, 编译器才能生成微信小程序 Page 配置
// #ifdef MP-WEIXIN
onShareAppMessage(shareAppMessage)
onShareTimeline(shareTimeline)
// #endif

const user = computed(() => userStore.userInfo)
const userTags = computed(() => user.value?.tags || [])

/** 当前坐标与地址(优先 store/match → user → 默认空) */
const latitude = ref<number | null>(matchStore.location?.latitude ?? user.value?.location?.latitude ?? null)
const longitude = ref<number | null>(matchStore.location?.longitude ?? user.value?.location?.longitude ?? null)
const address = ref<string>(user.value?.address || '')

const rangeKm = ref<number>(5)
const loading = ref(false)
const items = ref<MixedItem[]>([])

/** 兴趣/位置完备性 */
const tagsReady = computed(() => userTags.value.length > 0)
const locationReady = computed(() => latitude.value != null && longitude.value != null)
const ready = computed(() => tagsReady.value && locationReady.value)

/** 匹配请求序号,丢弃过期请求结果 */
let loadSeq = 0

/** 获取位置并拉取匹配 */
async function loadAll(lat: number, lng: number, range: number): Promise<void> {
  if (userTags.value.length === 0)
    return
  const seq = ++loadSeq
  loading.value = true
  try {
    const [peopleRes, circlesRes] = await Promise.all([
      matchPeople({
        latitude: lat,
        longitude: lng,
        tags: userTags.value,
        rangeKm: range,
        page: 1,
        pageSize: 20,
      }),
      matchCircles({
        latitude: lat,
        longitude: lng,
        tags: userTags.value,
        rangeKm: range,
        page: 1,
        pageSize: 20,
      }),
    ])
    if (seq !== loadSeq)
      return // 已有更新的请求,丢弃本次结果
    const mixed: MixedItem[] = [
      ...(peopleRes.list || []).map(p => ({
        kind: 'person' as const,
        distanceKm: p.distanceKm,
        person: p,
      })),
      ...(circlesRes.list || []).map(c => ({
        kind: 'circle' as const,
        distanceKm: c.distanceKm,
        circle: c,
      })),
    ]
    mixed.sort((a, b) => a.distanceKm - b.distanceKm)
    items.value = mixed
    // 同步到 match store
    matchStore.setMatchResult({
      people: peopleRes.list || [],
      circles: circlesRes.list || [],
      rangeKm: range,
      location: { latitude: lat, longitude: lng },
      tags: userTags.value,
      totalPeople: peopleRes.total,
      totalCircles: circlesRes.total,
    })
  }
  catch (e) {
    if (seq !== loadSeq)
      return
    console.error('[index] loadAll failed:', e)
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
  }
  finally {
    if (seq === loadSeq)
      loading.value = false
  }
}

// ====== 进入时尝试定位 ======
onShow(() => {
  // 同步 store 与 user 中已有的位置(可能在 profile 页刚被更新)
  if (!latitude.value || !longitude.value) {
    if (user.value?.location?.latitude && user.value?.location?.longitude) {
      latitude.value = user.value.location.latitude
      longitude.value = user.value.location.longitude
      address.value = user.value.address || ''
      loadAll(latitude.value, longitude.value, rangeKm.value)
      return
    }
    // 尝试自动定位(失败时由 LocationSetter 引导手动选择)
    getCurrentLocation()
      .then((res) => {
        latitude.value = res.latitude
        longitude.value = res.longitude
        loadAll(res.latitude, res.longitude, rangeKm.value)
        // getCurrentLocation 仅返回坐标,地址由各端逆地理编码补全
        // (H5 走高德 JS API,小程序/其他端走后端 /api/geo/reverse)
        reverseGeocode(res.latitude, res.longitude).then((addr) => {
          address.value = addr || '已定位'
        })
      })
      .catch((err) => {
        console.warn('[index] getCurrentLocation failed:', err?.message || err)
      })
  }
  else {
    // 兴趣标签变更(从选择页返回)或首次无结果时重新拉取,避免展示陈旧匹配
    const storeTagsKey = matchStore.tags.join(',')
    const userTagsKey = userTags.value.join(',')
    if (userTags.value.length > 0 && (storeTagsKey !== userTagsKey || items.value.length === 0)) {
      loadAll(latitude.value, longitude.value, rangeKm.value)
    }
  }
})

/** 兴趣标签选择弹窗显隐 */
const tagPopupVisible = ref(false)

/** 打开兴趣标签选择弹窗 */
function handleEditTags(): void {
  tagPopupVisible.value = true
}

/** 标签保存成功后刷新匹配结果(当前坐标已就绪时) */
async function handleTagsConfirmed(tags: string[]): Promise<void> {
  // 已登录:自动保存到我的兴趣标签集合(后端),失败则只保留本地,不影响匹配
  if (userStore.isLoggedIn) {
    try {
      const saved = await updateMyTags(tags)
      userStore.setTags(saved)
    }
    catch (e) {
      console.error('[index] updateMyTags failed:', e)
      userStore.setTags(tags)
      uni.showToast({ title: '兴趣保存失败,请重试', icon: 'none' })
    }
  }
  else {
    // 未登录:仅更新本地状态用于本次匹配展示,不发起后端保存
    userStore.setTags(tags)
  }
  if (latitude.value != null && longitude.value != null && userTags.value.length > 0) {
    loadAll(latitude.value, longitude.value, rangeKm.value)
  }
}

/** 跳创建圈子页(仅 TEACHER / ADMIN) */
function handleCreateCircle(): void {
  uni.navigateTo({ url: '/pages/create-circle/create-circle' })
}

/** 范围切换 */
function handleRangeChange(range: number): void {
  if (range === rangeKm.value)
    return
  rangeKm.value = range
  if (ready.value) {
    loadAll(latitude.value!, longitude.value!, range)
  }
}

/** LocationSetter 选点完成后:保存到当前用户资料(已登录)、同步 store、刷新匹配 */
async function handleLocationUpdated(loc: { latitude: number, longitude: number, address: string }): Promise<void> {
  // 先更新本地坐标/地址,让 UI 立即回显
  latitude.value = loc.latitude
  longitude.value = loc.longitude
  address.value = loc.address

  // 已登录:自动保存到我的资料(与兴趣标签保存逻辑 handleTagsConfirmed 一致)
  if (userStore.isLoggedIn) {
    try {
      const profile = await updateProfile({
        address: loc.address,
        latitude: loc.latitude,
        longitude: loc.longitude,
      })
      // 同步 store,使用后端权威返回值
      userStore.setLocation(
        profile.location ?? { latitude: loc.latitude, longitude: loc.longitude },
        profile.address ?? loc.address,
      )
    }
    catch (e) {
      console.error('[index] updateProfile failed:', e)
      uni.showToast({ title: '位置保存失败,请重试', icon: 'none' })
    }
  }
  else {
    // 未登录:仅更新本地状态用于本次匹配展示,不发起后端保存
    userStore.setLocation(
      { latitude: loc.latitude, longitude: loc.longitude },
      loc.address,
    )
  }

  if (userTags.value.length > 0) {
    loadAll(latitude.value, longitude.value, rangeKm.value)
  }
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
      msg: '查看同频的人需要先登录,是否前往登录页?',
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
  <view class="min-h-screen flex flex-col bg-[#f7f8fa]">
    <!-- ====== 顶部品牌区(青绿渐变) ====== -->
    <view class="from-[#018d71] to-[#0aa07f] bg-gradient-to-b px-5 p-6 sticky top-0 z-10">
      <view class="flex items-center justify-between">
        <view class="flex flex-col">
          <view class="flex items-center gap-1">
            <image src="/static/images/logo_256_circle.png" class="w-[40px] h-[40px]"></image>
            <text class="text-xl text-white font-semibold">
              文艺同频圈
            </text>
          </view>
          <text class="mt-1 text-xs text-white/80">
            选择兴趣,遇见同频的人与圈子
          </text>
        </view>
        <view class="flex gap-2">
          <wd-button v-if="canCreateCircle(user?.role)" variant="subtle" round @click="handleCreateCircle">
            创建圈子
          </wd-button>
          
        </view>
      </view>
    </view>

    <!-- ====== 我的兴趣卡片 ====== -->
    <view class="mx-4 mt-3 rounded-2xl bg-white p-4 shadow-sm">
      <view class="flex items-center justify-between">
        <view class="flex items-center gap-2">
          <view class="i-carbon:tag text-[18px] text-[#018d71]" />
          <text class="text-sm text-[#333] font-medium">
            我的兴趣
          </text>
          <view v-if="tagsReady" class="rounded-full bg-[#e8f5f1] px-2 py-0.5">
            <text class="text-xs text-[#018d71]">
              {{ userTags.length }} 个
            </text>
          </view>
          <view v-else class="rounded-full bg-[#fff4e5] px-2 py-0.5">
            <text class="text-xs text-[#e68a00]">
              未选择
            </text>
          </view>
        </view>
        <wd-button @click="handleEditTags" type="primary" size="small" variant="text">
          {{ tagsReady ? '编辑' : '去选择' }} ›
        </wd-button>
      </view>
      <view v-if="tagsReady" class="mt-3 flex flex-wrap gap-2">
        <text
          v-for="name in userTags"
          :key="name"
          class="rounded-full bg-[#e8f5f1] px-3 py-1 text-xs text-[#018d71]"
        >
          {{ name }}
        </text>
      </view>
      <text v-else class="mt-3 block text-sm text-[#999] leading-6">
         选择 1~10 个兴趣标签, 以便为你推荐同频的人与圈子
      </text>
    </view>

    <!-- ====== 当前位置卡片(复用 LocationSetter) ====== -->
    <view class="mx-4 mt-3">
      <LocationSetter
        :latitude="latitude"
        :longitude="longitude"
        :address="address"
        title="当前位置"
        @update:location="handleLocationUpdated"
      />
    </view>

    <!-- ====== 范围 Tab ====== -->
    <view v-if="ready" class="mt-3">
      <scroll-view scroll-x class="whitespace-nowrap">
        <view class="flex gap-2 px-4">
          <view
            v-for="opt in RANGE_OPTIONS"
            :key="opt.value"
            class="h-9 min-w-10 flex items-center justify-center rounded-full px-4"
            :class="rangeKm === opt.value ? 'bg-[#018d71]' : 'bg-white'"
            @click="handleRangeChange(opt.value)"
          >
            <text :class="rangeKm === opt.value ? 'text-sm font-medium text-white' : 'text-sm text-[#666]'">
              {{ opt.label }}
            </text>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- ====== 匹配结果区 ====== -->
    <view v-if="ready" class="mx-4 mt-3 flex-1 pb-32">
      <view v-if="loading && items.length === 0" class="flex flex-col items-center pt-20">
        <text class="text-sm text-[#999]">
          发现同频中...
        </text>
      </view>
      <view v-else-if="items.length === 0" class="flex flex-col items-center pt-20">
        <text class="text-sm text-[#999]">
          附近暂无同频,试试扩大范围或调整兴趣
        </text>
      </view>
      <view v-else class="flex flex-col gap-3">
        <view
          v-for="(item, idx) in items"
          :key="item.kind === 'person' ? `p-${item.person!.userId}-${idx}` : `c-${item.circle!.circleId}-${idx}`"
          class="rounded-2xl bg-white p-4 shadow-sm"
          @click="item.kind === 'person' ? handlePersonClick(item.person) : handleCircleClick(item.circle!.circleId)"
        >
          <!-- 人卡片 -->
          <template v-if="item.kind === 'person' && item.person">
            <view class="flex items-center gap-3">
              <view class="h-12 w-12 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1]">
                <image v-if="item.person.avatarUrl" :src="item.person.avatarUrl" class="h-full w-full" mode="aspectFill" />
                <text v-else class="text-lg text-[#018d71] font-medium">
                  {{ item.person.name ? item.person.name[0] : '?' }}
                </text>
              </view>
              <view class="min-w-0 flex-1">
                <view class="flex items-center justify-between">
                  <text class="truncate text-base text-[#333] font-medium">
                    {{ item.person.name }}
                  </text>
                  <text class="shrink-0 text-xs text-[#999]">
                    {{ formatDistance(item.person.distanceKm) }}
                  </text>
                </view>
                <view class="mt-1">
                  <text class="text-xs text-[#999]">
                    {{ activityLevelText(item.person.activityLevel) }}
                    <template v-if="item.person.practiceYears !== null && item.person.practiceYears !== undefined">
                      · {{ item.person.practiceYears }}年
                    </template>
                  </text>
                </view>
              </view>
            </view>
            <view v-if="item.person.tags.length > 0" class="mt-3 flex flex-wrap gap-2">
              <template v-for="(name, i) in item.person.tags" :key="name">
                <text v-if="i < MAX_TAG_VISIBLE" class="rounded-full bg-[#e8f5f1] px-2.5 py-1 text-xs text-[#018d71]">
                  {{ name }}
                </text>
              </template>
              <text v-if="item.person.tags.length > MAX_TAG_VISIBLE" class="text-xs text-[#999]">
                +{{ item.person.tags.length - MAX_TAG_VISIBLE }}
              </text>
            </view>
          </template>

          <!-- 圈子卡片 -->
          <template v-else-if="item.circle">
            <view class="flex items-center gap-3">
              <view class="h-12 w-12 flex shrink-0 items-center justify-center rounded-full bg-[#fdf3e7]">
                <text class="text-lg text-[#e68a00] font-medium">
                  圈
                </text>
              </view>
              <view class="min-w-0 flex-1">
                <view class="flex items-center justify-between">
                  <text class="truncate text-base text-[#333] font-medium">
                    {{ item.circle.title }}
                  </text>
                  <text class="shrink-0 text-xs text-[#999]">
                    {{ formatDistance(item.circle.distanceKm) }}
                  </text>
                </view>
                <view class="mt-1">
                  <text class="text-xs text-[#999]">
                    {{ formatDateTime(item.circle.activityTime) }} · {{ item.circle.memberCount }}/{{ item.circle.maxMembers ?? '∞' }}人
                  </text>
                </view>
              </view>
            </view>
            <view v-if="item.circle.tags.length > 0" class="mt-3 flex flex-wrap gap-2">
              <template v-for="(name, i) in item.circle.tags" :key="name">
                <text v-if="i < MAX_TAG_VISIBLE" class="rounded-full bg-[#fdf3e7] px-2.5 py-1 text-xs text-[#e68a00]">
                  {{ name }}
                </text>
              </template>
              <text v-if="item.circle.tags.length > MAX_TAG_VISIBLE" class="text-xs text-[#999]">
                +{{ item.circle.tags.length - MAX_TAG_VISIBLE }}
              </text>
            </view>
          </template>
        </view>
      </view>
    </view>

    <!-- 留白区:ready 为 false 时占位,避免内容过短露出底部 -->
    <view v-if="!ready" class="flex-1" />

    <!-- 兴趣标签选择弹窗:仅回传选择结果,保存由本页统一处理(未登录不保存) -->
    <TagSelectorPopup v-model="tagPopupVisible" :initial-tags="userTags" @confirm="handleTagsConfirmed" />

    <!-- 登录提示对话框挂载点(供 useDialog 使用) -->
    <wd-dialog root-portal />
  </view>
</template>

<style lang="scss" scoped>
//
</style>
