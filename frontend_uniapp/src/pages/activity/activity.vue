<script lang="ts" setup>
/**
 * 活动详情页(顶层独立资源,与圈子解耦)。
 *
 * - 路径参数:activityId。
 * - 富文本介绍用 uni `<rich-text>` 渲染(仅展示,不执行脚本)。
 * - 非创建者访问已取消活动:后端返回 404,这里提示不存在。
 */
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { getActivity } from '@/api/activities'
import type { ActivityDTO } from '@/types'

const activityId = ref('')

const loading = ref(true)
const notFound = ref(false)
const activity = ref<ActivityDTO | null>(null)

function formatTs(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onLoad((options: Record<string, string | undefined>) => {
  activityId.value = options.activityId ?? ''
  load()
})

async function load() {
  loading.value = true
  notFound.value = false
  try {
    const res = await getActivity(activityId.value)
    activity.value = res as ActivityDTO
  }
  catch (e) {
    notFound.value = true
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <view class="min-h-screen bg-[#f6f8fa]">
    <view v-if="loading" class="flex items-center justify-center py-20">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <view v-else-if="notFound" class="flex flex-col items-center py-24">
      <text class="text-base text-[#999]">
        活动不存在或已取消
      </text>
    </view>

    <view v-else-if="activity" class="flex flex-col gap-3 px-4 py-4">
      <view class="rounded-2xl bg-white px-4 py-4">
        <view class="mb-2 flex items-center gap-2">
          <text class="text-xl text-[#1a1a1a] font-semibold">
            {{ activity.title }}
          </text>
          <text
            v-if="activity.status === 'cancelled'"
            class="rounded-full bg-[#fdecec] px-2 py-0.5 text-xs text-[#e54d42]"
          >
            已取消
          </text>
        </view>
      </view>

      <view class="flex flex-col gap-3 rounded-2xl bg-white px-4 py-4">
        <view class="flex items-center justify-between">
          <text class="text-sm text-[#999]">
            活动起始
          </text>
          <text class="text-base text-[#333]">
            {{ formatTs(activity.startTime) }}
          </text>
        </view>
        <view class="flex items-center justify-between">
          <text class="text-sm text-[#999]">
            报名截止
          </text>
          <text class="text-base text-[#333]">
            {{ formatTs(activity.registrationDeadline) }}
          </text>
        </view>
        <view class="flex items-center justify-between">
          <text class="text-sm text-[#999]">
            联系人
          </text>
          <text class="text-base text-[#333]">
            {{ activity.contactPhone || '—' }}
          </text>
        </view>
      </view>

      <view class="rounded-2xl bg-white px-4 py-4">
        <text class="mb-2 block text-sm text-[#666]">
          活动介绍
        </text>
        <rich-text :nodes="activity.description" class="rich-content" />
      </view>
    </view>
  </view>
</template>

<style scoped>
.rich-content {
  font-size: 28rpx;
  line-height: 1.6;
  color: #333;
  word-break: break-word;
}
</style>
