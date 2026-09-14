<script lang="ts" setup>
/**
 * 打卡卡片(打卡广场 / 我的打卡 / 圈子打卡三处复用,保证展示口径一致)。
 *
 * - 展示作者、正文、九宫格图片(可点开大图预览)或视频(内联播放)、兴趣标签、所属圈子徽标;
 * - 纯展示组件:删除等操作通过事件上抛,由父页面决定行为;
 * - 九宫格用百分比宽度 + `padding-bottom` 撑成正方形,规避 aspect-ratio 在小程序端的兼容差异。
 */
import { computed } from 'vue'
import { formatDateTime } from '@/utils/format'
import type { CheckinDTO } from '@/types'

const props = withDefaults(defineProps<{
  /** 打卡数据 */
  checkin: CheckinDTO
  /** 是否展示删除入口(仅「我的打卡」开启) */
  showDelete?: boolean
  /** 是否展示所属圈子徽标 */
  showCircle?: boolean
  /** 正文最大展示行数(0 表示不限) */
  contentLines?: number
  /** 是否可整卡点击进详情(开启后展示右侧箭头并抛出 tap 事件) */
  clickable?: boolean
}>(), {
  showDelete: false,
  showCircle: true,
  contentLines: 0,
  clickable: false,
})

const emit = defineEmits<{
  (e: 'delete', checkin: CheckinDTO): void
  (e: 'circle', circleId: string): void
  (e: 'tap', checkin: CheckinDTO): void
}>()

/** 图片数量 */
const imageCount = computed(() => props.checkin.images.length)

/** 宫格列数:1 张走大图,2 张两列,其余三列 */
const columns = computed(() => {
  if (imageCount.value <= 1)
    return 1
  return imageCount.value === 2 ? 2 : 3
})

/** 单元格宽度类(百分比宽度 + padding-bottom 撑高为正方形) */
const cellWidthClass = computed(() => {
  if (columns.value === 1)
    return 'w-full'
  return columns.value === 2 ? 'w-[48.5%]' : 'w-[32%]'
})

/** 单张图高度占比(宽高比 62%,接近 16:10,避免大图过高) */
const singleRatio = 62

/** 正文行数限制类 */
const contentClass = computed(() => {
  if (props.contentLines === 1)
    return 'line-clamp-1'
  if (props.contentLines === 2)
    return 'line-clamp-2'
  if (props.contentLines === 3)
    return 'line-clamp-3'
  return ''
})

/** 作者头像占位字符 */
const avatarFallback = computed(() => {
  const name = props.checkin.author?.name ?? ''
  return name ? name[0] : '?'
})

/** 点击图片:大图预览 */
function handlePreviewImage(index: number) {
  const urls = props.checkin.images
  if (urls.length === 0)
    return
  uni.previewImage({ urls, current: urls[index] })
}

/** 点击圈子徽标:跳圈子详情 */
function handleCircleTap() {
  if (props.checkin.circleId)
    emit('circle', props.checkin.circleId)
}

/** 点击删除 */
function handleDelete() {
  emit('delete', props.checkin)
}

/** 整卡点击进详情(图片预览/视频/圈子徽标/删除均已 stop,不会误触) */
function handleTap() {
  if (!props.clickable)
    return
  emit('tap', props.checkin)
}
</script>

<template>
  <view
    class="rounded-2xl bg-white p-4"
    :class="clickable ? 'active:bg-[#fafafa]' : ''"
    @click="handleTap"
  >
    <!-- 头部:作者 + 时间 -->
    <view class="flex items-center gap-3">
      <view class="h-10 w-10 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1]">
        <image
          v-if="checkin.author.avatarUrl"
          :src="checkin.author.avatarUrl"
          class="h-full w-full"
          mode="aspectFill"
        />
        <text v-else class="text-base text-[#018d71] font-medium">
          {{ avatarFallback }}
        </text>
      </view>
      <view class="min-w-0 flex-1">
        <text class="block truncate text-sm text-[#333] font-medium">
          {{ checkin.author.name }}
        </text>
        <text class="mt-0.5 block text-xs text-[#999]">
          {{ formatDateTime(checkin.createdAt) }}
        </text>
      </view>
      <view
        v-if="showDelete"
        class="shrink-0 px-1 py-1"
        @click.stop="handleDelete"
      >
        <text class="text-xs text-[#999]">
          删除
        </text>
      </view>
      <text v-if="clickable && !showDelete" class="shrink-0 text-sm text-[#ccc]">
        ›
      </text>
    </view>

    <!-- 正文 -->
    <text
      v-if="checkin.content"
      class="mt-3 block text-sm text-[#333] leading-6"
      :class="contentClass"
    >
      {{ checkin.content }}
    </text>

    <!-- 媒体:九宫格图片(互斥于视频) -->
    <view v-if="imageCount > 0" class="mt-3 flex flex-wrap gap-1">
      <view
        v-for="(url, index) in checkin.images"
        :key="`${url}-${index}`"
        :class="cellWidthClass"
      >
        <view
          class="relative w-full overflow-hidden rounded-lg bg-[#f5f6f7]"
          :style="{ paddingBottom: `${columns === 1 ? singleRatio : 100}%` }"
          @click.stop="handlePreviewImage(index)"
        >
          <image :src="url" class="absolute inset-0 h-full w-full" mode="aspectFill" />
        </view>
      </view>
    </view>

    <!-- 媒体:视频(互斥于图片;点击仅播放,不触发整卡跳转) -->
    <view v-if="checkin.videoUrl" class="mt-3 overflow-hidden rounded-lg bg-black" @click.stop>
      <video
        :src="checkin.videoUrl"
        class="h-[420rpx] w-full"
        object-fit="contain"
        :controls="true"
        :show-center-play-btn="true"
      />
    </view>

    <!-- 兴趣标签 -->
    <view v-if="checkin.tags.length > 0" class="mt-3 flex flex-wrap gap-2">
      <text
        v-for="tag in checkin.tags"
        :key="tag"
        class="rounded-full bg-[#e8f5f1] px-2.5 py-1 text-xs text-[#018d71]"
      >
        {{ tag }}
      </text>
    </view>

    <!-- 所属圈子徽标 -->
    <view
      v-if="showCircle && checkin.circleTitle"
      class="mt-3 flex items-center self-start gap-1"
      @click.stop="handleCircleTap"
    >
      <text class="i-carbon-location-filled text-xs text-[#018d71]" />
      <text class="text-xs text-[#018d71]">
        {{ checkin.circleTitle }}
      </text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
