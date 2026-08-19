<script lang="ts" setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/api/notifications'
import { formatDateTime } from '@/utils/format'
import type { NotificationDTO } from '@/types'

definePage({
  style: {
    navigationBarTitleText: '消息',
    enablePullDownRefresh: true,
  },
})

const PAGE_SIZE = 20

const list = ref<NotificationDTO[]>([])
const loading = ref(false)
const page = ref(1)
const finished = ref(false)
const error = ref(false)

/** 拉取列表;reset=true 时回到第一页 */
async function fetchList(reset = false) {
  if (loading.value && !reset)
    return
  if (reset) {
    page.value = 1
    finished.value = false
    error.value = false
  }
  loading.value = true
  try {
    const res = await getNotifications({ page: page.value, pageSize: PAGE_SIZE })
    list.value = reset ? res.list : [...list.value, ...res.list]
    if (list.value.length >= res.total || res.list.length < PAGE_SIZE)
      finished.value = true
  }
  catch (e) {
    error.value = true
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

// 进入时拉取(从详情返回也会刷新)
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

/** 点击单条:标记已读 → 若 linkUrl 非空则跳转(先跳转后 fire-and-forget,标记失败不影响跳转) */
async function handleClick(item: NotificationDTO) {
  if (!item.readAt) {
    // 不阻塞跳转:先标记,失败仅静默
    void markNotificationRead(item.id).catch(() => {})
    item.readAt = new Date().toISOString()
  }
  if (item.linkUrl) {
    uni.navigateTo({
      url: item.linkUrl,
      fail() {
        uni.showToast({ title: '页面不存在', icon: 'none' })
      },
    })
  }
}

/** 全部已读 */
async function handleReadAll() {
  try {
    await markAllNotificationsRead()
    list.value.forEach((n) => {
      n.readAt = n.readAt ?? new Date().toISOString()
    })
    uni.showToast({ title: '已全部标记已读', icon: 'none' })
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '操作失败', icon: 'none' })
  }
}

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

    <view v-else-if="error" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        加载失败,点击重试
      </text>
      <wd-button class="mt-4" round size="small" @click="fetchList(true)">
        重试
      </wd-button>
    </view>

    <view v-else-if="list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        暂时没有消息
      </text>
      <wd-button class="mt-4" round size="small" @click="handleBack">
        返回
      </wd-button>
    </view>

    <view v-else class="mx-4 mt-3 flex flex-col gap-3">
      <view class="flex justify-end">
        <wd-button size="small" plain round @click="handleReadAll">
          全部已读
        </wd-button>
      </view>
      <view
        v-for="n in list"
        :key="n.id"
        class="rounded-2xl bg-white p-4"
        :class="n.readAt ? 'opacity-70' : ''"
        @click="handleClick(n)"
      >
        <view class="flex items-start justify-between gap-2">
          <view class="min-w-0 flex-1">
            <text class="block truncate text-base text-[#333] font-medium">
              {{ n.title }}
            </text>
            <text class="mt-1 block text-sm text-[#666]">
              {{ n.content }}
            </text>
            <text class="mt-1 block text-xs text-[#999]">
              {{ formatDateTime(n.createdAt) }}
            </text>
          </view>
          <view
            v-if="!n.readAt"
            class="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#f44336]"
          />
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
