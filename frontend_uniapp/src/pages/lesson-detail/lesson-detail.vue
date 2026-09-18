<script lang="ts" setup>
/**
 * 单课时详情页(用户端)。
 *
 * - 从课程详情页的课时项「详情」入口进入,参数:`courseId` + `lessonId`;
 * - 顶部用 VideoPlayer 播放当前课时,下方展示课时元属性(序号 / 标题 / 时长 / 简介 / 所属课程);
 * - 提供「上一节 / 下一节」切换(边界置灰),播完自动续播下一节;
 * - 分享:小程序走原生转发,分享的是当前正在看的课时;H5 走微信 JSSDK;
 * - 课时不存在或课程已下线统一展示「已下线」态。
 */
import { computed, ref } from 'vue'
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { getCourse, getCourseProgress, reportLessonProgress } from '@/api/courses'
import { useShare } from '@/composables/useShare'
import { useUserStore } from '@/store/user'
import { toLoginWithRedirect } from '@/utils/toLoginPage'
import { formatDate, formatDuration } from '@/utils/format'
import VideoPlayer from '@/components/VideoPlayer/VideoPlayer.vue'
import type { CourseLessonDTO, CourseLessonProgressDTO, PublicCourseDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '课时详情',
  },
  // 分享链路:未登录可浏览课时元属性,播放器区域显示「登录后观看」占位
  excludeLoginPath: true,
})

const userStore = useUserStore()
/** 是否已登录(未登录时不渲染播放器,避免未登录自动播放) */
const isLoggedIn = computed(() => userStore.isLoggedIn)

/** 未登录点击播放占位:引导登录(登录成功后回到本页即可观看) */
function goLogin() {
  toLoginWithRedirect('navigateTo')
}

const courseId = ref('')
const lessonId = ref('')
const course = ref<PublicCourseDTO | null>(null)
const loading = ref(true)
/** 课程/课时不存在或已下线(含首屏加载失败) */
const notFound = ref(false)
/** 当前课时下标 */
const activeIndex = ref(0)
/** 当前用户在该课程的课时进度(lessonId → progress);空 map 表示无进度或未拉取 */
const progressMap = ref<Map<string, CourseLessonProgressDTO>>(new Map())

const lessons = computed(() => course.value?.lessons ?? [])
const currentLesson = computed(() => lessons.value[activeIndex.value] ?? null)
/** 当前课时的初始播放位置(从 progressMap 取,无进度则为 0) */
const initialPosition = computed(() => {
  if (!currentLesson.value) return 0
  return progressMap.value.get(currentLesson.value.id)?.positionSeconds ?? 0
})
/** 上一节(第一节时为 null) */
const prevLesson = computed<CourseLessonDTO | null>(() => lessons.value[activeIndex.value - 1] ?? null)
/** 下一节(最后一节时为 null) */
const nextLesson = computed<CourseLessonDTO | null>(() => lessons.value[activeIndex.value + 1] ?? null)

/** 全屏播放页在同课程内续播用的播放列表(poster 统一取课程封面) */
const playlist = computed(() => lessons.value.map(lesson => ({
  id: lesson.id,
  src: lesson.videoUrl,
  poster: course.value?.coverImages[0],
  title: lesson.title,
})))

// ====== 分享(小程序原生转发 / H5 微信 JSSDK) ======
/** 分享标题:当前课时标题 */
const shareTitle = computed(() => currentLesson.value?.title || course.value?.title || '趣邻圈 · 视频课程')
/** 分享图:课时无独立封面,统一取课程封面(为空时由 useShare 回退默认图) */
const shareImage = computed(() => course.value?.coverImages?.[0] ?? '')
/** 分享描述:课时简介 → 课程简介 → 兜底文案(避免分享卡空白) */
const shareDesc = computed(() => {
  const lessonDesc = currentLesson.value?.description?.trim()
  if (lessonDesc) return lessonDesc.slice(0, 80)
  const courseDesc = course.value?.description?.trim()
  if (courseDesc) return courseDesc.slice(0, 80)
  return '跟着老师视频学习兴趣课程'
})

const { share, shareAppMessage, shareTimeline } = useShare({
  title: () => shareTitle.value,
  path: '/pages/lesson-detail/lesson-detail',
  // 分享当前正在看的课时(切换课时后再分享即为新的课时)
  query: () => ({
    ...(courseId.value ? { courseId: courseId.value } : {}),
    ...(currentLesson.value ? { lessonId: currentLesson.value.id } : {}),
  }),
  imageUrl: () => shareImage.value,
  desc: () => shareDesc.value,
})

// 分享钩子必须在页面顶层直接注册,编译器才能生成小程序 Page 配置
// #ifdef MP-WEIXIN || MP-TOUTIAO
onShareAppMessage(shareAppMessage)
onShareTimeline(shareTimeline)
// #endif

/**
 * 拉取课程详情 + 当前用户在该课程的进度(并行);按 lessonId 定位当前课时。
 *
 * 未登录时跳过进度请求:进度接口 401 会触发 http 拦截器的全局登录跳转,
 * 破坏"未登录浏览"的分享链路(课程信息本身可匿名获取)。
 */
async function fetchDetail(id: string) {
  loading.value = true
  try {
    const progressTask = isLoggedIn.value
      ? getCourseProgress(id)
          .then((p) => {
            const map = new Map<string, CourseLessonProgressDTO>()
            for (const item of p.list) map.set(item.lessonId, item)
            progressMap.value = map
          })
          .catch((err) => {
            console.warn('[LessonDetail] progress fetch failed:', (err as Error)?.message)
            progressMap.value = new Map()
          })
      : Promise.resolve()
    // 并行:课程详情 + 进度(进度失败不阻塞)
    const [res] = await Promise.all([getCourse(id), progressTask])
    course.value = res
    const index = res.lessons.findIndex(lesson => lesson.id === lessonId.value)
    activeIndex.value = index >= 0 ? index : 0
    notFound.value = false
    applyNavTitle()
  }
  catch (e) {
    notFound.value = true
    console.warn('[LessonDetail] fetch error:', (e as Error)?.message)
  }
  finally {
    loading.value = false
  }
}

/**
 * 监听 VideoPlayer 进度事件,上报到后端。
 * 切换课时时,播放器因 :key 重建会自动卸载并强制上报最后一次位置。
 */
function handleProgress(e: { positionSeconds: number; durationSeconds: number }) {
  if (!currentLesson.value) return
  if (e.positionSeconds <= 0) return
  void reportLessonProgress(currentLesson.value.id, e.positionSeconds).catch(() => {})
}

/** 视频加载/播放失败:轻提示,不阻塞上下节切换 */
function handleVideoError() {
  uni.showToast({ title: '视频加载失败,请检查网络后重试', icon: 'none' })
}

/** 用当前课时标题刷新导航栏标题(小程序原生导航生效) */
function applyNavTitle() {
  const title = currentLesson.value?.title
  if (title)
    uni.setNavigationBarTitle({ title })
}

onLoad((options) => {
  const query = (options ?? {}) as { courseId?: string, lessonId?: string }
  courseId.value = query.courseId ?? ''
  lessonId.value = query.lessonId ?? ''
  if (!courseId.value) {
    notFound.value = true
    loading.value = false
    return
  }
  void fetchDetail(courseId.value)
})

/** 切换到指定课时:重建播放器并回到页面顶部(元属性与上下节信息随之刷新) */
function switchLesson(target: CourseLessonDTO | null) {
  if (!target || target.id === currentLesson.value?.id)
    return
  const index = lessons.value.findIndex(lesson => lesson.id === target.id)
  if (index < 0)
    return
  activeIndex.value = index
  applyNavTitle()
  uni.pageScrollTo({ scrollTop: 0, duration: 200 })
}

/** 播放结束:自动续播下一节(已是最后一节时提示) */
function handleEnded() {
  const next = nextLesson.value
  if (!next) {
    uni.showToast({ title: '已经是最后一节课了', icon: 'none' })
    return
  }
  switchLesson(next)
  uni.showToast({ title: `已切换到下一节:${next.title}`, icon: 'none' })
}

/**
 * 查看课程全部课时:
 * - 上一页就是课程详情页时直接返回(navigateBack),避免页面栈里堆出重复的课程详情;
 * - 其他入口(如分享链接直达本页)则跳转课程详情页。
 */
function goCourseDetail() {
  if (!courseId.value)
    return
  const pages = getCurrentPages() as Array<{ route?: string }>
  // uni-app 的 route 无前导斜杠,兼容带斜杠的场景
  const prevRoute = (pages[pages.length - 2]?.route ?? '').replace(/^\//, '')
  if (prevRoute === 'pages/course-detail/course-detail') {
    uni.navigateBack()
    return
  }
  uni.redirectTo({
    url: `/pages/course-detail/course-detail?id=${encodeURIComponent(courseId.value)}`,
  })
}

/** 返回上一页(仅用于异常态的返回按钮) */
function handleBack() {
  uni.navigateBack({
    fail: () => {
      uni.switchTab({ url: '/pages/me/me' })
    },
  })
}
</script>

<template>
  <view class="min-h-screen flex flex-col bg-[#f7f8fa]">
    <!-- 加载中 -->
    <view v-if="loading" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <!-- 不存在 / 已下线 -->
    <view v-else-if="notFound || !course" class="flex flex-col items-center pt-20">
      <text class="i-carbon-video-off text-5xl text-[#d9d9d9]" />
      <text class="mt-4 text-sm text-[#999]">
        课时不存在或课程已下线
      </text>
      <wd-button class="mt-4" round size="small" @click="handleBack">
        返回
      </wd-button>
    </view>

    <template v-else-if="currentLesson">
      <!-- ====== 播放区 ====== -->
      <view class="bg-black">
        <!-- 未登录:封面占位 + 登录引导(分享链路可浏览元属性,播放需登录) -->
        <view
          v-if="!isLoggedIn"
          class="relative h-[420rpx] w-full"
          @click="goLogin"
        >
          <image
            :src="course.coverImages[0] || ''"
            class="h-full w-full opacity-50"
            mode="aspectFill"
          />
          <view class="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <view class="h-14 w-14 flex items-center justify-center rounded-full bg-black/50">
              <text class="i-carbon-play-filled text-2xl text-white" />
            </view>
            <text class="text-sm text-white">
              登录后观看
            </text>
          </view>
        </view>
        <VideoPlayer
          v-else
          :key="currentLesson.id"
          :src="currentLesson.videoUrl"
          :poster="course.coverImages[0]"
          :title="currentLesson.title"
          :initial-position="initialPosition"
          video-id="lessonDetailPlayer"
          @ended="handleEnded"
          @progress="handleProgress"
          @error="handleVideoError"
        />
      </view>

      <!-- ====== 课时元属性卡 ====== -->
      <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
        <view class="flex items-center justify-between">
          <text class="rounded-full bg-[#e8f5f1] px-2.5 py-1 text-xs text-[#018d71]">
            第 {{ activeIndex + 1 }} 节 / 共 {{ lessons.length }} 节
          </text>
          <text class="text-xs text-[#999]">
            {{ formatDuration(currentLesson.durationSeconds) }}
          </text>
        </view>

        <view class="mt-2.5 flex items-start justify-between gap-3">
          <text class="min-w-0 flex-1 text-lg text-[#333] font-semibold leading-snug">
            {{ currentLesson.title }}
          </text>
          <!-- 分享:小程序走原生转发按钮,H5 点击引导右上角分享 -->
          <!-- #ifdef H5 -->
          <wd-button size="small" variant="plain" @click="share">
            分享
          </wd-button>
          <!-- #endif -->
          <!-- #ifndef H5 -->
          <wd-button size="small" variant="plain" open-type="share">
            分享
          </wd-button>
          <!-- #endif -->
        </view>

        <text v-if="currentLesson.description" class="mt-2 block text-sm text-[#666] leading-relaxed">
          {{ currentLesson.description }}
        </text>

        <view class="mt-3 flex flex-wrap items-center gap-2 border-t border-[#f5f5f5] pt-3">
          <text
            v-for="tag in course.tags"
            :key="tag"
            class="rounded-full bg-[#e8f5f1] px-2.5 py-1 text-xs text-[#018d71]"
          >
            {{ tag }}
          </text>
          <text class="text-xs text-[#999]">
            {{ formatDate(course.updatedAt) }} 更新
          </text>
        </view>

        <!-- 所属课程:跳转课程详情页查看全部课时 -->
        <view class="mt-3 flex items-center justify-between active:opacity-70" @click="goCourseDetail">
          <text class="line-clamp-1 text-xs text-[#999]">
            所属课程:{{ course.title }}
          </text>
          <text class="shrink-0 pl-2 text-xs text-[#018d71]">
            查看全部课时 ›
          </text>
        </view>
      </view>

      <!-- ====== 上一节 / 下一节 ====== -->
      <view class="mx-4 mb-6 mt-3 overflow-hidden rounded-2xl bg-white">
        <view class="border-b border-[#f5f5f5] px-4 py-2.5">
          <text class="text-sm text-[#333] font-medium">
            课程进度
          </text>
        </view>

        <!-- 上一节 -->
        <view
          class="flex items-center gap-3 px-4 py-3"
          :class="prevLesson ? 'active:bg-[#f7f8fa]' : 'opacity-45'"
          @click="switchLesson(prevLesson)"
        >
          <text class="i-carbon-chevron-left shrink-0 text-lg" :class="prevLesson ? 'text-[#018d71]' : 'text-[#ccc]'" />
          <view class="min-w-0 flex-1">
            <text class="block text-xs text-[#999]">
              上一节
            </text>
            <text class="mt-0.5 line-clamp-1 text-sm text-[#333]">
              {{ prevLesson ? prevLesson.title : '已经是第一节了' }}
            </text>
          </view>
          <text v-if="prevLesson" class="shrink-0 text-xs text-[#999]">
            {{ formatDuration(prevLesson.durationSeconds) }}
          </text>
        </view>

        <!-- 下一节 -->
        <view
          class="flex items-center gap-3 border-t border-[#f5f5f5] px-4 py-3"
          :class="nextLesson ? 'active:bg-[#f7f8fa]' : 'opacity-45'"
          @click="switchLesson(nextLesson)"
        >
          <text class="i-carbon-chevron-right shrink-0 text-lg" :class="nextLesson ? 'text-[#018d71]' : 'text-[#ccc]'" />
          <view class="min-w-0 flex-1">
            <text class="block text-xs text-[#999]">
              下一节
            </text>
            <text class="mt-0.5 line-clamp-1 text-sm text-[#333]">
              {{ nextLesson ? nextLesson.title : '已经是最后一节了' }}
            </text>
          </view>
          <text v-if="nextLesson" class="shrink-0 text-xs text-[#999]">
            {{ formatDuration(nextLesson.durationSeconds) }}
          </text>
        </view>
      </view>
    </template>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
