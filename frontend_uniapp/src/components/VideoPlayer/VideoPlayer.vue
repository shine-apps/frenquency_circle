<script setup lang="ts">
import { computed, getCurrentInstance, onMounted, onUnmounted, ref } from 'vue'

// 通用播放列表项结构
export interface PlaylistItem {
  id: string
  src: string
  poster?: string
  title?: string
}

/** 进度上报 payload:仅含续播定位需要的字段(视频较短,不上报完成率) */
export interface VideoProgressEvent {
  /** 当前播放位置(秒,向下取整) */
  positionSeconds: number
  /** 视频总时长(秒,部分平台 onLoadedMetaData 时不可用,可能为 0) */
  durationSeconds: number
}

interface Props {
  src: string
  poster?: string
  videoId?: string
  containerWidth?: number // 单位是rpx
  title?: string
  // 可选的播放列表，传入后全屏模式下会自动播放下一个
  playlist?: PlaylistItem[]
  /**
   * 续播定位:加载完成后自动 seek 到该位置(秒)。
   * 取值范围 [0, duration);0 或负值视为不续播。
   */
  initialPosition?: number
  /**
   * 进度上报的最小间隔(秒),默认 5。
   * 暂停 / 结束 / 组件卸载时无视间隔强制上报最后一次位置。
   */
  reportInterval?: number
}

const props = withDefaults(defineProps<Props>(), {
  videoId: 'videoPlayer',
  containerWidth: 0,
  title: '',
  playlist: () => [],
  initialPosition: 0,
  reportInterval: 5,
})

const emit = defineEmits<{
  close: []
  ended: []
  /**
   * 周期性进度上报(节流 + 暂停/结束/卸载时强制)。
   * 父组件用于上报 `PUT /api/users/me/course-progress/:lessonId`。
   */
  progress: [event: VideoProgressEvent]
  /** 视频加载 / 播放出错(src 失效 / 网络中断等),父组件展示提示 */
  error: [event: { errMsg?: string }]
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

// 续播定位:onLoadedMetaData 时 duration 可能尚未就绪,推迟到第一次 timeupdate 时执行
let pendingSeekPosition: number | null = null
// 上次进度上报时间戳(用于节流)
let lastReportAt = 0

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
  // 暂停时强制上报一次(避免下次打开停留在很久前的旧位置)
  reportProgress(true)
}

// 视频播放结束事件
function onEnded() {
  // 播完时强制上报"已看完"的最终位置(覆盖整段时长),让父组件统一知道已结束
  // 注意:必须在重置 currentTime 之前取值,否则 reportProgress 会拿到 0
  if (duration.value > 0) {
    emit('progress', {
      positionSeconds: Math.floor(duration.value),
      durationSeconds: Math.floor(duration.value),
    })
    lastReportAt = Date.now()
  }
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

// 视频加载/播放出错(src 失效 / 网络中断等)
function onError(e: any) {
  console.warn('[VideoPlayer] error:', e?.detail)
  // 出错时清掉待执行 seek,避免恢复后跳到错误位置
  pendingSeekPosition = null
  emit('error', { errMsg: e?.detail?.errMsg })
}

// 时间更新事件
function onTimeUpdate(e: any) {  if (!isDragging.value) {
    currentTime.value = e.detail.currentTime
    duration.value = e.detail.duration
    if (duration.value > 0) {
      progress.value = (currentTime.value / duration.value) * 100
    }
  }
  // 续播:第一次拿到 duration 后,执行 seek 到 initialPosition
  // (onLoadedMetaData 时 duration 可能仍未就绪)
  if (pendingSeekPosition !== null && duration.value > 0) {
    const target = Math.min(pendingSeekPosition, duration.value * 0.999)
    videoContext?.seek(target)
    pendingSeekPosition = null
  }
  // 节流上报进度
  reportProgress(false)
}

/**
 * 进度上报:
 * - `force=true` 跳过节流(暂停 / 结束 / 卸载);
 * - `positionOverride` 用于在 currentTime 已被重置的场景下报"已看完"的位置;
 * - 位置 <= 0 时不上报(避免初始 0 触发空请求)。
 */
function reportProgress(force: boolean, positionOverride?: number) {
  const pos = positionOverride ?? currentTime.value
  if (pos <= 0) return
  const now = Date.now()
  if (!force && now - lastReportAt < props.reportInterval * 1000) return
  lastReportAt = now
  emit('progress', {
    positionSeconds: Math.floor(pos),
    durationSeconds: Math.floor(duration.value),
  })
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
  // 部分平台 loadedmetadata 已就绪 duration,优先取之,否则推迟到 timeupdate
  if (typeof e.detail.duration === 'number' && e.detail.duration > 0) {
    duration.value = e.detail.duration
    if (pendingSeekPosition !== null) {
      const target = Math.min(pendingSeekPosition, duration.value * 0.999)
      videoContext?.seek(target)
      pendingSeekPosition = null
    }
  }
  else if (props.initialPosition > 0) {
    pendingSeekPosition = props.initialPosition
  }
}

function close() {
  videoContext?.exitFullScreen()
  emit('close')
}

// 全局事件名：全屏页请求 playlist / 返回 playlist 数据
const REQ_PLAYLIST_EVENT = 'video-fullscreen-req-playlist'
const PLAYLIST_DATA_EVENT = 'video-fullscreen-playlist-data'
/** 全屏页退出时回传播放位置(VideoPlayer 接收,按 videoId 匹配过滤) */
const POSITION_EVENT = 'video-fullscreen-position'

/**
 * 打开全屏播放页。
 *
 * - 跳转前暂停当前视频,避免双声源;
 * - 通过 URL 参数把 `videoId` 带给全屏页(playlist 事件的 currentId 兜底);
 * - 注册一次性位置监听器:全屏页退出(onUnload)时把播放位置回传到这里,
 *   本组件用它同步 currentTime / seek,并 force 上报一次 progress ——
 *   父组件(如课程详情)靠这个把用户在全屏页看的进度落库,
 *   无需把业务字段(如 lessonId)透传给本组件,保持播放器的通用性。
 */
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
  // 注册一次性位置监听器:videoId 匹配才处理(页面栈里可能有多个 VideoPlayer 实例)
  const positionHandler = (payload: { videoId?: string, currentTime?: number, duration?: number }) => {
    if (!payload || payload.videoId !== props.videoId)
      return
    // 用全屏页的播放位置覆盖本地状态(用户可能拖进度 / 看到末尾)
    if (typeof payload.currentTime === 'number' && payload.currentTime > 0) {
      currentTime.value = payload.currentTime
      if (typeof payload.duration === 'number' && payload.duration > 0) {
        duration.value = payload.duration
        progress.value = (payload.currentTime / payload.duration) * 100
      }
      // 同步底层 video 到该位置(用户点播放时从这里继续)
      videoContext?.seek(payload.currentTime)
      // force 上报一次 progress,父组件经此把全屏页的进度落库
      reportProgress(true)
    }
    uni.$off(POSITION_EVENT, positionHandler)
  }
  uni.$on(POSITION_EVENT, positionHandler)
  // 导航到全屏播放页面(带 videoId 供回传位置;带 start 供全屏页续播,避免视觉上回到 0)
  uni.navigateTo({
    url: `/pages/tools/fullscreen-player?src=${encodeURIComponent(props.src)}&poster=${encodeURIComponent(props.poster || '')}&title=${encodeURIComponent(props.title || '')}&videoId=${encodeURIComponent(props.videoId)}&start=${encodeURIComponent(Math.floor(currentTime.value))}`,
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
  // 模块级变量在组件复用时不会自动重置,需在挂载时显式初始化续播位置
  pendingSeekPosition = props.initialPosition > 0 ? props.initialPosition : null
})

onUnmounted(() => {
  // 卸载前强制上报一次,避免切课时最后一次位置丢失
  // 注意:此时 props 仍可读(响应式数据未销毁),可直接 emit
  reportProgress(true)
  clearTimeout(hideControlsTimer)
  // 清理全局事件监听
  uni.$off(REQ_PLAYLIST_EVENT)
  uni.$off(PLAYLIST_DATA_EVENT)
  uni.$off(POSITION_EVENT)
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
      @error="onError"
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
