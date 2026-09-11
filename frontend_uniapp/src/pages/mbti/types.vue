<script lang="ts" setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getMbtiTypes } from '@/api/mbti'
import {
  TEMPERAMENT_COLORS,
  TEMPERAMENT_LABELS,
  getTemperament,
  TEMPERAMENT_SOFT_BG,
} from '@/utils/mbti'
import type { MbtiTypeDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '16 型人格',
  },
  excludeLoginPath: true,
})

const list = ref<MbtiTypeDTO[]>([])
const loading = ref(true)

/** 按四组气质分组展示 */
const groups = computed(() => {
  const order: Array<'analyst' | 'diplomat' | 'sentinel' | 'explorer'> = [
    'analyst',
    'diplomat',
    'sentinel',
    'explorer',
  ]
  return order.map((t) => ({
    key: t,
    label: `${TEMPERAMENT_LABELS[t]}组`,
    items: list.value.filter(item => getTemperament(item.code) === t),
  }))
})

async function loadTypes() {
  loading.value = true
  try {
    const res = await getMbtiTypes()
    list.value = res.list
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

onLoad(() => {
  void loadTypes()
})

function goDetail(code: string) {
  uni.navigateTo({ url: `/pages/mbti/type-detail?code=${code}` })
}
</script>

<template>
  <view class="min-h-screen bg-[#F7F9F8] pb-8">
    <view v-if="loading" class="flex flex-col items-center pt-24">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <view v-else class="flex flex-col gap-6 px-4 pt-4">
      <view v-for="group in groups" :key="group.key">
        <view class="mb-2 flex items-center gap-2">
          <view class="h-3.5 w-1 rounded-full" :style="{ background: TEMPERAMENT_COLORS[group.key] }" />
          <text class="text-sm font-semibold text-[#1F2D2A]">
            {{ group.label }}
          </text>
        </view>
        <!-- 2 列网格 -->
        <view class="grid grid-cols-2 gap-3">
          <view
            v-for="item in group.items"
            :key="item.code"
            class="rounded-2xl bg-white p-4 shadow-sm active:opacity-80"
            @click="goDetail(item.code)"
          >
            <view class="flex items-center justify-between">
              <text
                class="text-lg font-bold tracking-wider"
                :style="{ color: TEMPERAMENT_COLORS[group.key] }"
              >
                {{ item.code }}
              </text>
              <view
                class="rounded-full px-2 py-0.5"
                :style="{ background: TEMPERAMENT_SOFT_BG[group.key] }"
              >
                <text class="text-[11px]" :style="{ color: TEMPERAMENT_COLORS[group.key] }">
                  {{ item.name }}
                </text>
              </view>
            </view>
            <text class="mt-1.5 block text-xs leading-5 text-[#666]">
              {{ item.nickname ?? '' }}
            </text>
            <text class="mt-1 block truncate text-xs text-[#999]">
              {{ item.description }}
            </text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
