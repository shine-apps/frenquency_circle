<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useUserStore } from '@/store/user'
import { useMatchStore } from '@/store/match'
import { matchPeople, matchCircles } from '@/api/locations'
import { getCurrentLocation } from '@/utils/location'
import type { MatchCircleDTO, MatchPersonDTO, TagDTO } from '@/types'

defineOptions({
  name: 'Home',
})
definePage({
  // 首页
  type: 'home',
  style: {
    navigationBarTitleText: '首页',
  },
})

/** 范围 Tab 选项 */
const RANGE_OPTIONS: Array<{ label: string; value: number }> = [
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
  // 人
  person?: MatchPersonDTO
  // 圈子
  circle?: MatchCircleDTO
}

const userStore = useUserStore()
const matchStore = useMatchStore()
const user = computed(() => userStore.userInfo)
const tagIds = computed(() => (user.value?.tags || []).map(t => t.id))

const latitude = ref<number | null>(matchStore.location?.latitude ?? user.value?.location?.latitude ?? null)
const longitude = ref<number | null>(matchStore.location?.longitude ?? user.value?.location?.longitude ?? null)
const address = ref<string>(user.value?.address || '未定位')
const locationDenied = ref(false)
const rangeKm = ref<number>(5)
const loading = ref(false)
const items = ref<MixedItem[]>([])
// H5 端地图选点弹层显隐(用于切换位置)
const pickerVisible = ref(false)
// 首页说明卡片是否展示(用户关闭后本地记忆,不再展示)
const showIntro = ref<boolean>(getInitialShowIntro())

function getInitialShowIntro(): boolean {
  try {
    return uni.getStorageSync('index_intro_dismissed') !== '1'
  }
  catch {
    return true
  }
}

/** 获取位置并拉取匹配 */
async function loadAll(lat: number, lng: number, range: number): Promise<void> {
  if (tagIds.value.length === 0) return
  loading.value = true
  try {
    const [peopleRes, circlesRes] = await Promise.all([
      matchPeople({
        latitude: lat,
        longitude: lng,
        tagIds: tagIds.value,
        rangeKm: range,
        page: 1,
        pageSize: 20,
      }),
      matchCircles({
        latitude: lat,
        longitude: lng,
        tagIds: tagIds.value,
        rangeKm: range,
        page: 1,
        pageSize: 20,
      }),
    ])
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
    // 按距离升序
    mixed.sort((a, b) => a.distanceKm - b.distanceKm)
    items.value = mixed
    // 同步到 match store
    matchStore.setMatchResult({
      people: peopleRes.list || [],
      circles: circlesRes.list || [],
      rangeKm: range,
      location: { latitude: lat, longitude: lng },
      tagIds: tagIds.value,
      totalPeople: peopleRes.total,
      totalCircles: circlesRes.total,
    })
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

// ====== 进入时获取位置 ======
onShow(() => {
  if (!latitude.value || !longitude.value) {
    getCurrentLocation()
      .then((res) => {
        latitude.value = res.latitude
        longitude.value = res.longitude
        address.value = '已定位'
        locationDenied.value = false
        loadAll(res.latitude, res.longitude, rangeKm.value)
      })
      .catch((err) => {
        console.warn('[index] getCurrentLocation failed:', err?.message || err)
        locationDenied.value = true
      })
  }
  else {
    // 已有位置,若列表为空则拉取
    if (items.value.length === 0 && tagIds.value.length > 0) {
      loadAll(latitude.value, longitude.value, rangeKm.value)
    }
  }
})

/** 去授权:打开设置页,成功后重新定位(仅小程序端) */
async function handleOpenSetting(): Promise<void> {
  try {
    await uni.openSetting()
    const res = await getCurrentLocation()
    latitude.value = res.latitude
    longitude.value = res.longitude
    address.value = '已定位'
    locationDenied.value = false
    loadAll(res.latitude, res.longitude, rangeKm.value)
  }
  catch (err) {
    console.warn('[index] handleOpenSetting failed:', (err as Error)?.message || err)
    uni.showToast({ title: '授权失败,请稍后重试', icon: 'none' })
  }
}

/** 切换位置:小程序端用 chooseLocation,H5 打开地图选点弹层 */
async function handleChangeLocation(): Promise<void> {
  try {
    // #ifdef H5
    pickerVisible.value = true
    // #endif
    // #ifndef H5
    const res = await uni.chooseLocation({})
    latitude.value = res.latitude
    longitude.value = res.longitude
    address.value = res.address || res.name || '已选择位置'
    locationDenied.value = false
    if (tagIds.value.length > 0) {
      loadAll(res.latitude, res.longitude, rangeKm.value)
    }
    // #endif
  }
  catch (e) {
    const err = e as Error & { errMsg?: string }
    // 用户取消静默
    if (err?.errMsg && /cancel/i.test(err.errMsg)) return
    uni.showToast({ title: err?.message || '选择位置失败', icon: 'none' })
  }
}

/** H5 选点弹层确认回调 */
function handlePickerConfirm(loc: { latitude: number; longitude: number; address: string }): void {
  latitude.value = loc.latitude
  longitude.value = loc.longitude
  address.value = loc.address
  pickerVisible.value = false
  locationDenied.value = false
  if (tagIds.value.length > 0) {
    loadAll(loc.latitude, loc.longitude, rangeKm.value)
  }
}

/** 跳兴趣搜索页 */
function handleSearchClick(): void {
  uni.navigateTo({ url: '/pages/search/search' })
}

/** 跳搜寻同频页 */
function handlePublishClick(): void {
  const role = user.value?.role
  if (role === 'TEACHER' || role === 'ADMIN') {
    uni.showActionSheet({
      itemList: ['搜寻同频', '创建圈子'],
      success(res) {
        if (res.tapIndex === 0) {
          uni.navigateTo({ url: '/pages/publish/publish' })
        }
        else if (res.tapIndex === 1) {
          uni.navigateTo({ url: '/pages/create-circle/create-circle' })
        }
      },
      fail() {
        // 用户取消,静默
      },
    })
  }
  else {
    uni.navigateTo({ url: '/pages/publish/publish' })
  }
}

/** 范围切换 */
function handleRangeChange(range: number): void {
  if (range === rangeKm.value) return
  rangeKm.value = range
  if (latitude.value !== null && longitude.value !== null && tagIds.value.length > 0) {
    loadAll(latitude.value, longitude.value, range)
  }
}

/** 跳搜寻同频页(点击定位卡片) */
function handleLocationCardClick(): void {
  uni.navigateTo({ url: '/pages/publish/publish' })
}

/** 点击人卡片:提示暂不支持直接联系 */
function handlePersonClick(): void {
  uni.showToast({ title: '同频的人暂不支持直接联系,请通过圈子互动', icon: 'none' })
}

/** 点击圈子卡片:跳圈子详情 */
function handleCircleClick(circleId: string): void {
  uni.navigateTo({ url: `/pages/circle/circle?id=${circleId}` })
}

/** 距离格式化 */
function formatDistance(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)}m`
  return `${km.toFixed(1)}km`
}

/** 活动时间格式化 */
function formatDateTime(iso: string | null): string {
  if (!iso) return '时间待定'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '时间待定'
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  catch {
    return '时间待定'
  }
}

/** 渲染标签(最多 3 个 + "+N") */
function renderTags(tags: TagDTO[]): { visible: TagDTO[]; rest: number } {
  const visible = tags.slice(0, MAX_TAG_VISIBLE)
  const rest = tags.length - visible.length
  return { visible, rest }
}

/** 活跃度文案 */
function activityText(level: string): string {
  if (level === 'low') return '活跃度:低'
  if (level === 'medium') return '活跃度:中'
  return '活跃度:高'
}

/** 关闭首页说明卡片(本地记忆,不再展示) */
function handleDismissIntro(): void {
  try {
    uni.setStorageSync('index_intro_dismissed', '1')
  }
  catch {
    // 静默
  }
  showIntro.value = false
}

// 是否展示"未选兴趣"引导
const noTags = computed(() => tagIds.value.length === 0)

// ====== 微信分享:分享给好友 ======
onShareAppMessage(() => ({
  title: '文艺同频圈',
  path: '/pages/index/index',
}))

// #ifdef MP-WEIXIN
// 朋友圈分享(仅小程序端)
onShareTimeline(() => ({
  title: '文艺同频圈',
}))
// #endif
</script>

<template>
  <view class="flex min-h-screen flex-col bg-[#f7f8fa] pb-32">
    <!-- ====== 顶部:搜索栏 + 搜寻同频按钮 ====== -->
    <view class="bg-white px-4 pb-3 pt-4">
      <view class="flex items-center gap-3">
        <view class="flex h-10 flex-1 items-center rounded-full bg-[#f5f6f7] px-4" @click="handleSearchClick">
          <text class="text-sm text-[#999]">
            搜索兴趣/标签
          </text>
        </view>
        <wd-button round size="small" @click="handlePublishClick">搜寻同频</wd-button>
      </view>
    </view>

    <!-- ====== 首页说明卡片(可关闭) ====== -->
    <view v-if="showIntro" class="mx-4 mt-3 rounded-2xl bg-white p-4">
      <view class="flex items-center justify-between">
        <text class="text-base font-semibold text-[#333]">
          文艺同频圈是什么
        </text>
        <text class="text-lg text-[#999] px-2" @click="handleDismissIntro">
          ×
        </text>
      </view>
      <text class="mt-2 block text-sm leading-5 text-[#666]">
        基于地理位置的传统文化艺术兴趣圈子匹配平台，让同好之人在城市中轻松相遇。
      </text>
      <view class="mt-3 flex flex-col gap-2">
        <view class="flex items-start gap-2">
          <text class="shrink-0 text-sm text-[#018d71]">
            ·
          </text>
          <text class="text-sm leading-5 text-[#666]">
            选择兴趣标签，发现 1~30km 内同频的人与圈子
          </text>
        </view>
        <view class="flex items-start gap-2">
          <text class="shrink-0 text-sm text-[#018d71]">
            ·
          </text>
          <text class="text-sm leading-5 text-[#666]">
            加入圈子，参与太极、书法、民乐、茶道等线下活动
          </text>
        </view>
        <view class="flex items-start gap-2">
          <text class="shrink-0 text-sm text-[#018d71]">
            ·
          </text>
          <text class="text-sm leading-5 text-[#666]">
            完成教师认证，即可创建圈子、传承文化
          </text>
        </view>
      </view>
    </view>

    <!-- ====== 定位卡片 / 授权引导 ====== -->
    <view v-if="locationDenied" class="mx-4 mt-3 flex items-center justify-between rounded-2xl bg-white p-4">
      <view class="flex flex-col">
        <text class="text-sm font-medium text-[#333]">
          <!-- #ifdef H5 -->
          无法获取定位,可手动选择位置
          <!-- #endif -->
          <!-- #ifndef H5 -->
          请授权位置信息以发现附近同频
          <!-- #endif -->
        </text>
      </view>
      <!-- #ifdef H5 -->
      <wd-button round size="small" @click="handleChangeLocation">手动选择位置</wd-button>
      <!-- #endif -->
      <!-- #ifndef H5 -->
      <wd-button round size="small" @click="handleOpenSetting">去授权</wd-button>
      <!-- #endif -->
    </view>

    <view v-else class="mx-4 mt-3 flex items-center justify-between rounded-2xl bg-white p-4">
      <view class="flex flex-col gap-1" @click="handleChangeLocation">
        <view class="flex items-center gap-2">
          <text class="text-xs text-[#999]">
            当前位置
          </text>
          <text class="text-xs text-[#018d71]">
            切换 ›
          </text>
        </view>
        <text class="max-w-60 truncate text-base font-medium text-[#333]">
          {{ address }}
        </text>
      </view>
      <view class="flex items-center text-sm text-[#018d71]" @click="handleLocationCardClick">
        <text>搜寻同频 ›</text>
      </view>
    </view>

    <!-- ====== 未选兴趣引导 ====== -->
    <view v-if="noTags" class="mx-4 mt-3 flex items-center justify-between rounded-2xl bg-white p-4" @click="handleSearchClick">
      <view class="flex flex-col">
        <text class="text-sm font-medium text-[#333]">
          请先选择你的兴趣标签
        </text>
      </view>
      <text class="text-sm text-[#018d71]">
        点击去选择 ›
      </text>
    </view>

    <!-- ====== 范围 Tab ====== -->
    <scroll-view scroll-x class="mt-3 whitespace-nowrap">
      <view class="flex gap-2 px-4">
        <view
          v-for="opt in RANGE_OPTIONS"
          :key="opt.value"
          class="flex h-9 min-w-10 items-center justify-center rounded-full px-4"
          :class="rangeKm === opt.value ? 'bg-[#018d71]' : 'bg-white'"
          @click="handleRangeChange(opt.value)"
        >
          <text :class="rangeKm === opt.value ? 'text-sm font-medium text-white' : 'text-sm text-[#666]'">
            {{ opt.label }}
          </text>
        </view>
      </view>
    </scroll-view>

    <!-- ====== 推荐列表(混排) ====== -->
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
    <view v-else class="mx-4 mt-3 flex flex-col gap-3">
      <view
        v-for="(item, idx) in items"
        :key="item.kind === 'person' ? `p-${item.person!.userId}-${idx}` : `c-${item.circle!.circleId}-${idx}`"
        class="rounded-2xl bg-white p-4"
        @click="item.kind === 'person' ? handlePersonClick() : handleCircleClick(item.circle!.circleId)"
      >
        <!-- 人卡片 -->
        <template v-if="item.kind === 'person' && item.person">
          <view class="flex items-center gap-3">
            <view class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1]">
              <image v-if="item.person.avatarUrl" :src="item.person.avatarUrl" class="h-full w-full" mode="aspectFill" />
              <text v-else class="text-lg font-medium text-[#018d71]">
                {{ item.person.name ? item.person.name[0] : '?' }}
              </text>
            </view>
            <view class="min-w-0 flex-1">
              <view class="flex items-center justify-between">
                <text class="truncate text-base font-medium text-[#333]">
                  {{ item.person.name }}
                </text>
                <text class="shrink-0 text-xs text-[#999]">
                  {{ formatDistance(item.person.distanceKm) }}
                </text>
              </view>
              <view class="mt-1">
                <text class="text-xs text-[#999]">
                  {{ activityText(item.person.activityLevel) }}
                  <template v-if="item.person.practiceYears !== null && item.person.practiceYears !== undefined">
                    · {{ item.person.practiceYears }}年
                  </template>
                </text>
              </view>
            </view>
          </view>
          <view v-if="item.person.tags.length > 0" class="mt-3 flex flex-wrap gap-2">
            <template v-for="t in renderTags(item.person.tags).visible" :key="t.id">
              <text class="rounded-full bg-[#e8f5f1] px-2.5 py-1 text-xs text-[#018d71]">
                {{ t.name }}
              </text>
            </template>
            <text v-if="renderTags(item.person.tags).rest > 0" class="text-xs text-[#999]">
              +{{ renderTags(item.person.tags).rest }}
            </text>
          </view>
        </template>

        <!-- 圈子卡片 -->
        <template v-else-if="item.circle">
          <view class="flex items-center gap-3">
            <view class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#fdf3e7]">
              <text class="text-lg font-medium text-[#e68a00]">
                圈
              </text>
            </view>
            <view class="min-w-0 flex-1">
              <view class="flex items-center justify-between">
                <text class="truncate text-base font-medium text-[#333]">
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
            <template v-for="t in renderTags(item.circle.tags).visible" :key="t.id">
              <text class="rounded-full bg-[#fdf3e7] px-2.5 py-1 text-xs text-[#e68a00]">
                {{ t.name }}
              </text>
            </template>
            <text v-if="renderTags(item.circle.tags).rest > 0" class="text-xs text-[#999]">
              +{{ renderTags(item.circle.tags).rest }}
            </text>
          </view>
        </template>
      </view>
    </view>

    <!-- ====== H5 端地图选点弹层(用于切换位置) ====== -->
    <!-- #ifdef H5 -->
    <H5LocationPicker
      :visible="pickerVisible"
      :initial-lat="latitude"
      :initial-lng="longitude"
      @confirm="handlePickerConfirm"
      @close="pickerVisible = false"
    />
    <!-- #endif -->
  </view>
</template>

<style lang="scss" scoped>
//
</style>
