<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useUserStore } from '@/store/user'
import { updateMyTags } from '@/api/auth'

definePage({
  // 兴趣标签选择页
  style: {
    navigationBarTitleText: '选择兴趣',
  },
})

/** 兴趣标签最大数量(与后端一致) */
const MAX_TAGS = 10

const userStore = useUserStore()

// 预填:store 中已有的标签名称列表
const initialTags = computed(() => (userStore.userInfo.tags ? userStore.userInfo.tags : []))
// 已选名称列表(可变,存 hobby_tags.name)
const selectedTags = ref<string[]>(initialTags.value)
// 提交中状态(防重复点击)
const submitting = ref(false)

const count = computed(() => selectedTags.value.length)
const canSubmit = computed(() => count.value > 0 && !submitting.value)

/** 完成:持久化并返回 */
async function handleComplete() {
  if (count.value === 0) {
    uni.showToast({ title: '请至少选择 1 个兴趣', icon: 'none' })
    return
  }
  if (submitting.value) return
  submitting.value = true
  try {
    const tags = await updateMyTags(selectedTags.value)
    // 同步到 store
    userStore.setTags(tags)
    uni.showToast({ title: '已保存', icon: 'success' })
    setTimeout(() => {
      uni.navigateBack()
    }, 400)
  }
  catch (e) {
    console.error('[search] handleComplete failed:', e)
    uni.showToast({ title: (e as Error).message || '保存失败', icon: 'none' })
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <view class="flex min-h-screen flex-col bg-[#f7f8fa]">
    <!-- 顶部品牌渐变 -->
    <view class="bg-gradient-to-b from-[#018d71] to-[#0aa07f] px-5 pb-4 pt-safe">
      <text class="text-lg font-semibold text-white">
        选择你的兴趣
      </text>
      <text class="mt-1 block text-xs text-white/80">
        1~{{ MAX_TAGS }} 个兴趣标签,帮助发现同频的人与圈子
      </text>
    </view>

    <!-- 操作栏:已选数量 + 完成按钮 -->
    <view class="flex items-center justify-between bg-white px-4 py-3 shadow-sm">
      <text class="text-sm text-[#999]">
        已选 {{ count }}/{{ MAX_TAGS }}
      </text>
      <button
        class="rounded-full px-5 py-2 text-sm text-white disabled:opacity-50 active:scale-95"
        :class="canSubmit ? 'bg-[#018d71]' : 'bg-[#cccccc]'"
        :disabled="!canSubmit"
        :loading="submitting"
        @click="handleComplete"
      >
        完成{{ count > 0 ? `(${count})` : '' }}
      </button>
    </view>

    <view class="flex-1">
      <TagSelector
        :selected-tags="selectedTags"
        :max="MAX_TAGS"
        @update:selected-tags="selectedTags = $event"
      />
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>