<script lang="ts" setup>
import { ref } from 'vue'
import { useMatchStore } from '@/store/match'
import { useLocationStore } from '@/store/location'
import { useUserStore } from '@/store/user'
import { matchPeople, matchCircles } from '@/api/locations'
import type { LocationPoint, MatchCircleDTO, MatchPersonDTO } from '@/types'

definePage({
  style: {
    navigationBarTitleText: '匹配结果',
  },
})

/** 列表 Tab 类型 */
type ListTab = 'people' | 'circles'

/** 范围筛选选项(全部用 30km 作为实际上限) */
const RANGE_FILTERS: Array<{ label: string; value: number }> = [
  { label: '全部', value: 30 },
  { label: '≤1km', value: 1 },
  { label: '≤5km', value: 5 },
  { label: '≤10km', value: 10 },
]

/** 标签展示最大数量 */
const MAX_TAG_VISIBLE = 3

const matchStore = useMatchStore()
const locationStore = useLocationStore()
const userStore = useUserStore()

const activeTab = ref<ListTab>('people')
const rangeKm = ref<number>(matchStore.rangeKm || 5)
const loading = ref(false)
// 本地列表(进入时拉取,与 store 同步)
const people = ref<MatchPersonDTO[]>(matchStore.people)
const circles = ref<MatchCircleDTO[]>(matchStore.circles)

/** 解析当前可用定位 */
function resolveLocation(): LocationPoint | null {
  if (matchStore.location) return matchStore.location
  if (locationStore.latitude !== null && locationStore.longitude !== null) {
    return { latitude: locationStore.latitude, longitude: locationStore.longitude }
  }
  if (userStore.userInfo?.location) return userStore.userInfo.location
  return null
}

/** 解析当前可用标签名称 */
function resolveTagNames(): string[] {
  if (matchStore.tags.length > 0) return matchStore.tags
  if (userStore.userInfo?.tags && userStore.userInfo.tags.length > 0) return userStore.userInfo.tags
  return []
}

/** 并发拉取人与圈子 */
async function fetchMatch(loc: LocationPoint, tags: string[], range: number) {
  loading.value = true
  try {
    const [peopleRes, circlesRes] = await Promise.all([
      matchPeople({ latitude: loc.latitude, longitude: loc.longitude, tags, rangeKm: range, page: 1, pageSize: 20 }),
      matchCircles({ latitude: loc.latitude, longitude: loc.longitude, tags, rangeKm: range, page: 1, pageSize: 20 }),
    ])
    people.value = peopleRes.list || []
    circles.value = circlesRes.list || []
    // 同步到 store
    matchStore.setMatchResult({
      people: peopleRes.list || [],
      circles: circlesRes.list || [],
      rangeKm: range,
      location: loc,
      tags,
      totalPeople: peopleRes.total,
      totalCircles: circlesRes.total,
    })
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '匹配失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

// ====== 进入时拉取 ======
onShow(() => {
  const loc = resolveLocation()
  const tags = resolveTagNames()
  if (!loc) {
    uni.showToast({ title: '请先搜寻同频', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 800)
    return
  }
  if (tags.length === 0) {
    uni.showToast({ title: '请先选择兴趣', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 800)
    return
  }
  fetchMatch(loc, tags, rangeKm.value)
})

/** 切换范围筛选 → 重新拉取 */
function handleRangeChange(range: number) {
  if (range === rangeKm.value) return
  rangeKm.value = range
  const loc = resolveLocation()
  const tags = resolveTagNames()
  if (loc && tags.length > 0) {
    fetchMatch(loc, tags, range)
  }
}

/** 下拉刷新:重新拉取当前范围 */
onPullDownRefresh(() => {
  const loc = resolveLocation()
  const tags = resolveTagNames()
  if (loc && tags.length > 0) {
    fetchMatch(loc, tags, rangeKm.value).finally(() => {
      uni.stopPullDownRefresh()
    })
  }
  else {
    uni.stopPullDownRefresh()
  }
})

/** 人列表项点击:简化为 Toast */
function handlePersonClick() {
  uni.showToast({ title: '同频的人暂不支持直接联系,请通过圈子互动', icon: 'none', duration: 2000 })
}

/** 圈子列表项点击:跳详情页 */
function handleCircleClick(circleId: string) {
  uni.navigateTo({ url: `/pages/circle/circle?id=${circleId}` })
}

/** 距离格式化 */
function formatDistance(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)}m`
  return `${km.toFixed(1)}km`
}

/** 活跃度中文映射 */
function activityLevelText(level: string): string {
  if (level === 'low') return '活跃度:低'
  if (level === 'medium') return '活跃度:中'
  return '活跃度:高'
}

/** 练习时长格式化 */
function practiceYearsText(years: number | null): string {
  if (years === null || years === undefined) return ''
  return `${years}年`
}

/** 活动时间格式化(简化:YYYY-MM-DD HH:mm) */
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
function renderTags(tags: string[]): { visible: string[]; rest: number } {
  const visible = tags.slice(0, MAX_TAG_VISIBLE)
  const rest = tags.length - visible.length
  return { visible, rest }
}
</script>

<template>
  <view class="flex min-h-screen flex-col bg-[#f7f8fa]">
    <!-- ====== 顶部双 Tab ====== -->
    <view class="flex bg-white">
      <view
        class="flex-1 py-3 text-center text-sm"
        :class="activeTab === 'people' ? 'border-b-2 border-[#018d71] font-medium text-[#018d71]' : 'text-[#666]'"
        @click="activeTab = 'people'"
      >
        同频的人
      </view>
      <view
        class="flex-1 py-3 text-center text-sm"
        :class="activeTab === 'circles' ? 'border-b-2 border-[#018d71] font-medium text-[#018d71]' : 'text-[#666]'"
        @click="activeTab = 'circles'"
      >
        同频的圈子
      </view>
    </view>

    <!-- ====== 范围筛选 ====== -->
    <scroll-view scroll-x class="whitespace-nowrap bg-white py-2">
      <view class="flex gap-3 px-4">
        <view
          v-for="opt in RANGE_FILTERS"
          :key="opt.value"
          class="flex h-8 min-w-16 items-center justify-center rounded-full px-3"
          :class="rangeKm === opt.value ? 'bg-[#e8f5f1]' : 'bg-[#f5f6f7]'"
          @click="handleRangeChange(opt.value)"
        >
          <text :class="rangeKm === opt.value ? 'text-xs font-medium text-[#018d71]' : 'text-xs text-[#666]'">
            {{ opt.label }}
          </text>
        </view>
      </view>
    </scroll-view>

    <!-- ====== 列表区 ====== -->
    <view v-if="loading && people.length === 0 && circles.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        匹配中...
      </text>
    </view>

    <!-- 同频的人列表 -->
    <view v-else-if="activeTab === 'people'">
      <view v-if="people.length === 0" class="flex flex-col items-center pt-20">
        <text class="text-sm text-[#999]">
          附近暂无同频的人,试试扩大范围
        </text>
      </view>
      <view v-else class="mx-4 mt-3 flex flex-col gap-3">
        <view
          v-for="p in people"
          :key="p.userId"
          class="rounded-2xl bg-white p-4"
          @click="handlePersonClick"
        >
          <view class="flex items-center gap-3">
            <view class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1]">
              <image v-if="p.avatarUrl" :src="p.avatarUrl" class="h-full w-full" mode="aspectFill" />
              <text v-else class="text-lg font-medium text-[#018d71]">
                {{ p.name ? p.name[0] : '?' }}
              </text>
            </view>
            <view class="min-w-0 flex-1">
              <view class="flex items-center justify-between">
                <text class="truncate text-base font-medium text-[#333]">
                  {{ p.name }}
                </text>
                <text class="shrink-0 text-xs text-[#999]">
                  {{ formatDistance(p.distanceKm) }}
                </text>
              </view>
              <view class="mt-1 flex items-center gap-1">
                <text class="text-xs text-[#999]">
                  {{ activityLevelText(p.activityLevel) }}
                </text>
                <template v-if="p.practiceYears !== null && p.practiceYears !== undefined">
                  <text class="text-xs text-[#999]">
                    ·
                  </text>
                  <text class="text-xs text-[#999]">
                    {{ practiceYearsText(p.practiceYears) }}
                  </text>
                </template>
              </view>
            </view>
          </view>
          <view v-if="p.tags.length > 0" class="mt-3 flex flex-wrap gap-2">
            <template v-for="name in renderTags(p.tags).visible" :key="name">
              <text class="rounded-full bg-[#e8f5f1] px-2.5 py-1 text-xs text-[#018d71]">
                {{ name }}
              </text>
            </template>
            <text v-if="renderTags(p.tags).rest > 0" class="text-xs text-[#999]">
              +{{ renderTags(p.tags).rest }}
            </text>
          </view>
        </view>
      </view>
    </view>

    <!-- 同频的圈子列表 -->
    <view v-else>
      <view v-if="circles.length === 0" class="flex flex-col items-center pt-20">
        <text class="text-sm text-[#999]">
          附近暂无同频的圈子,试试扩大范围
        </text>
      </view>
      <view v-else class="mx-4 mt-3 flex flex-col gap-3">
        <view
          v-for="c in circles"
          :key="c.circleId"
          class="rounded-2xl bg-white p-4"
          @click="handleCircleClick(c.circleId)"
        >
          <view class="flex items-center gap-3">
            <view class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#fdf3e7]">
              <text class="text-lg font-medium text-[#e68a00]">
                圈
              </text>
            </view>
            <view class="min-w-0 flex-1">
              <view class="flex items-center justify-between">
                <text class="truncate text-base font-medium text-[#333]">
                  {{ c.title }}
                </text>
                <text class="shrink-0 text-xs text-[#999]">
                  {{ formatDistance(c.distanceKm) }}
                </text>
              </view>
              <view class="mt-1 flex items-center gap-1">
                <text class="text-xs text-[#999]">
                  {{ formatDateTime(c.activityTime) }}
                </text>
                <text class="text-xs text-[#999]">
                  ·
                </text>
                <text class="text-xs text-[#999]">
                  {{ c.memberCount }}/{{ c.maxMembers ?? '∞' }}人
                </text>
              </view>
              <text v-if="c.address" class="mt-0.5 block truncate text-xs text-[#999]">
                {{ c.address }}
              </text>
            </view>
          </view>
          <view v-if="c.tags.length > 0" class="mt-3 flex flex-wrap gap-2">
            <template v-for="name in renderTags(c.tags).visible" :key="name">
              <text class="rounded-full bg-[#fdf3e7] px-2.5 py-1 text-xs text-[#e68a00]">
                {{ name }}
              </text>
            </template>
            <text v-if="renderTags(c.tags).rest > 0" class="text-xs text-[#999]">
              +{{ renderTags(c.tags).rest }}
            </text>
          </view>
        </view>
      </view>
    </view>

    <!-- TODO: 上拉加载更多(后端分页已就绪,前端 MVP 首版只实现下拉刷新) -->
  </view>
</template>

<style lang="scss" scoped>
//
</style>
