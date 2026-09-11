<script lang="ts" setup>
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getMbtiRecords } from '@/api/mbti'
import { useUserStore } from '@/store/user'
import { toLoginPage } from '@/utils/toLoginPage'
import { getTypeGradient } from '@/utils/mbti'
import { formatDateTime } from '@/utils/format'
import type { MbtiTestRecordDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: 'MBTI 历史记录',
  },
  excludeLoginPath: false,
})

const userStore = useUserStore()

const list = ref<MbtiTestRecordDTO[]>([])
const loading = ref(true)
const error = ref(false)

async function fetchList() {
  loading.value = true
  error.value = false
  try {
    const res = await getMbtiRecords()
    list.value = res.list
  }
  catch (e) {
    error.value = true
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

onShow(() => {
  if (!userStore.isLoggedIn) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    toLoginPage()
    return
  }
  void fetchList()
})

function goDetail(item: MbtiTestRecordDTO) {
  uni.navigateTo({ url: `/pages/mbti/result?recordId=${item.id}` })
}

function goIntro() {
  uni.redirectTo({ url: '/pages/mbti/intro' })
}
</script>

<template>
  <view class="min-h-screen bg-[#F7F9F8]">
    <view v-if="loading" class="flex flex-col items-center pt-24">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <view v-else-if="error" class="flex flex-col items-center pt-24">
      <text class="text-sm text-[#999]">
        加载失败
      </text>
      <wd-button class="mt-4" round size="small" @click="fetchList">
        重试
      </wd-button>
    </view>

    <!-- 空态引导 -->
    <view v-else-if="list.length === 0" class="flex flex-col items-center pt-24">
      <text class="text-5xl">
        🗳️
      </text>
      <text class="mt-4 text-sm text-[#999]">
        还没有测试记录
      </text>
      <wd-button class="mt-5" round @click="goIntro">
        去做一次测试
      </wd-button>
    </view>

    <view v-else class="mx-4 mt-4 flex flex-col gap-3">
      <view
        v-for="item in list"
        :key="item.id"
        class="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-sm active:opacity-80"
        @click="goDetail(item)"
      >
        <!-- 类型徽章 -->
        <view
          class="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl"
          :style="{ background: getTypeGradient(item.resultType) }"
        >
          <text class="text-sm text-white font-bold tracking-wide">
            {{ item.resultType }}
          </text>
        </view>
        <view class="min-w-0 flex-1">
          <view class="flex flex-wrap gap-1.5">
            <view
              v-for="d in item.dimensionScores"
              :key="d.dimension"
              class="rounded-full bg-[#f0f3f2] px-2 py-0.5"
            >
              <text class="text-[11px] text-[#666]">
                {{ d.dimension }}
              </text>
            </view>
          </view>
          <text class="mt-1.5 block text-xs text-[#999]">
            {{ formatDateTime(item.createdAt) }}
          </text>
        </view>
        <text class="shrink-0 text-sm text-[#bbb]">
          ›
        </text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
