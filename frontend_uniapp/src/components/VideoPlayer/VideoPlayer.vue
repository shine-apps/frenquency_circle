<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, onUnmounted, ref } from 'vue'

// 通用播放列表项结构
export interface PlaylistItem {
  id: string
  src: string
  poster?: string
  title?: string
}

interface Props {
  src: string
  poster?: string
  videoId?: string
  containerWidth?: number // 单位是rpx
  title?: string
  // 可选的播放列表，传入后全屏模式下会自动播放下一个
  playlist?: PlaylistItem[]
}

const props = withDefaults(defineProps<Props>(), {
  videoId: 'videoPlayer',
  containerWidth: 0,
  title: '',
  playlist: () => [],
})

const emit = defineEmits<{
  close: []
  ended: []
}>()

const isMirrored = ref(false)
const isPlaying = ref(false)
const showControls = ref(true)
const videoOriginalWidth = ref(0)
const videoOriginalHeight = ref(0)
const playbackRate = ref(1.0)
const showPlaybackRatePicker = ref(false)
const isLoop = ref(false)

// 进度条相关
const currentTime = ref(0) // 当前播放时间（秒）
const duration = ref(0) // 视频总时长（秒）
const progress = ref(0) // 播放进度（0-100）
const isDragging = ref(false) // 是否正在拖动进度条

const playbackRateOptions = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0]

let hideControlsTimer: ReturnType<typeof setTimeout> | null = null

let videoContext: UniApp.VideoContext | null = null
let componentInstance: any = null

const computedVideoHeight = computed(() => {
  if (videoOriginalWidth.value === 0 || videoOriginalHeight.value === 0)
    return 'auto'
  const width = props.containerWidth || 750 * 0.9
  const aspectRatio = videoOriginalHeight.value / videoOriginalWidth.value
  const height = width * aspectRatio
  console.log('computedVideoHeight: ', width, height)
  return `${height}rpx`
})

function toggleMirror() {
  console.log('toggleMirror', isMirrored.value)
  isMirrored.value = !isMirrored.value
  resetHideControlsTimer()
}

function toggleLoop() {
  isLoop.value = !isLoop.value
  resetHideControlsTimer()
}

function togglePlaybackRatePicker() {
  showPlaybackRatePicker.value = !showPlaybackRatePicker.value
  resetHideControlsTimer()
}

function setPlaybackRate(rate: number) {
  playbackRate.value = rate
  if (videoContext) {
    videoContext.playbackRate(rate)
  }
  showPlaybackRatePicker.value = false
  resetHideControlsTimer()
}

function onPlay() {
  console.log('onPlay')
  isPlaying.value = true
  resetHideControlsTimer()
}

function onPause() {
  console.log('onPause')
  isPlaying.value = false
  resetHideControlsTimer()
}

// 视频播放结束事件
function onEnded() {
  // 重置播放进度为0
  currentTime.value = 0
  progress.value = 0
  // 设置播放状态为暂停
  isPlaying.value = false
  // 重置控制按钮显示状态
  resetHideControlsTimer()
  // 确保控制按钮显示
  showControls.value = true
  // 非循环模式下通知父组件视频已结束
  if (!isLoop.value) {
    emit('ended')
  }
}

// 时间更新事件
function onTimeUpdate(e: any) {
  if (!isDragging.value) {
    currentTime.value = e.detail.currentTime
    duration.value = e.detail.duration
    if (duration.value > 0) {
      progress.value = (currentTime.value / duration.value) * 100
    }
  }
}

// 进度条拖动中
function onProgressChanging(e: any) {
  const value = e.detail.value
  progress.value = value
  currentTime.value = (value / 100) * duration.value
  showControls.value = true
}

// 进度条拖动结束
function onProgressChange(e: any) {
  const value = e.detail.value
  progress.value = value
  const seekTime = (value / 100) * duration.value
  if (videoContext && duration.value > 0) {
    videoContext.seek(seekTime)
  }
  resetHideControlsTimer()
}

// 格式化时间为 MM:SS 格式
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
}

function onLoadedMetaData(e: any) {
  console.log('onLoadedMetaData', e.detail)
  videoOriginalWidth.value = e.detail.width
  videoOriginalHeight.value = e.detail.height
  console.log('视频元数据:', videoOriginalWidth.value, 'x', videoOriginalHeight.value)
}

function close() {
  videoContext?.exitFullScreen()
  emit('close')
}

// 全局事件名：全屏页请求 playlist / 返回 playlist 数据
const REQ_PLAYLIST_EVENT = 'video-fullscreen-req-playlist'
const PLAYLIST_DATA_EVENT = 'video-fullscreen-playlist-data'

function openFullscreen() {
  // 暂停当前视频
  videoContext?.pause()
  // 注册一次性监听器：响应后自动移除，避免重复注册累积
  const handler = () => {
    uni.$emit(PLAYLIST_DATA_EVENT, {
      playlist: props.playlist || [],
      currentId: props.videoId,
    })
    uni.$off(REQ_PLAYLIST_EVENT, handler)
  }
  uni.$on(REQ_PLAYLIST_EVENT, handler)
  // 导航到全屏播放页面
  uni.navigateTo({
    url: `/pages/tools/fullscreen-player?src=${encodeURIComponent(props.src)}&poster=${encodeURIComponent(props.poster || '')}&title=${encodeURIComponent(props.title || '')}`,
  })
  resetHideControlsTimer()
}

function togglePlay() {
  if (isPlaying.value) {
    videoContext?.pause()
  }
  else {
    videoContext?.play()
  }
}

function resetHideControlsTimer() {
  showControls.value = true
  if (hideControlsTimer) {
    clearTimeout(hideControlsTimer)
  }
  if (isPlaying.value) {
    hideControlsTimer = setTimeout(() => {
      showControls.value = false
    }, 5000)
  }
}

onMounted(() => {
  componentInstance = getCurrentInstance()?.proxy
  videoContext = uni.createVideoContext(props.videoId, componentInstance)
  console.log('videoContext initialized', videoContext, 'videoId:', props.videoId)
})

onUnmounted(() => {
  clearTimeout(hideControlsTimer)
  // 清理全局事件监听
  uni.$off(REQ_PLAYLIST_EVENT)
  uni.$off(PLAYLIST_DATA_EVENT)
})
</script>

<template>
  <view class="relative pb-50px" @click="resetHideControlsTimer">
    <video
      :id="videoId"
      :src="props.src"
      :poster="props.poster || ''"
      autoplay
      object-fit="contain"
      :controls="false"
      :show-fullscreen-btn="false"
      :show-play-btn="false"
      :show-center-play-btn="false"
      :show-progress="false"
      :enable-progress-gesture="false"
      :loop="isLoop"
      class="min-h-[200px] w-full"
      :style="{ height: computedVideoHeight }"
      :class="isMirrored ? 'mirror' : ''"
      @play="onPlay"
      @pause="onPause"
      @loadedmetadata="onLoadedMetaData"
      @timeupdate="onTimeUpdate"
      @ended="onEnded"
    />

    <!-- 标题 -->
    <view
      v-if="title"
      class="pointer-events-auto absolute left-0 right-0 top-0 from-black/80 to-transparent bg-gradient-to-b px-[15px] py-[10px] transition-opacity duration-300"
      :class="showControls ? 'opacity-100' : 'opacity-0'"
    >
      <text class="text-sm text-white">{{ title }}</text>
    </view>

    <!-- 自定义播放/暂停按钮 -->
    <view
      class="pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity duration-300"
      :class="showControls ? 'opacity-100' : 'opacity-0'"
    >
      <view
        class="pointer-events-auto rounded-full bg-black/50 p-4 transition-transform duration-200 hover:scale-110"
        @click.stop="togglePlay"
      >
        <text class="text-2xl text-white" :class="isPlaying ? 'i-carbon-pause' : 'i-carbon-play'" />
      </view>
    </view>

    <!-- 非全屏时的控制区域（包含进度条和按钮） -->
    <view class="pointer-events-auto absolute bottom-0 left-0 right-0 from-black/80 to-transparent bg-gradient-to-t px-[15px] py-[10px] transition-opacity duration-300" :class="showControls ? 'opacity-100' : 'opacity-0'">
      <!-- 进度条 -->
      <view class="mb-[10px]">
        <!-- 时间显示 -->
        <view class="mb-[5px] flex justify-between text-[12px] text-white/80">
          <text>{{ formatTime(currentTime) }}</text>
          <text>{{ formatTime(duration) }}</text>
        </view>

        <!-- 进度条 -->
        <view class="w-full">
          <slider
            :value="progress"
            :min="0"
            :max="100"
            :step="0.1"
            active-color="#fff"
            background-color="rgba(255, 255, 255, 0.2)"
            :block-size="12"
            block-color="#fff"
            @change="onProgressChange"
            @changing="onProgressChanging"
          />
        </view>
      </view>

      <!-- 底部按钮 -->
      <view class="flex items-center justify-between">
        <view class="flex gap-2">
          <view
            class="rounded-full px-3 py-1.5 transition-colors duration-200 active:bg-white/10"
            :class="isLoop ? 'bg-white/20' : ''"
            @click.stop="toggleLoop"
          >
            <text class="text-xs text-white">循环</text>
          </view>
          <view
            class="rounded-full px-3 py-1.5 transition-colors duration-200 active:bg-white/10"
            :class="isMirrored ? 'bg-white/20' : ''"
            @click.stop="toggleMirror"
          >
            <text class="text-xs text-white">镜像</text>
          </view>
          <view
            class="relative rounded-full px-3 py-1.5 transition-colors duration-200 active:bg-white/10"
            @click.stop="togglePlaybackRatePicker"
          >
            <text class="text-xs text-white">{{ playbackRate }}X</text>
            <!-- 倍速选择器 -->
            <view
              v-if="showPlaybackRatePicker"
              class="absolute bottom-[100%] left-1/2 z-[1000] mb-[10px] min-w-[60px] border border-[#333] rounded-lg bg-black/95 p-[6px] shadow-[0_4px_16px_rgba(0,0,0,0.5)] -translate-x-1/2"
            >
              <view
                v-for="rate in playbackRateOptions"
                :key="rate"
                class="rounded px-[8px] py-[6px] text-center transition-colors duration-200 active:bg-white/10"
                :class="playbackRate === rate ? 'bg-white/20' : ''"
                @click.stop="setPlaybackRate(rate)"
              >
                <text class="text-xs text-white">{{ rate }}X</text>
              </view>
            </view>
          </view>
        </view>
        <view class="flex gap-2">
          <view class="rounded-full px-3 py-1.5 transition-colors duration-200 active:bg-white/10" @click.stop="openFullscreen">
            <text class="text-xs text-white">全屏</text>
          </view>
          <view class="rounded-full px-3 py-1.5 transition-colors duration-200 active:bg-white/10" @click.stop="close">
            <text class="text-xs text-white">关闭</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
.mirror {
  transform: scaleX(-1);
}

/* 自定义slider样式 */
:deep(.uni-slider) {
  height: 4px;
  border-radius: 2px;
}

:deep(.uni-slider-rail) {
  height: 4px;
  border-radius: 2px;
}

:deep(.uni-slider-fill) {
  height: 4px;
  border-radius: 2px;
}

:deep(.uni-slider-handle) {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.4);
}
</style>
