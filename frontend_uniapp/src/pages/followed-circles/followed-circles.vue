<script lang="ts" setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getFollowedCircles } from '@/api/circles'
import { formatDate } from '@/utils/format'
import type { FollowedCircleDTO } from '@/types'

definePage({
  style: {
    navigationBarTitleText: '我关注的圈子',
    enablePullDownRefresh: true,
  },
})

const PAGE_SIZE = 20

const list = ref<FollowedCircleDTO[]>([])
const loading = ref(false)
const page = ref(1)
const finished = ref(false)

/** 拉取列表;reset=true 时回到第一页 */
async function fetchList(reset = false) {
  if (loading.value)
    return
  if (reset) {
    page.value = 1
    finished.value = false
  }
  loading.value = true
  try {
    const res = await getFollowedCircles({ page: page.value, pageSize: PAGE_SIZE })
    list.value = reset ? res.list : [...list.value, ...res.list]
    // total 统计可能含已删除圈子(与 list 口径略有偏差),故同时以「不足一页」兜底判定到底
    if (list.value.length >= res.total || res.list.length < PAGE_SIZE)
      finished.value = true
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

// 进入时拉取(从详情页返回也会触发 onShow 刷新)
onShow(() => {
  void fetchList(true)
})

/** 下拉刷新 */
onPullDownRefresh(() => {
  fetchList(true).finally(() => {
    uni.stopPullDownRefresh()
  })
})

/** 触底加载下一页 */
onReachBottom(() => {
  if (finished.value)
    return
  page.value += 1
  void fetchList()
})

/** 跳圈子详情 */
function handleCircleClick(circleId: string) {
  uni.navigateTo({ url: `/pages/circle/circle?id=${circleId}` })
}

/** 返回上一页 */
function handleBack() {
  uni.navigateBack({
    fail() {
      uni.reLaunch({ url: '/pages/me/me' })
    },
  })
}
</script>

<template>
  <view class="min-h-screen flex flex-col bg-[#f7f8fa]">
    <view v-if="loading && list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <view v-else-if="list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        还没有关注任何圈子,去首页发现吧
      </text>
      <wd-button class="mt-4" round size="small" @click="handleBack">
        返回
      </wd-button>
    </view>

    <view v-else class="mx-4 mt-3 flex flex-col gap-3">
      <view
        v-for="c in list"
        :key="c.id"
        class="rounded-2xl bg-white p-4"
        @click="handleCircleClick(c.id)"
      >
        <view class="flex items-start justify-between gap-2">
          <view class="min-w-0 flex-1">
            <text class="block truncate text-base text-[#333] font-medium">
              {{ c.title }}
            </text>
            <view class="mt-1 flex items-center gap-1">
              <text class="text-xs text-[#999]">
                关注于 {{ formatDate(c.followedAt) }}
              </text>
            </view>
            <text v-if="c.activityTime" class="mt-1 block truncate text-xs text-[#999]">
              {{ c.activityTime }}
            </text>
          </view>
        </view>
      </view>
      <text v-if="finished && list.length > 0" class="py-3 text-center text-xs text-[#999]">
        没有更多了
      </text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
