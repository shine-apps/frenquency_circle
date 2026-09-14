<script lang="ts" setup>
/**
 * 我的打卡:本人发布过的全部打卡(含纯文字),支持删除自己的打卡(软删除)。
 *
 * - 按发布时间倒序分页,支持下拉刷新 / 触底加载;
 * - 删除前二次确认,成功后从列表移除并同步总数。
 */
import { computed, ref } from 'vue'
import { onReachBottom, onShow } from '@dcloudio/uni-app'
import { deleteCheckin, getMyCheckins } from '@/api/checkins'
import CheckinCard from '@/components/CheckinCard/CheckinCard.vue'
import type { CheckinDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '我的打卡',
    enablePullDownRefresh: true,
  },
  excludeLoginPath: false,
})

const PAGE_SIZE = 20

const list = ref<CheckinDTO[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const finished = ref(false)

/** 已加载列表中带图片或视频的条数(用于概览提示) */
const mediaCount = computed(() => list.value.filter(i => i.images.length > 0 || !!i.videoUrl).length)

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
    const res = await getMyCheckins({ page: page.value, pageSize: PAGE_SIZE })
    list.value = reset ? res.list : [...list.value, ...res.list]
    total.value = res.total
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

// 每次进入刷新一次(发布 / 删除后回到本页保持最新)
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

/** 删除打卡:二次确认后软删除并从列表移除 */
function handleDelete(checkin: CheckinDTO) {
  uni.showModal({
    title: '删除打卡',
    content: '删除后将不再出现在打卡广场与圈子打卡中,确定删除吗?',
    confirmColor: '#ee0a24',
    success: (res) => {
      if (!res.confirm)
        return
      void doDelete(checkin.id)
    },
  })
}

/** 执行删除 */
async function doDelete(id: string) {
  try {
    await deleteCheckin(id)
    list.value = list.value.filter(i => i.id !== id)
    total.value = Math.max(0, total.value - 1)
    uni.showToast({ title: '已删除', icon: 'success' })
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '删除失败', icon: 'none' })
  }
}

/** 去发布打卡 */
function handleCreate() {
  uni.navigateTo({ url: '/pages/create-checkin/create-checkin' })
}

/** 跳圈子详情 */
function handleCircle(circleId: string) {
  uni.navigateTo({ url: `/pages/circle/circle?id=${circleId}` })
}

/** 跳打卡详情(分享落地页) */
function handleCheckinTap(checkin: CheckinDTO) {
  uni.navigateTo({ url: `/pages/checkin-detail/checkin-detail?id=${checkin.id}` })
}
</script>

<template>
  <view class="min-h-screen flex flex-col bg-[#f7f8fa]">
    <!-- 概览卡 -->
    <view class="mx-4 mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-4">
      <view class="flex flex-col">
        <text class="text-xs text-[#999]">
          打卡总数
        </text>
        <text class="mt-1 text-2xl text-[#018d71] font-semibold">
          {{ total }}
        </text>
      </view>
      <view class="flex flex-col items-end">
        <text class="text-xs text-[#999]">
          已加载中含图片/视频
        </text>
        <text class="mt-1 text-sm text-[#333] font-medium">
          {{ mediaCount }} 条
        </text>
      </view>
    </view>

    <!-- 加载中 -->
    <view v-if="loading && list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <!-- 空态 -->
    <view v-else-if="list.length === 0" class="flex flex-col items-center pt-20">
      <text class="i-carbon-calendar-heat-map text-5xl text-[#d9d9d9]" />
      <text class="mt-4 text-sm text-[#999]">
        还没有打卡,去发布第一条吧
      </text>
      <wd-button class="mt-4" round size="small" @click="handleCreate">
        发布打卡
      </wd-button>
    </view>

    <!-- 打卡列表 -->
    <view v-else class="mx-4 mt-3 flex flex-col gap-3 pb-24">
      <CheckinCard
        v-for="item in list"
        :key="item.id"
        :checkin="item"
        clickable
        show-delete
        @tap="handleCheckinTap"
        @delete="handleDelete"
        @circle="handleCircle"
      />
      <text v-if="finished" class="py-3 text-center text-xs text-[#999]">
        没有更多了
      </text>
      <text v-else-if="loading" class="py-3 text-center text-xs text-[#999]">
        加载中...
      </text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
