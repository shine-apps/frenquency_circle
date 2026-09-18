<script lang="ts" setup>
/**
 * 活动卡片(广场活动列表 / 活动列表页两处复用,保证展示口径一致)。
 *
 * - 展示封面(首图)、标题、起始时间、报名截止时间、已取消状态徽标;
 * - 纯展示组件:点击行为通过 tap 事件上抛,由父页面决定跳转。
 */
import { computed } from 'vue'
import { formatDateTime } from '@/utils/format'
import type { ActivityDTO } from '@/types'

const props = withDefaults(defineProps<{
  /** 活动数据 */
  activity: ActivityDTO
  /** 是否可整卡点击(开启后展示右侧箭头并抛出 tap 事件) */
  clickable?: boolean
}>(), {
  clickable: false,
})

const emit = defineEmits<{
  (e: 'tap', activity: ActivityDTO): void
}>()

/** 封面图(取首图,无封面时展示占位背景) */
const coverUrl = computed(() => props.activity.coverImages[0] ?? '')

/** 报名是否已截止(截止时间早于当前时间) */
const isExpired = computed(() => {
  return new Date(props.activity.registrationDeadline).getTime() < Date.now()
})

/** 整卡点击(父级处理跳转) */
function handleTap() {
  if (!props.clickable)
    return
  emit('tap', props.activity)
}
</script>

<template>
  <view
    class="overflow-hidden rounded-2xl bg-white"
    :class="clickable ? 'active:bg-[#fafafa]' : ''"
    @click="handleTap"
  >
    <view class="flex items-stretch gap-3 p-4">
      <!-- 封面:有图展示,无图展示主色占位 -->
      <view class="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-[#e8f5f1]">
        <image
          v-if="coverUrl"
          :src="coverUrl"
          class="h-full w-full"
          mode="aspectFill"
        />
        <view v-else class="h-full w-full flex items-center justify-center">
          <text class="i-carbon-events text-2xl text-[#018d71]" />
        </view>
      </view>

      <!-- 信息区 -->
      <view class="min-w-0 flex flex-1 flex-col justify-between gap-1 py-0.5">
        <view class="flex items-start justify-between gap-2">
          <text class="line-clamp-2 text-base text-[#333] font-medium leading-5">
            {{ activity.title }}
          </text>
          <text
            v-if="activity.status === 'cancelled'"
            class="shrink-0 rounded-full bg-[#fdecec] px-2 py-0.5 text-xs text-[#e05555]"
          >
            已取消
          </text>
        </view>
        <view class="flex flex-col gap-0.5">
          <text class="text-xs text-[#999]">
            起始 {{ formatDateTime(activity.startTime) }}
          </text>
          <text
            class="text-xs"
            :class="isExpired ? 'text-[#e05555]' : 'text-[#999]'"
          >
            {{ isExpired ? '报名已截止' : `报名截止 ${formatDateTime(activity.registrationDeadline)}` }}
          </text>
        </view>
      </view>

      <!-- 箭头 -->
      <view v-if="clickable" class="flex shrink-0 items-center">
        <text class="text-sm text-[#ccc]">
          ›
        </text>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
