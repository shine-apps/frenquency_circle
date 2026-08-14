<script lang="ts" setup>
import { computed } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { useMatchStore } from '@/store/match'
import { useUserStore } from '@/store/user'
import { matchCircles } from '@/api/locations'
import { formatDateTime, formatDistance } from '@/utils/format'
import type { LocationPoint } from '@/types'

definePage({
  style: {
    navigationBarTitleText: '我的圈子',
  },
})

/** 标签展示最大数量 */
const MAX_TAG_VISIBLE = 3

const matchStore = useMatchStore()
const userStore = useUserStore()
const circles = computed(() => matchStore.circles)

/** 跳圈子详情 */
function handleCircleClick(circleId: string) {
  uni.navigateTo({ url: `/pages/circle/circle?id=${circleId}` })
}

/** 跳首页发现 */
function handleGoHome() {
  uni.reLaunch({ url: '/pages/index/index' })
}

/** 跳匹配结果页 */
function handleViewMatch() {
  uni.navigateTo({ url: '/pages/match/match' })
}

/** 解析可用的定位(优先 match store,兜底用户资料) */
function resolveLocation(): LocationPoint | null {
  if (matchStore.location)
    return matchStore.location
  return userStore.userInfo?.location ?? null
}

/** 解析可用的标签(优先 match store,兜底用户资料) */
function resolveTagNames(): string[] {
  if (matchStore.tags.length > 0)
    return matchStore.tags
  return userStore.userInfo?.tags ?? []
}

// 进入时若无缓存结果,则按用户当前位置/标签兜底拉取一次圈子
onShow(() => {
  if (circles.value.length > 0)
    return
  const loc = resolveLocation()
  const tags = resolveTagNames()
  if (!loc || tags.length === 0)
    return
  matchCircles({ latitude: loc.latitude, longitude: loc.longitude, tags, rangeKm: matchStore.rangeKm || 5, page: 1, pageSize: 20 })
    .then((res) => {
      matchStore.setMatchResult({
        circles: res.list || [],
        rangeKm: matchStore.rangeKm || 5,
        location: loc,
        tags,
        totalCircles: res.total,
      })
    })
    .catch(() => {
      // 静默:保持空态,引导用户去首页完善兴趣/位置
    })
})
</script>

<template>
  <view class="flex min-h-screen flex-col bg-[#f7f8fa]">
    <view class="bg-white px-4 py-4">
      <text class="block text-base font-semibold text-[#333]">
        最近匹配的圈子
      </text>
      <text class="mt-1 block text-xs text-[#999]">
        基于自动匹配结果
      </text>
    </view>

    <view v-if="circles.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        暂未匹配到任何圈子,去首页发现文艺同频圈子吧
      </text>
      <view class="mt-4 flex gap-3">
        <wd-button round size="small" @click="handleGoHome">去首页发现</wd-button>
        <view class="rounded-full border border-[#e0e0e0] bg-white px-5 py-2" @click="handleViewMatch">
          <text class="text-sm text-[#666]">
            查看匹配结果
          </text>
        </view>
      </view>
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
</template>

<style lang="scss" scoped>
//
</style>
