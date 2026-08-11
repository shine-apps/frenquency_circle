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

// 预填:store 中已有的标签 ID 列表
const initialIds = computed(() => (userStore.userInfo.tags ? userStore.userInfo.tags.map(t => t.id) : []))
// 已选 ID 列表(可变)
const selectedIds = ref<string[]>(initialIds.value)
// 提交中状态(防重复点击)
const submitting = ref(false)

const count = computed(() => selectedIds.value.length)

/** 完成:持久化并返回 */
async function handleComplete() {
  if (count.value === 0) {
    uni.showToast({ title: '请至少选择 1 个兴趣', icon: 'none' })
    return
  }
  if (submitting.value) return
  submitting.value = true
  try {
    const tags = await updateMyTags(selectedIds.value)
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
      :selected-ids="selectedIds"
      :max="MAX_TAGS"
      :selected-tags="userStore.userInfo.tags"
      @update:selectedIds="selectedIds = $event"
    />
  </view>
</template>

<style lang="scss" scoped>
//
</style>
