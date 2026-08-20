<script lang="ts" setup>
import { ref } from 'vue'
import { useUserStore } from '@/store/user'
import { deleteCircle, getMyCircles } from '@/api/circles'
import { formatDate } from '@/utils/format'
import { canCreateCircle } from '@/utils/role'
import type { CircleDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '我发布的圈子',
  },
  excludeLoginPath: false
})

/** 圈子状态展示配置 */
const STATUS_CONFIG: Record<string, { text: string, cls: string }> = {
  active: { text: '正常', cls: 'bg-[#e8f5f1] text-[#018d71]' },
  offline: { text: '已下线', cls: 'bg-[#eef0f2] text-[#666]' },
  violated: { text: '违规', cls: 'bg-[#fff1f0] text-[#ff4d4f]' },
}

const userStore = useUserStore()

const list = ref<CircleDTO[]>([])
const loading = ref(false)
const deletingId = ref<string | null>(null)

/** 拉取我创建的圈子(排除 deleted) */
async function fetchList() {
  loading.value = true
  try {
    const res = await getMyCircles({ page: 1, pageSize: 20 })
    // 后端已过滤 deleted,这里再兜底过滤一遍
    const filtered = (res.list || []).filter(c => c.status !== 'deleted')
    list.value = filtered
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

// 进入时权限校验 + 拉取
onShow(() => {
  const role = userStore.userInfo?.role
  if (!canCreateCircle(role)) {
    uni.showToast({ title: '仅传承人可访问', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 800)
    return
  }
  void fetchList()
})

/** 下拉刷新 */
onPullDownRefresh(() => {
  fetchList().finally(() => {
    uni.stopPullDownRefresh()
  })
})

/** 跳编辑页 */
function handleEdit(id: string) {
  uni.navigateTo({ url: `/pages/create-circle/create-circle?id=${id}` })
}

/** 下线圈子:showModal 确认后调 deleteCircle 软删除 */
function handleOffline(id: string, title: string) {
  if (deletingId.value)
    return
  uni.showModal({
    title: '下线圈子',
    content: `确定下线「${title}」吗?下线后不再被匹配。`,
    confirmText: '下线',
    cancelText: '取消',
    confirmColor: '#f53f3f',
    success(res) {
      if (!res.confirm)
        return
      deletingId.value = id
      deleteCircle(id)
        .then(() => {
          // 从列表移除(后端软删除,前端不再展示)
          list.value = list.value.filter(c => c.id !== id)
          uni.showToast({ title: '已下线', icon: 'success' })
        })
        .catch((e) => {
          uni.showToast({ title: (e as Error).message || '下线失败', icon: 'none' })
        })
        .finally(() => {
          deletingId.value = null
        })
    },
  })
}

/** 渲染状态 chip */
function statusCls(status: string): string {
  const cfg = STATUS_CONFIG[status]
  return cfg ? cfg.cls : 'bg-[#eef0f2] text-[#666]'
}
function statusText(status: string): string {
  const cfg = STATUS_CONFIG[status]
  return cfg ? cfg.text : status
}
</script>

<template>
  <view class="flex flex-col">
    <view class="bg-white px-4 py-4">
      <text class="block text-base text-[#333] font-semibold">
        我发布的圈子
      </text>
      <text class="mt-1 block text-xs text-[#999]">
        仅传承人可见;共 {{ list.length }} 个
      </text>
    </view>

    <view v-if="loading && list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>
    <view v-else-if="list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        你还没有发布过圈子,去创建一个吧
      </text>
    </view>
    <view v-else class="mx-4 mt-3 flex flex-col gap-3">
      <view v-for="c in list" :key="c.id" class="rounded-2xl bg-white p-4">
        <view class="flex items-start justify-between gap-2">
          <view class="min-w-0 flex-1">
            <view class="flex items-center gap-2">
              <text class="truncate text-base text-[#333] font-medium">
                {{ c.title }}
              </text>
              <text class="shrink-0 rounded-full px-2 py-0.5 text-xs" :class="statusCls(c.status)">
                {{ statusText(c.status) }}
              </text>
            </view>
            <view class="mt-1 flex items-center gap-1">
              <text class="text-xs text-[#999]">
                创建于 {{ formatDate(c.createdAt) }}
              </text>
            </view>
            <text v-if="c.activityTime" class="mt-1 block text-xs text-[#999]">
              活动时间:{{ c.activityTime }}
            </text>
          </view>
        </view>
        <view class="mt-3 flex gap-3">
          <view class="border border-[#e0e0e0] rounded-full px-4 py-1.5" @click="handleEdit(c.id)">
            <text class="text-sm text-[#666]">
              编辑
            </text>
          </view>
          <view
            class="border border-[#ffd6d6] rounded-full px-4 py-1.5"
            :class="deletingId === c.id ? 'opacity-60' : ''"
            @click="deletingId === c.id ? null : handleOffline(c.id, c.title)"
          >
            <text class="text-sm text-[#ff4d4f]">
              {{ deletingId === c.id ? '下线中...' : '下线' }}
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
