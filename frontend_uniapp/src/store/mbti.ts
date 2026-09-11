import type { MbtiSubmitResultDTO } from '@/types'
import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * MBTI 测试会话 Store。
 * 暂存最近一次提交的测试结果,供答题页 → 结果页传递
 * (结果数据较大,不适合走页面 query 参数;历史记录详情走接口拉取)。
 */
export const useMbtiStore = defineStore('mbti', () => {
  /** 最近一次提交的完整结果(类型 + 得分 + 推荐) */
  const lastResult = ref<MbtiSubmitResultDTO | null>(null)

  function setResult(result: MbtiSubmitResultDTO) {
    lastResult.value = result
  }

  function clear() {
    lastResult.value = null
  }

  return { lastResult, setResult, clear }
})
