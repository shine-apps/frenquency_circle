<script lang="ts" setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getFollowedUsers } from '@/api/users'
import { activityLevelText, formatDate } from '@/utils/format'
import type { FollowedUserDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '我关注的人',
    enablePullDownRefresh: true,
  },
  excludeLoginPath: false,
})

const PAGE_SIZE = 20

/** 标签展示最大数量 */
const MAX_TAG_VISIBLE = 3

const list = ref<FollowedUserDTO[]>([])
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
    const res = await getFollowedUsers({ page: page.value, pageSize: PAGE_SIZE })
    list.value = reset ? res.list : [...list.value, ...res.list]
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

// 进入时拉取(从主页返回也会触发 onShow 刷新)
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

/** 跳对方主页 */
function handleUserClick(userId: string) {
  uni.navigateTo({ url: `/pages/user-home/user-home?id=${userId}` })
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
  <view class="flex flex-col">
    <view v-if="loading && list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <view v-else-if="list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        还没有关注任何人,去首页发现吧
      </text>
      <wd-button class="mt-4" round size="small" @click="handleBack">
        返回
      </wd-button>
    </view>

    <view v-else class="mx-4 mt-3 flex flex-col gap-3">
      <view
        v-for="u in list"
        :key="u.id"
        class="rounded-2xl bg-white p-4"
        @click="handleUserClick(u.id)"
      >
        <view class="flex items-center gap-3">
          <view class="h-12 w-12 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1]">
            <image v-if="u.avatarUrl" :src="u.avatarUrl" class="h-full w-full" mode="aspectFill" />
            <text v-else class="text-lg text-[#018d71] font-medium">
              {{ u.name ? u.name[0] : '?' }}
            </text>
          </view>
          <view class="min-w-0 flex-1">
            <view class="flex items-center justify-between">
              <text class="truncate text-base text-[#333] font-medium">
                {{ u.name }}
              </text>
              <text class="shrink-0 text-xs text-[#999]">
                {{ activityLevelText(u.activityLevel) }}
              </text>
            </view>
            <text class="mt-0.5 block text-xs text-[#999]">
              关注于 {{ formatDate(u.followedAt) }}
            </text>
          </view>
        </view>
        <view v-if="u.tags.length > 0" class="mt-3 flex flex-wrap gap-2">
          <template v-for="(name, i) in u.tags" :key="name">
            <text v-if="i < MAX_TAG_VISIBLE" class="rounded-full bg-[#e8f5f1] px-2.5 py-1 text-xs text-[#018d71]">
              {{ name }}
            </text>
          </template>
          <text v-if="u.tags.length > MAX_TAG_VISIBLE" class="text-xs text-[#999]">
            +{{ u.tags.length - MAX_TAG_VISIBLE }}
          </text>
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
