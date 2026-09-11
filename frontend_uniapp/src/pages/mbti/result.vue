<script lang="ts" setup>
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getMbtiRecord, getMbtiTypeDetail } from '@/api/mbti'
import { useMbtiStore } from '@/store/mbti'
import { useUserStore } from '@/store/user'
import { goHomeMatchWithTags } from '@/utils/matchLink'
import { toLoginPage } from '@/utils/toLoginPage'
import {
  TEMPERAMENT_COLORS,
  dimensionPercent,
  getTemperament,
  getTypeGradient,
} from '@/utils/mbti'
import type {
  MbtiDimensionScoreDTO,
  MbtiHobbyRecommendationDTO,
  MbtiSubmitResultDTO,
  MbtiTypeDTO,
} from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '测试结果',
  },
  excludeLoginPath: true,
})

const mbtiStore = useMbtiStore()
const userStore = useUserStore()

const loading = ref(true)
const type = ref<MbtiTypeDTO | null>(null)
const dimensionScores = ref<MbtiDimensionScoreDTO[]>([])
const recommendations = ref<MbtiHobbyRecommendationDTO[]>([])
/** 本次结果是否已保存(登录用户提交时后端已落库) */
const saved = ref(false)

/** 气质组(徽章配色) */
const temperament = computed(() => getTemperament(type.value?.code ?? ''))
const badgeGradient = computed(() => getTypeGradient(type.value?.code ?? ''))

/** 维度得分条数据 */
const dimensionBars = computed(() =>
  dimensionScores.value.map((d) => {
    const percent = dimensionPercent(d.firstCount, d.secondCount)
    return {
      dimension: d.dimension,
      first: d.first,
      second: d.second,
      percent,
    }
  }),
)

/** 支持两种进入方式:测试提交(从 store 读) / 历史记录(带 recordId 从接口拉) */
async function loadResult(recordId?: string) {
  loading.value = true
  try {
    if (recordId) {
      const record = await getMbtiRecord(recordId)
      const detail = await getMbtiTypeDetail(record.resultType)
      type.value = detail
      dimensionScores.value = record.dimensionScores
      recommendations.value = detail.recommendations
      saved.value = true
    }
    else if (mbtiStore.lastResult) {
      const res: MbtiSubmitResultDTO = mbtiStore.lastResult
      type.value = res.type
      dimensionScores.value = res.dimensionScores
      recommendations.value = res.recommendations
      saved.value = res.saved
    }
    else {
      uni.showToast({ title: '暂无测试结果', icon: 'none' })
      setTimeout(() => uni.redirectTo({ url: '/pages/mbti/intro' }), 800)
      return
    }
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '结果加载失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

onLoad((query) => {
  const recordId = (query as { recordId?: string })?.recordId
  void loadResult(recordId)
})

/** 重新测试 */
function retake() {
  uni.redirectTo({ url: '/pages/mbti/test' })
}

/** 查看历史(未登录引导登录) */
function goHistory() {
  if (!userStore.isLoggedIn) {
    uni.showToast({ title: '登录后可查看历史', icon: 'none' })
    toLoginPage()
    return
  }
  uni.navigateTo({ url: '/pages/mbti/history' })
}

/** 找同趣的人与圈子:携带该兴趣跳首页匹配(匹配接口未强制登录,游客同样可用) */
function goFindMatch(tagName: string) {
  goHomeMatchWithTags([tagName])
}

function saveResultHint() {
  if (saved.value) {
    uni.showToast({ title: '本次结果已保存到历史', icon: 'none' })
  }
  else {
    uni.showToast({ title: '登录后自动保存测试记录', icon: 'none' })
    toLoginPage()
  }
}
</script>

<template>
  <view class="min-h-screen bg-[#F7F9F8] pb-8">
    <view v-if="loading" class="flex flex-col items-center pt-24">
      <text class="text-sm text-[#999]">
        结果生成中...
      </text>
    </view>

    <view v-else-if="type" class="flex flex-col">
      <!-- 结果徽章 -->
      <view class="relative overflow-hidden px-6 pb-12 pt-10 text-center" :style="{ background: badgeGradient }">
        <view class="pointer-events-none absolute -top-8 -right-8 h-36 w-36 rounded-full bg-white opacity-10" />
        <view class="pointer-events-none absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-white opacity-8" />
        <text class="block text-[13px] tracking-[6px] text-white/80">
          YOUR PERSONALITY TYPE
        </text>
        <text class="mt-2 block text-[44px] text-white font-bold leading-tight tracking-wider">
          {{ type.code }}
        </text>
        <view class="mt-1 flex items-center justify-center gap-2">
          <text class="text-lg text-white font-medium">
            {{ type.name }}
          </text>
          <view class="rounded-full bg-white/20 px-2 py-0.5">
            <text class="text-xs text-white">
              {{ temperament === 'analyst' ? '分析家' : temperament === 'diplomat' ? '外交家' : temperament === 'sentinel' ? '守护者' : '探险家' }}
            </text>
          </view>
        </view>
        <text v-if="type.nickname" class="mt-1 block text-sm text-white/85">
          {{ type.nickname }}
        </text>
      </view>

      <!-- 类型描述 + 得分条(卡片上浮) -->
      <view class="relative mx-4 -mt-8 rounded-3xl bg-white p-5 shadow-sm">
        <text class="block text-[15px] leading-relaxed text-[#333]">
          {{ type.description }}
        </text>

        <!-- 四维得分条 -->
        <view class="mt-5 flex flex-col gap-4">
          <view v-for="d in dimensionBars" :key="d.dimension">
            <view class="mb-1 flex items-center justify-between text-xs">
              <text class="text-[#1F2D2A] font-medium" :class="d.percent >= 50 ? 'text-[#018d71]' : 'text-[#999]'">
                {{ d.first }}
              </text>
              <text class="text-[#bbb]">
                {{ d.dimension }}
              </text>
              <text class="text-[#1F2D2A] font-medium" :class="d.percent < 50 ? 'text-[#018d71]' : 'text-[#999]'">
                {{ d.second }}
              </text>
            </view>
            <!-- 双端对齐比例条 -->
            <view class="h-2 w-full overflow-hidden rounded-full bg-[#e8f0ee]">
              <view
                class="h-full rounded-full transition-all duration-700"
                style="background: linear-gradient(90deg, #02a887, #018d71)"
                :style="{ width: `${d.percent}%`, marginLeft: '0' }"
              />
            </view>
            <text class="mt-0.5 block text-right text-[11px] text-[#bbb]">
              {{ d.percent }}% {{ d.first }} · {{ 100 - d.percent }}% {{ d.second }}
            </text>
          </view>
        </view>
      </view>

      <!-- 兴趣推荐 -->
      <view class="mx-4 mt-5">
        <view class="mb-3 flex items-center justify-between">
          <text class="text-base font-semibold text-[#1F2D2A]">
            为你推荐的兴趣爱好
          </text>
          <text class="text-xs text-[#999]">
            来自趣邻圈兴趣库
          </text>
        </view>

        <view class="flex flex-col gap-3">
          <view
            v-for="(rec, i) in recommendations"
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
                <view
                  v-if="rec.categoryName"
                  class="rounded-full px-2 py-0.5"
                  :style="{ background: 'rgba(1,141,113,0.08)' }"
                >
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

          <view v-if="recommendations.length === 0" class="rounded-2xl bg-white p-6 text-center">
            <text class="text-sm text-[#999]">
              暂无推荐内容,敬请期待
            </text>
          </view>
        </view>
      </view>

      <!-- 优势 / 弱点 -->
      <view class="mx-4 mt-5 grid grid-cols-2 gap-3">
        <view class="rounded-2xl bg-white p-4">
          <text class="mb-2 block text-sm font-semibold text-[#02A887]">
            优势特质
          </text>
          <text v-for="s in type.strengths" :key="s" class="block text-xs text-[#666] leading-6">
            · {{ s }}
          </text>
        </view>
        <view class="rounded-2xl bg-white p-4">
          <text class="mb-2 block text-sm font-semibold text-[#E85D5D]">
            注意事项
          </text>
          <text v-for="w in type.weaknesses" :key="w" class="block text-xs text-[#666] leading-6">
            · {{ w }}
          </text>
        </view>
      </view>

      <!-- 底部操作 -->
      <view class="mx-4 mt-6 flex flex-col gap-3">
        <wd-button round block @click="retake">
          重新测试
        </wd-button>
        <view class="flex gap-3">
          <wd-button plain round block @click="saveResultHint">
            {{ saved ? '已保存到历史' : '保存记录' }}
          </wd-button>
          <wd-button plain round block @click="goHistory">
            查看历史
          </wd-button>
        </view>
        <text class="mt-2 text-center text-xs text-[#bbb]">
          非官方测试,结果仅供兴趣推荐参考
        </text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
