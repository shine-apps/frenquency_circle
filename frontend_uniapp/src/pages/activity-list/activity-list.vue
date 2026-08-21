<script lang="ts" setup>
/**
 * 活动列表页(全局,与圈子解耦)。
 *
 * 调 GET /api/activities 拉取全部 active 活动,按起始时间倒序。
 * 所有登录用户可访问;点击卡片跳活动详情。
 */
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getActivities } from '@/api/activities'
import { formatDateTime } from '@/utils/format'
import type { ActivityDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '活动',
  },
  excludeLoginPath: false,
})

const list = ref<ActivityDTO[]>([])
const loading = ref(false)

async function fetchList() {
  loading.value = true
  try {
    const res = await getActivities({ page: 1, pageSize: 20 })
    list.value = res?.list || []
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

onShow(() => {
  void fetchList()
})

onPullDownRefresh(() => {
  fetchList().finally(() => {
    uni.stopPullDownRefresh()
  })
})

/** 跳活动详情 */
function goActivity(id: string) {
  uni.navigateTo({ url: `/pages/activity/activity?activityId=${id}` })
}
</script>

<template>
  <view class="flex flex-col">
    <view class="bg-white px-4 py-4">
      <text class="block text-base text-[#333] font-semibold">
        活动广场
      </text>
      <text class="mt-1 block text-xs text-[#999]">
        共 {{ list.length }} 个活动,按起始时间排序
      </text>
    </view>

    <view v-if="loading && list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>
    <view v-else-if="list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        暂无活动,敬请期待
      </text>
    </view>
    <view v-else class="mx-4 mt-3 flex flex-col gap-3">
      <view
        v-for="a in list"
        :key="a.id"
        class="rounded-2xl bg-white p-4"
        @click="goActivity(a.id)"
      >
        <view class="flex items-start justify-between gap-2">
          <view class="min-w-0 flex-1">
            <text class="truncate text-base text-[#333] font-medium">
              {{ a.title }}
            </text>
            <view class="mt-1 flex flex-col gap-0.5">
              <text class="text-xs text-[#999]">
                起始 {{ formatDateTime(a.startTime) }}
              </text>
              <text class="text-xs text-[#999]">
                报名截止 {{ formatDateTime(a.registrationDeadline) }}
              </text>
            </view>
          </view>
          <text class="shrink-0 text-sm text-[#ccc]">
            ›
          </text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
