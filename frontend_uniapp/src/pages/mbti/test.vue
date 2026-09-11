<script lang="ts" setup>
import { computed, ref } from 'vue'
import { getMbtiQuestions, submitMbtiTest } from '@/api/mbti'
import { useMbtiStore } from '@/store/mbti'
import type { MbtiQuestionDTO } from '@/types'

definePage({
  layout: 'navbar',
  style: {
    navigationBarTitleText: 'MBTI 答题',
  },
  excludeLoginPath: true,
})

const mbtiStore = useMbtiStore()

const questions = ref<MbtiQuestionDTO[]>([])
const loading = ref(true)
const submitting = ref(false)
/** 当前题目下标 */
const current = ref(0)
/** 答案数组(未答为 null,与题目顺序对应) */
const answers = ref<(null | 'A' | 'B')[]>([])

const total = computed(() => questions.value.length)
const progressPercent = computed(() =>
  total.value === 0 ? 0 : Math.round(((current.value + 1) / total.value) * 100),
)
/** 是否所有题目已作答 */
const allAnswered = computed(() =>
  answers.value.length > 0 && answers.value.every(a => a !== null),
)

async function loadQuestions() {
  loading.value = true
  try {
    const res = await getMbtiQuestions()
    questions.value = res.list
    answers.value = res.list.map(() => null)
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '题目加载失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

void loadQuestions()

/** 选择选项:记录答案;非最后一题自动切下一题 */
function choose(option: 'A' | 'B') {
  if (submitting.value)
    return
  answers.value[current.value] = option
  if (current.value < total.value - 1) {
    current.value += 1
  }
}

function goPrev() {
  if (current.value > 0) {
    current.value -= 1
  }
}

/** 点击进度圆点回跳(仅可回退到已答过的题) */
function jumpTo(index: number) {
  if (index < current.value) {
    current.value = index
  }
}

async function handleSubmit() {
  if (!allAnswered.value || submitting.value)
    return
  submitting.value = true
  const finalAnswers = answers.value.filter((a): a is 'A' | 'B' => a === 'A' || a === 'B')
  try {
    const res = await submitMbtiTest(finalAnswers)
    mbtiStore.setResult(res)
    uni.redirectTo({ url: '/pages/mbti/result' })
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '提交失败,请重试', icon: 'none' })
    submitting.value = false
  }
}
</script>

<template>
  <view class="min-h-screen bg-[#F7F9F8]">
    <!-- 顶部进度 -->
    <view class="bg-white px-5 pb-4 pt-4">
      <view class="mb-2 flex items-center justify-between">
        <text class="text-sm text-[#018d71] font-medium">
          第 {{ current + 1 }} / {{ total }} 题
        </text>
        <text class="text-xs text-[#999]">
          已答 {{ answers.filter(a => a !== null).length }} / {{ total }}
        </text>
      </view>
      <view class="h-1.5 w-full overflow-hidden rounded-full bg-[#e8f0ee]">
        <view
          class="h-full rounded-full transition-all duration-300"
          style="background: linear-gradient(90deg, #02a887, #018d71)"
          :style="{ width: `${progressPercent}%` }"
        />
      </view>
      <!-- 答题点阵(可点击回退) -->
      <view class="mt-3 flex flex-wrap gap-1.5">
        <view
          v-for="(a, i) in answers"
          :key="i"
          class="h-2 w-2 rounded-full transition-all"
          :class="[
            i === current ? 'scale-125 bg-[#018d71]' : a ? 'bg-[#8fd4c6]' : 'bg-[#dfe7e5]',
          ]"
          @click="jumpTo(i)"
        />
      </view>
    </view>

    <view v-if="loading" class="flex flex-col items-center pt-24">
      <text class="text-sm text-[#999]">
        题目加载中...
      </text>
    </view>

    <view v-else-if="questions.length === 0" class="flex flex-col items-center pt-24">
      <text class="text-5xl">
        😵
      </text>
      <text class="mt-4 text-sm text-[#999]">
        题目加载失败或题库暂未配置
      </text>
      <wd-button class="mt-5" round size="small" @click="loadQuestions">
        重新加载
      </wd-button>
    </view>

    <view v-else class="px-5">
      <!-- 题干卡片 + 选项(key 变化触发整体重新渲染) -->
      <view :key="current" class="mt-5 flex flex-col gap-4">
        <view class="rounded-3xl bg-white p-6 shadow-sm">
          <view class="mb-3 flex items-center gap-2">
            <view class="rounded-full bg-[#e8f5f1] px-2.5 py-0.5">
              <text class="text-xs text-[#018d71]">
                Q{{ current + 1 }}
              </text>
            </view>
            <text class="text-xs text-[#bbb]">
              {{ questions[current].dimension === 'EI' ? '能量倾向' : questions[current].dimension === 'SN' ? '认知方式' : questions[current].dimension === 'TF' ? '决策方式' : '生活方式' }}
            </text>
          </view>
          <text class="block text-[19px] leading-relaxed text-[#1F2D2A] font-medium">
            {{ questions[current].stem }}
          </text>
        </view>

        <!-- 选项 -->
        <view
          class="rounded-2xl bg-white p-5 shadow-sm transition-transform active:scale-[0.98]"
          :class="answers[current] === 'A' ? 'border-2 border-[#018d71] bg-[#f0faf7]' : 'border border-transparent'"
          @click="choose('A')"
        >
          <view class="flex items-center gap-3">
            <view
              class="h-8 w-8 flex shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              :class="answers[current] === 'A' ? 'bg-[#018d71] text-white' : 'bg-[#f0f3f2] text-[#666]'"
            >
              A
            </view>
            <text class="text-[15px] text-[#333]">
              {{ questions[current].optionA }}
            </text>
          </view>
        </view>

        <view
          class="rounded-2xl bg-white p-5 shadow-sm transition-transform active:scale-[0.98]"
          :class="answers[current] === 'B' ? 'border-2 border-[#018d71] bg-[#f0faf7]' : 'border border-transparent'"
          @click="choose('B')"
        >
          <view class="flex items-center gap-3">
            <view
              class="h-8 w-8 flex shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              :class="answers[current] === 'B' ? 'bg-[#018d71] text-white' : 'bg-[#f0f3f2] text-[#666]'"
            >
              B
            </view>
            <text class="text-[15px] text-[#333]">
              {{ questions[current].optionB }}
            </text>
          </view>
        </view>

        <!-- 底部操作 -->
        <view class="mt-2 mb-8 flex items-center gap-3">
          <wd-button plain round :disabled="current === 0" custom-class="flex-1" @click="goPrev">
            上一题
          </wd-button>
          <wd-button
            round
            custom-class="flex-1"
            :disabled="!allAnswered"
            :loading="submitting"
            @click="handleSubmit"
          >
            {{ allAnswered ? '查看结果' : `答完 ${total} 题出结果` }}
          </wd-button>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
