<script lang="ts" setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getMbtiTypeDetail } from '@/api/mbti'
import { goHomeMatchWithTags } from '@/utils/matchLink'
import {
  TEMPERAMENT_COLORS,
  getTemperament,
  getTypeGradient,
} from '@/utils/mbti'
import type { MbtiTypeDetailDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '人格详情',
  },
  excludeLoginPath: true,
})

const detail = ref<MbtiTypeDetailDTO | null>(null)
const loading = ref(true)

const temperament = computed(() => getTemperament(detail.value?.code ?? ''))
const badgeGradient = computed(() => getTypeGradient(detail.value?.code ?? ''))

async function loadDetail(code: string) {
  loading.value = true
  try {
    detail.value = await getMbtiTypeDetail(code)
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

onLoad((query) => {
  const code = (query as { code?: string })?.code
  if (!code) {
    uni.showToast({ title: '参数缺失', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 800)
    return
  }
  void loadDetail(code)
})

/** 去测一测(进入答题页) */
function goTest() {
  uni.redirectTo({ url: '/pages/mbti/test' })
}

/** 找同趣的人与圈子:携带该兴趣跳首页匹配(匹配接口未强制登录,游客同样可用) */
function goFindMatch(tagName: string) {
  goHomeMatchWithTags([tagName])
}
</script>

<template>
  <view class="min-h-screen bg-[#F7F9F8] pb-8">
    <view v-if="loading" class="flex flex-col items-center pt-24">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <view v-else-if="detail" class="flex flex-col">
      <!-- 类型徽章 -->
      <view class="relative overflow-hidden px-6 pb-12 pt-10 text-center" :style="{ background: badgeGradient }">
        <view class="pointer-events-none absolute -top-8 -right-8 h-36 w-36 rounded-full bg-white opacity-10" />
        <text class="block text-[13px] tracking-[6px] text-white/80">
          PERSONALITY TYPE
        </text>
        <text class="mt-2 block text-[44px] text-white font-bold leading-tight tracking-wider">
          {{ detail.code }}
        </text>
        <text class="mt-1 block text-lg text-white font-medium">
          {{ detail.name }}
        </text>
        <text v-if="detail.nickname" class="mt-1 block text-sm text-white/85">
          {{ detail.nickname }}
        </text>
      </view>

      <!-- 描述与特质 -->
      <view class="relative mx-4 -mt-8 rounded-3xl bg-white p-5 shadow-sm">
        <text class="block text-[15px] leading-relaxed text-[#333]">
          {{ detail.description }}
        </text>
        <view class="mt-4 grid grid-cols-2 gap-3">
          <view class="rounded-2xl bg-[#F7F9F8] p-3">
            <text class="mb-1.5 block text-xs font-semibold text-[#02A887]">
              优势
            </text>
            <text v-for="s in detail.strengths" :key="s" class="block text-xs text-[#666] leading-6">
              · {{ s }}
            </text>
          </view>
          <view class="rounded-2xl bg-[#F7F9F8] p-3">
            <text class="mb-1.5 block text-xs font-semibold text-[#E85D5D]">
              注意
            </text>
            <text v-for="w in detail.weaknesses" :key="w" class="block text-xs text-[#666] leading-6">
              · {{ w }}
            </text>
          </view>
        </view>
      </view>

      <!-- 爱好推荐 -->
      <view class="mx-4 mt-5">
        <view class="mb-3 flex items-center justify-between">
          <text class="text-base font-semibold text-[#1F2D2A]">
            {{ detail.code }} 适合的兴趣爱好
          </text>
          <text class="text-xs text-[#999]">
            按匹配度排序
          </text>
        </view>
        <view class="flex flex-col gap-3">
          <view
            v-for="(rec, i) in detail.recommendations"
            :key="rec.hobbyTagId"
            class="rounded-2xl bg-white p-4 shadow-sm"
          >
            <view class="flex items-center justify-between gap-2">
              <view class="flex items-center gap-2">
                <view
                  class="flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold text-white"
                  :style="{ background: TEMPERAMENT_COLORS[temperament], opacity: 1 - i * 0.08 }"
                >
                  {{ i + 1 }}
                </view>
                <text class="text-base font-medium text-[#1F2D2A]">
                  {{ rec.tagName }}
                </text>
                <view v-if="rec.categoryName" class="rounded-full bg-[rgba(1,141,113,0.08)] px-2 py-0.5">
                  <text class="text-xs text-[#018d71]">
                    {{ rec.categoryName }}
                  </text>
                </view>
              </view>
              <view class="rounded-full bg-[#e8f5f1] px-2.5 py-1">
                <text class="text-xs text-[#018d71] font-semibold">
                  匹配 {{ rec.matchProbability }}%
                </text>
              </view>
            </view>
            <text class="mt-2 block text-sm leading-relaxed text-[#666]">
              {{ rec.reason }}
            </text>
            <view class="mt-3 flex justify-end">
              <wd-button type="primary" size="small" round @click="goFindMatch(rec.tagName)">
                找同趣的人与圈子
              </wd-button>
            </view>
          </view>

          <view v-if="detail.recommendations.length === 0" class="rounded-2xl bg-white p-6 text-center">
            <text class="text-sm text-[#999]">
              暂无推荐内容,敬请期待
            </text>
          </view>
        </view>
      </view>

      <!-- 去测试 -->
      <view class="mx-4 mt-6">
        <wd-button round block @click="goTest">
          还没测过?去测一测
        </wd-button>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
