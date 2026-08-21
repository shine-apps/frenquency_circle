<script lang="ts" setup>
/**
 * 我的活动管理页(TEACHER / ADMIN 专属,与圈子解耦)。
 *
 * 调 GET /api/activities?mine=1 拉取自己发布的活动(含已取消)。
 * 支持:发布新活动、编辑、取消(软取消)、查看详情。
 */
import { ref } from 'vue'
import { useUserStore } from '@/store/user'
import { cancelActivity, getActivities } from '@/api/activities'
import { formatDateTime } from '@/utils/format'
import { canCreateCircle } from '@/utils/role'
import type { ActivityDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '活动管理',
  },
  excludeLoginPath: false,
})

/** 活动状态展示配置 */
const STATUS_CONFIG: Record<string, { text: string, cls: string }> = {
  active: { text: '进行中', cls: 'bg-[#e8f5f1] text-[#018d71]' },
  cancelled: { text: '已取消', cls: 'bg-[#eef0f2] text-[#666]' },
}

const userStore = useUserStore()

const list = ref<ActivityDTO[]>([])
const loading = ref(false)
const cancellingId = ref<string | null>(null)

async function fetchList() {
  loading.value = true
  try {
    const res = await getActivities({ mine: true, page: 1, pageSize: 20 })
    list.value = res?.list || []
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

onPullDownRefresh(() => {
  fetchList().finally(() => {
    uni.stopPullDownRefresh()
  })
})

/** 发布新活动 */
function handleCreate() {
  uni.navigateTo({ url: '/pages/create-activity/create-activity' })
}

/** 编辑活动 */
function handleEdit(id: string) {
  uni.navigateTo({ url: `/pages/create-activity/create-activity?activityId=${id}` })
}

/** 查看详情 */
function handleDetail(id: string) {
  uni.navigateTo({ url: `/pages/activity/activity?activityId=${id}` })
}

/** 取消活动:showModal 确认后调 cancelActivity 软取消 */
function handleCancel(id: string, title: string) {
  if (cancellingId.value)
    return
  uni.showModal({
    title: '取消活动',
    content: `确定取消「${title}」吗?取消后不再对外展示。`,
    confirmText: '取消活动',
    cancelText: '再想想',
    confirmColor: '#f53f3f',
    success(res) {
      if (!res.confirm)
        return
      cancellingId.value = id
      cancelActivity(id)
        .then(() => {
          // 本地标记为已取消(后端软取消)
          const target = list.value.find(a => a.id === id)
          if (target)
            target.status = 'cancelled'
          uni.showToast({ title: '已取消', icon: 'success' })
        })
        .catch((e) => {
          uni.showToast({ title: (e as Error).message || '取消失败', icon: 'none' })
        })
        .finally(() => {
          cancellingId.value = null
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
        活动管理
      </text>
      <text class="mt-1 block text-xs text-[#999]">
        传承人专属;共 {{ list.length }} 个活动
      </text>
    </view>

    <view v-if="loading && list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>
    <view v-else-if="list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        你还没有发布过活动,点击下方按钮创建
      </text>
    </view>
    <view v-else class="mx-4 mt-3 flex flex-col gap-3">
      <view v-for="a in list" :key="a.id" class="rounded-2xl bg-white p-4">
        <view class="flex items-start justify-between gap-2" @click="handleDetail(a.id)">
          <view class="min-w-0 flex-1">
            <view class="flex items-center gap-2">
              <text class="truncate text-base text-[#333] font-medium">
                {{ a.title }}
              </text>
              <text class="shrink-0 rounded-full px-2 py-0.5 text-xs" :class="statusCls(a.status)">
                {{ statusText(a.status) }}
              </text>
            </view>
            <view class="mt-1 flex flex-col gap-0.5">
              <text class="text-xs text-[#999]">
                起始 {{ formatDateTime(a.startTime) }}
              </text>
              <text class="text-xs text-[#999]">
                报名截止 {{ formatDateTime(a.registrationDeadline) }}
              </text>
            </view>
          </view>
        </view>
        <view class="mt-3 flex gap-3">
          <view class="border border-[#e0e0e0] rounded-full px-4 py-1.5" @click="handleEdit(a.id)">
            <text class="text-sm text-[#666]">
              编辑
            </text>
          </view>
          <view
            v-if="a.status !== 'cancelled'"
            class="border border-[#ffd6d6] rounded-full px-4 py-1.5"
            :class="cancellingId === a.id ? 'opacity-60' : ''"
            @click="cancellingId === a.id ? null : handleCancel(a.id, a.title)"
          >
            <text class="text-sm text-[#ff4d4f]">
              {{ cancellingId === a.id ? '取消中...' : '取消' }}
            </text>
          </view>
        </view>
      </view>
    </view>

    <!-- 发布新活动按钮(悬浮) -->
    <view v-if="list.length > 0" class="fixed bottom-6 left-0 right-0 flex justify-center">
      <view class="rounded-full bg-[#018d71] px-8 py-3 shadow-lg" @click="handleCreate">
        <text class="text-base text-white">
          + 发布活动
        </text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
