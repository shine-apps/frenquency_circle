<script lang="ts" setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { useMatchStore } from '@/store/match'
import { matchPeople, matchCircles } from '@/api/locations'
import { getCurrentLocation } from '@/utils/location'
import LocationSetter from '@/components/LocationSetter/LocationSetter.vue'
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
  person?: MatchPersonDTO
  circle?: MatchCircleDTO
}

const userStore = useUserStore()
const matchStore = useMatchStore()
const user = computed(() => userStore.userInfo)
const userTags = computed(() => user.value?.tags || [])

/** 当前坐标与地址(优先 store/match → user → 默认空) */
const latitude = ref<number | null>(matchStore.location?.latitude ?? user.value?.location?.latitude ?? null)
const longitude = ref<number | null>(matchStore.location?.longitude ?? user.value?.location?.longitude ?? null)
const address = ref<string>(user.value?.address || '')

const rangeKm = ref<number>(5)
const loading = ref(false)
const items = ref<MixedItem[]>([])

/** 兴趣/位置完备性(用于状态引导卡) */
const tagsReady = computed(() => userTags.value.length > 0)
const locationReady = computed(() => latitude.value != null && longitude.value != null)
const ready = computed(() => tagsReady.value && locationReady.value)

/** 提示用户去补齐的内容(同时缺→两条;只缺一→一条) */
const needTags = computed(() => !tagsReady.value)
const needLocation = computed(() => !locationReady.value)

/** 匹配请求序号,丢弃过期请求结果 */
let loadSeq = 0

/** 获取位置并拉取匹配 */
async function loadAll(lat: number, lng: number, range: number): Promise<void> {
  if (userTags.value.length === 0) return
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
    if (seq !== loadSeq) return // 已有更新的请求,丢弃本次结果
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
    if (seq !== loadSeq) return
    console.error('[index] loadAll failed:', e)
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
  }
  finally {
    if (seq === loadSeq) loading.value = false
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
        address.value = res.address || '已定位'
        loadAll(res.latitude, res.longitude, rangeKm.value)
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

/** 跳兴趣选择页 */
function handleEditTags(): void {
  uni.navigateTo({ url: '/pages/search/search' })
}

/** 跳创建圈子页(仅 TEACHER / ADMIN) */
function handleCreateCircle(): void {
  uni.navigateTo({ url: '/pages/create-circle/create-circle' })
}

/** 顶部"立即匹配"按钮:强制刷新当前结果(不依赖列表是否为空) */
function handleRefreshMatch(): void {
  if (!ready.value) {
    uni.showToast({ title: '请先完善兴趣与位置', icon: 'none' })
    return
  }
  loadAll(latitude.value!, longitude.value!, rangeKm.value)
}

/** 范围切换 */
function handleRangeChange(range: number): void {
  if (range === rangeKm.value) return
  rangeKm.value = range
  if (ready.value) {
    loadAll(latitude.value!, longitude.value!, range)
  }
}

/** LocationSetter 持久化成功后回调 */
function handleLocationUpdated(loc: { latitude: number, longitude: number, address: string }): void {
  latitude.value = loc.latitude
  longitude.value = loc.longitude
  address.value = loc.address
  if (userTags.value.length > 0) {
    loadAll(loc.latitude, loc.longitude, rangeKm.value)
  }
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

/** 活跃度文案 */
function activityText(level: string): string {
  if (level === 'low') return '活跃度:低'
  if (level === 'medium') return '活跃度:中'
  return '活跃度:高'
}

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
  <view class="flex min-h-screen flex-col bg-[#f7f8fa]">
    <!-- ====== 顶部品牌区(青绿渐变) ====== -->
    <view class="bg-gradient-to-b from-[#018d71] to-[#0aa07f] px-5 pb-6 pt-safe">
      <view class="flex items-center justify-between">
        <view class="flex flex-col">
          <text class="text-xl font-semibold text-white">
            文艺同频圈
          </text>
          <text class="mt-1 text-xs text-white/80">
            选择兴趣,遇见同频的人与圈子
          </text>
        </view>
        <view class="flex gap-2">
          <button
            class="rounded-full bg-white/20 px-3 py-1 text-xs text-white active:scale-95"
            @click="handleRefreshMatch"
          >
            立即匹配
          </button>
          <button
            v-if="user?.role === 'TEACHER' || user?.role === 'ADMIN'"
            class="rounded-full bg-white px-3 py-1 text-xs text-[#018d71] active:scale-95"
            @click="handleCreateCircle"
          >
            创建圈子
          </button>
        </view>
      </view>
    </view>

    <!-- ====== 状态引导卡(兴趣/位置未完备时) ====== -->
    <view
      v-if="!ready"
      class="mx-4 mt-3 rounded-2xl bg-white p-4 shadow-sm"
    >
      <view class="flex items-center gap-2">
        <view class="i-carbon:information text-[16px] text-[#e68a00]" />
        <text class="text-sm font-medium text-[#333]">
          完善信息,开启自动匹配
        </text>
      </view>
      <view v-if="needTags" class="mt-2 flex items-center justify-between">
        <text class="text-sm text-[#666]">
          · 选择 1~10 个兴趣标签
        </text>
        <text class="text-sm text-[#018d71]" @click="handleEditTags">
          去选择 ›
        </text>
      </view>
      <view v-if="needLocation" class="mt-2 flex items-center justify-between">
        <text class="text-sm text-[#666]">
          · 设置当前位置以发现附近的人与圈子
        </text>
        <text class="text-sm text-[#018d71]">
          ↓ 在下方设置
        </text>
      </view>
    </view>

    <!-- ====== 我的兴趣卡片 ====== -->
    <view class="mx-4 mt-3 rounded-2xl bg-white p-4 shadow-sm">
      <view class="flex items-center justify-between">
        <view class="flex items-center gap-2">
          <view class="i-carbon:tag text-[18px] text-[#018d71]" />
          <text class="text-sm font-medium text-[#333]">
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
        <button
          class="rounded-full border border-[#018d71] px-3 py-1 text-xs text-[#018d71] active:scale-95"
          @click="handleEditTags"
        >
          {{ tagsReady ? '编辑' : '去选择' }}
        </button>
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
      <text v-else class="mt-3 block text-sm leading-6 text-[#999]">
        未选择任何兴趣,匹配结果将为空
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
  </view>
</template>

<style lang="scss" scoped>
//
</style>