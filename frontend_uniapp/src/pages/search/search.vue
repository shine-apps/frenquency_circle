<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useUserStore } from '@/store/user'
import { updateMyTags } from '@/api/auth'

definePage({
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
    uni.showToast({ title: (e as Error).message || '保存失败', icon: 'none' })
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <view class="flex min-h-screen flex-col bg-white pb-32">
    <!-- 顶部操作栏:展示已选数量 + 完成按钮 -->
    <view class="flex items-center justify-between border-b border-[#f2f2f2] px-4 py-3">
      <text class="text-sm text-[#999]">
        已选 {{ count }}/{{ MAX_TAGS }}
      </text>
      <wd-button
        size="small"
        :disabled="count === 0 || submitting"
        :loading="submitting"
        @click="handleComplete"
      >
        完成{{ count > 0 ? `(${count})` : '' }}
      </wd-button>
    </view>

    <TagSelector
      :selected-tags="selectedTags"
      :max="MAX_TAGS"
      @update:selected-tags="selectedTags = $event"
    />
  </view>
</template>

<style lang="scss" scoped>
//
</style>
