<script lang="ts" setup>
import { computed } from 'vue'
import { useMatchStore } from '@/store/match'
import type { TagDTO } from '@/types'

definePage({
  style: {
    navigationBarTitleText: '我的圈子',
  },
})

/** 标签展示最大数量 */
const MAX_TAG_VISIBLE = 3

const matchStore = useMatchStore()
const circles = computed(() => matchStore.circles)

/** 跳圈子详情 */
function handleCircleClick(circleId: string) {
  uni.navigateTo({ url: `/pages/circle/circle?id=${circleId}` })
}

/** 跳首页发现 */
function handleGoHome() {
  uni.reLaunch({ url: '/pages/index/index' })
}

/** 跳搜寻同频页(主动匹配) */
function handlePublish() {
  uni.navigateTo({ url: '/pages/publish/publish' })
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

/** 渲染标签 */
function renderTags(tags: TagDTO[]): { visible: TagDTO[]; rest: number } {
  const visible = tags.slice(0, MAX_TAG_VISIBLE)
  const rest = tags.length - visible.length
  return { visible, rest }
}
</script>

<template>
  <view class="flex min-h-screen flex-col bg-[#f7f8fa]">
    <view class="bg-white px-4 py-4">
      <text class="block text-base font-semibold text-[#333]">
        最近匹配的圈子
      </text>
      <text class="mt-1 block text-xs text-[#999]">
        基于最近一次搜寻同频的匹配结果
      </text>
    </view>

    <view v-if="circles.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        暂未匹配到任何圈子,去首页发现同频圈子吧
      </text>
      <view class="mt-4 flex gap-3">
        <wd-button round size="small" @click="handleGoHome">去首页发现</wd-button>
        <view class="rounded-full border border-[#e0e0e0] bg-white px-5 py-2" @click="handlePublish">
          <text class="text-sm text-[#666]">
            搜寻同频匹配
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
          <template v-for="t in renderTags(c.tags).visible" :key="t.id">
            <text class="rounded-full bg-[#fdf3e7] px-2.5 py-1 text-xs text-[#e68a00]">
              {{ t.name }}
            </text>
          </template>
          <text v-if="renderTags(c.tags).rest > 0" class="text-xs text-[#999]">
            +{{ renderTags(c.tags).rest }}
          </text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
