<script lang="ts" setup>
import { computed, ref } from 'vue'
import { onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { useMatchStore } from '@/store/match'
import { useLocationStore } from '@/store/location'
import { useUserStore } from '@/store/user'
import { matchCircles, matchPeople } from '@/api/locations'
import { activityLevelText, formatDateTime, formatDistance, practiceYearsText } from '@/utils/format'
import TagSelectorPopup from '@/components/TagSelectorPopup/TagSelectorPopup.vue'
import type { LocationPoint, MatchCircleDTO, MatchPersonDTO } from '@/types'

definePage({
  layout: 'default',
  // 匹配结果展示页
  style: {
    navigationBarTitleText: '匹配结果',
    enablePullDownRefresh: true,
  },
})

/** 列表 Tab 类型 */
type ListTab = 'people' | 'circles'

/** 范围筛选选项(全部用 30km 作为实际上限) */
const RANGE_FILTERS: Array<{ label: string, value: number }> = [
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
/** 兴趣标签选择弹窗显隐 */
const tagPopupVisible = ref(false)

/** 当前 Tab 总数(用于摘要展示) */
const currentTotal = computed(() => (activeTab.value === 'people' ? matchStore.totalPeople : matchStore.totalCircles))
const currentList = computed(() => (activeTab.value === 'people' ? people.value : circles.value))

/** 解析当前可用定位 */
function resolveLocation(): LocationPoint | null {
  if (matchStore.location)
    return matchStore.location
  if (locationStore.latitude !== null && locationStore.longitude !== null) {
    return { latitude: locationStore.latitude, longitude: locationStore.longitude }
  }
  if (userStore.userInfo?.location)
    return userStore.userInfo.location
  return null
}

/** 解析当前可用标签名称 */
function resolveTagNames(): string[] {
  if (matchStore.tags.length > 0)
    return matchStore.tags
  if (userStore.userInfo?.tags && userStore.userInfo.tags.length > 0)
    return userStore.userInfo.tags
  return []
}

/** 匹配请求序号,丢弃过期请求结果 */
let fetchSeq = 0

/** 并发拉取人与圈子 */
async function fetchMatch(loc: LocationPoint, tags: string[], range: number) {
  const seq = ++fetchSeq
  loading.value = true
  try {
    const [peopleRes, circlesRes] = await Promise.all([
      matchPeople({ latitude: loc.latitude, longitude: loc.longitude, tags, rangeKm: range, page: 1, pageSize: 20 }),
      matchCircles({ latitude: loc.latitude, longitude: loc.longitude, tags, rangeKm: range, page: 1, pageSize: 20 }),
    ])
    if (seq !== fetchSeq)
      return // 已有更新的请求,丢弃本次结果
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
    if (seq !== fetchSeq)
      return
    console.error('[match] fetchMatch failed:', e)
    uni.showToast({ title: (e as Error).message || '匹配失败', icon: 'none' })
  }
  finally {
    if (seq === fetchSeq)
      loading.value = false
  }
}

// ====== 进入时拉取 ======
onShow(() => {
  const loc = resolveLocation()
  const tags = resolveTagNames()
  if (!loc) {
    uni.showToast({ title: '请先设置兴趣与位置', icon: 'none' })
    setTimeout(() => uni.reLaunch({ url: '/pages/index/index' }), 800)
    return
  }
  if (tags.length === 0) {
    uni.showToast({ title: '请先选择兴趣', icon: 'none' })
    setTimeout(() => {
      tagPopupVisible.value = true
    }, 800)
    return
  }
  fetchMatch(loc, tags, rangeKm.value)
})

/** 标签保存成功后重新拉取匹配结果 */
function handleTagsConfirmed() {
  const loc = resolveLocation()
  const tags = resolveTagNames()
  if (loc && tags.length > 0) {
    fetchMatch(loc, tags, rangeKm.value)
  }
}

/** 切换范围筛选 → 重新拉取 */
function handleRangeChange(range: number) {
  if (range === rangeKm.value)
    return
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
  uni.showToast({ title: '同趣的人暂不支持直接联系,请通过圈子互动', icon: 'none', duration: 2000 })
}

/** 圈子列表项点击:跳详情页 */
function handleCircleClick(circleId: string) {
  uni.navigateTo({ url: `/pages/circle/circle?id=${circleId}` })
}

/** 去首页完善信息(空态一键回首页) */
function handleGoHome() {
  uni.reLaunch({ url: '/pages/index/index' })
}
</script>

<template>
  <view class="min-h-screen flex flex-col bg-[#f7f8fa]">
    <!-- ====== 顶部品牌渐变背景 ====== -->
    <view class="from-[#018d71] to-[#0aa07f] bg-gradient-to-b px-5 pb-4 pt-safe">
      <text class="text-lg text-white font-semibold">
        同趣结果
      </text>
      <text class="mt-1 block text-xs text-white/80">
        基于你的兴趣标签与当前位置自动匹配
      </text>
    </view>

    <!-- ====== 顶部双 Tab(青绿下划线) ====== -->
    <view class="flex bg-white shadow-sm">
      <view
        class="flex-1 py-3 text-center text-sm"
        :class="activeTab === 'people' ? 'border-b-2 border-[#018d71] font-medium text-[#018d71]' : 'text-[#666]'"
        @click="activeTab = 'people'"
      >
        同趣的人
      </view>
      <view
        class="flex-1 py-3 text-center text-sm"
        :class="activeTab === 'circles' ? 'border-b-2 border-[#018d71] font-medium text-[#018d71]' : 'text-[#666]'"
        @click="activeTab = 'circles'"
      >
        同趣的圈子
      </view>
    </view>

    <!-- ====== 范围筛选 + 结果摘要 ====== -->
    <view class="bg-white px-4 py-3">
      <scroll-view scroll-x class="whitespace-nowrap">
        <view class="inline-flex gap-2">
          <view
            v-for="opt in RANGE_FILTERS"
            :key="opt.value"
            class="h-8 min-w-16 flex items-center justify-center rounded-full px-3"
            :class="rangeKm === opt.value ? 'bg-[#e8f5f1]' : 'bg-[#f5f6f7]'"
            @click="handleRangeChange(opt.value)"
          >
            <text :class="rangeKm === opt.value ? 'text-xs font-medium text-[#018d71]' : 'text-xs text-[#666]'">
              {{ opt.label }}
            </text>
          </view>
        </view>
      </scroll-view>
      <view v-if="!loading" class="mt-2 flex items-center justify-between">
        <text class="text-xs text-[#999]">
          范围 {{ rangeKm }}km 内,共 {{ currentTotal }} 个{{ activeTab === 'people' ? '人' : '圈子' }}
        </text>
      </view>
    </view>

    <!-- ====== 列表区 ====== -->
    <view v-if="loading && people.length === 0 && circles.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        匹配中...
      </text>
    </view>

    <!-- 同趣的人列表 -->
    <view v-else-if="activeTab === 'people'">
      <view v-if="people.length === 0" class="flex flex-col items-center pt-16">
        <text class="text-sm text-[#999]">
          附近暂无同趣的人,试试扩大范围
        </text>
        <button class="mt-4 rounded-full bg-[#018d71] px-5 py-2 text-sm text-white active:scale-95" @click="handleGoHome">
          去首页调整
        </button>
      </view>
      <view v-else class="mx-4 mt-3 flex flex-col gap-3">
        <view
          v-for="p in people"
          :key="p.userId"
          class="rounded-2xl bg-white p-4 shadow-sm"
          @click="handlePersonClick"
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
                <view class="shrink-0 rounded-full bg-[#e8f5f1] px-2 py-0.5">
                  <text class="text-xs text-[#018d71]">
                    {{ formatDistance(p.distanceKm) }}
                  </text>
                </view>
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
      </view>
    </view>

    <!-- 同趣的圈子列表 -->
    <view v-else>
      <view v-if="circles.length === 0" class="flex flex-col items-center pt-16">
        <text class="text-sm text-[#999]">
          附近暂无同趣的圈子,试试扩大范围
        </text>
        <button class="mt-4 rounded-full bg-[#018d71] px-5 py-2 text-sm text-white active:scale-95" @click="handleGoHome">
          去首页调整
        </button>
      </view>
      <view v-else class="mx-4 mt-3 flex flex-col gap-3 pb-32">
        <view
          v-for="c in circles"
          :key="c.circleId"
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
                <view class="shrink-0 rounded-full bg-[#fdf3e7] px-2 py-0.5">
                  <text class="text-xs text-[#e68a00]">
                    {{ formatDistance(c.distanceKm) }}
                  </text>
                </view>
              </view>
              <view class="mt-1 flex items-center gap-1">
                <text class="text-xs text-[#999]">
                  {{ formatDateTime(c.activityTime) }}
                </text>
              </view>
              <text v-if="c.address" class="mt-0.5 block truncate text-xs text-[#999]">
                {{ c.address }}
              </text>
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
      </view>
    </view>

    <!-- 兴趣标签选择弹窗 -->
    <TagSelectorPopup v-model="tagPopupVisible" :initial-tags="userStore.userInfo?.tags ?? []" @confirm="handleTagsConfirmed" />
  </view>
</template>

<style lang="scss" scoped>
//
</style>
