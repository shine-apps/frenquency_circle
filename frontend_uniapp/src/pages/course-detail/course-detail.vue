<script lang="ts" setup>
/**
 * 课程详情播放页(用户端)。
 *
 * - 调 GET /api/courses/:id 拉取课程与全部课时(按 sortOrder 升序);
 * - 点击课时列表项,弹出播放器弹层(居中)播放该课时,列表项高亮最近播放的课时;
 * - 分享:小程序走原生转发(onShareAppMessage / onShareTimeline),H5 走微信 JSSDK;
 * - 课程不存在或已下线统一展示「已下线」态(与后端 404 口径一致)。
 * 入口:课程列表页卡片。
 */
import { computed, ref } from 'vue'
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { getCourse, getCourseProgress, reportLessonProgress } from '@/api/courses'
import { useShare } from '@/composables/useShare'
import { formatDate, formatDuration } from '@/utils/format'
import VideoPlayer from '@/components/VideoPlayer/VideoPlayer.vue'
import type { CourseLessonProgressDTO, PublicCourseDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '课程详情',
  },
  excludeLoginPath: false,
})

const courseId = ref('')
const course = ref<PublicCourseDTO | null>(null)
const loading = ref(true)
/** 课程不存在 / 已下线(或首屏加载失败) */
const notFound = ref(false)
/** 当前播放的课时下标(用于列表项高亮,表示最近播放) */
const activeIndex = ref(0)
/** 播放器弹层是否可见 */
const playerVisible = ref(false)
/** 当前用户在该课程的课时进度(lessonId → progress);空 map 表示无进度或未拉取 */
const progressMap = ref<Map<string, CourseLessonProgressDTO>>(new Map())

const lessons = computed(() => course.value?.lessons ?? [])
const currentLesson = computed(() => lessons.value[activeIndex.value] ?? null)
/** 当前课时的初始播放位置(从 progressMap 取,无进度则为 0) */
const initialPosition = computed(() => {
  if (!currentLesson.value) return 0
  return progressMap.value.get(currentLesson.value.id)?.positionSeconds ?? 0
})

/** 全屏播放页在同课程内续播用的播放列表(poster 统一取课程封面) */
const playlist = computed(() => lessons.value.map(lesson => ({
  id: lesson.id,
  src: lesson.videoUrl,
  poster: course.value?.coverImages[0],
  title: lesson.title,
})))

// ====== 分享(小程序原生转发 / H5 微信 JSSDK) ======
/** 分享标题:课程标题 */
const shareTitle = computed(() => course.value?.title || '趣邻圈 · 视频课程')
/** 分享图:课程封面(无封面时由 useShare 回退默认图) */
const shareImage = computed(() => course.value?.coverImages?.[0] ?? '')
/** 分享描述:课程简介摘要 */
const shareDesc = computed(() => course.value?.description?.slice(0, 80) ?? '')

const { share, shareAppMessage, shareTimeline } = useShare({
  title: () => shareTitle.value,
  path: '/pages/course-detail/course-detail',
  query: () => (courseId.value ? { id: courseId.value } : {}),
  imageUrl: () => shareImage.value,
  desc: () => shareDesc.value,
})

// 分享钩子必须在页面顶层直接注册,编译器才能生成小程序 Page 配置
// #ifdef MP-WEIXIN || MP-TOUTIAO
onShareAppMessage(shareAppMessage)
onShareTimeline(shareTimeline)
// #endif

onLoad((options) => {
  const id = (options as { id?: string } | undefined)?.id ?? ''
  courseId.value = id
  if (!id) {
    notFound.value = true
    loading.value = false
    return
  }
  void fetchDetail(id)
})

/**
 * 点击课时:记录高亮项并弹出播放器播放该课时。
 *
 * 弹层每次打开都重建 `VideoPlayer`(见模板 v-if),关闭即卸载,
 * 避免弹层隐藏后视频仍在后台播放。
 */
function selectLesson(index: number) {
  activeIndex.value = index
  playerVisible.value = true
}

/** 关闭播放器弹层(VideoPlayer 内「关闭」按钮触发) */
function handlePlayerClose() {
  playerVisible.value = false
}

/**
 * 拉取课程详情 + 当前用户在该课程下的进度(并行;进度拉取失败不影响主流程)。
 */
async function fetchDetail(id: string) {
  loading.value = true
  try {
    // 并行拉课程与进度(进度拉取失败不会阻塞课程详情展示)
    const [res] = await Promise.all([
      getCourse(id),
      getCourseProgress(id)
        .then((p) => {
          const map = new Map<string, CourseLessonProgressDTO>()
          for (const item of p.list) map.set(item.lessonId, item)
          progressMap.value = map
        })
        .catch((err) => {
          // 进度接口失败(401 / 网络)不应阻塞页面;首次未登录场景尤其常见
          console.warn('[CourseDetail] progress fetch failed:', (err as Error)?.message)
          progressMap.value = new Map()
        }),
    ])
    course.value = res
    activeIndex.value = 0
    notFound.value = false
    // 小程序端用课程标题作为导航栏标题(H5 端为自定义导航,不生效也不影响)
    if (res.title)
      uni.setNavigationBarTitle({ title: res.title })
  }
  catch (e) {
    // 404(不存在 / 未上线)与其他错误统一进入「已下线」态,不额外区分
    notFound.value = true
    console.warn('[CourseDetail] fetch error:', (e as Error)?.message)
  }
  finally {
    loading.value = false
  }
}

/**
 * 监听 VideoPlayer 进度事件,上报到后端。
 *
 * VideoPlayer 已做 5s 节流 + 暂停/结束/卸载强制上报,
 * 此处直接转发;上报失败由 http 拦截器统一提示,不影响播放。
 */
function handleProgress(e: { positionSeconds: number; durationSeconds: number }) {
  if (!currentLesson.value) return
  // 只在位置有效时上报(>0);客户端不再裁剪,服务端会按 duration 二次裁剪
  if (e.positionSeconds <= 0) return
  void reportLessonProgress(currentLesson.value.id, e.positionSeconds).catch(() => {})
}

/** 进入单课时详情页(整行点击为弹层快播,此处为独立详情入口) */
function goLessonDetail(index: number) {
  const lesson = lessons.value[index]
  if (!lesson || !course.value)
    return
  uni.navigateTo({
    url: `/pages/lesson-detail/lesson-detail?courseId=${encodeURIComponent(course.value.id)}&lessonId=${encodeURIComponent(lesson.id)}`,
  })
}

/** 返回上一页 */
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
        课程不存在或已下线
      </text>
      <wd-button class="mt-4" round size="small" @click="handleBack">
        返回
      </wd-button>
    </view>

    <template v-else>
      <!-- ====== 课程信息卡 ====== -->
      <view class="mx-4 mt-4 rounded-2xl bg-white p-4">
        <view class="flex items-start justify-between gap-3">
          <text class="min-w-0 flex-1 text-lg text-[#333] font-semibold leading-snug">
            {{ course.title }}
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
        <view class="mt-2 flex flex-wrap items-center gap-2">
          <text
            v-for="tag in course.tags"
            :key="tag"
            class="rounded-full bg-[#e8f5f1] px-2.5 py-1 text-xs text-[#018d71]"
          >
            {{ tag }}
          </text>
          <text class="text-xs text-[#999]">
            {{ course.lessonCount }} 课时 · {{ formatDate(course.updatedAt) }} 更新
          </text>
        </view>
        <text class="mt-3 block text-sm text-[#666] leading-relaxed">
          {{ course.description }}
        </text>
      </view>

      <!-- ====== 课时列表 ====== -->
      <view class="mx-4 mb-6 mt-3 overflow-hidden rounded-2xl bg-white">
        <view class="flex items-center justify-between px-4 py-3">
          <view class="flex flex-col">
            <text class="text-base text-[#333] font-medium">
              课程目录
            </text>
            <text class="mt-0.5 text-xs text-[#999]">
              点击课时在线播放,点「详情」查看单节内容
            </text>
          </view>
          <text class="shrink-0 text-xs text-[#999]">
            共 {{ course.lessonCount }} 课时
          </text>
        </view>

        <view
          v-for="(lesson, index) in lessons"
          :key="lesson.id"
          class="flex items-center gap-3 border-t border-[#f2f2f2] px-4 py-3 active:bg-[#f7f8fa]"
          @click="selectLesson(index)"
        >
          <!-- 播放按钮:点击播放该课时(整行同样可点,最近播放项实心高亮) -->
          <view
            class="h-8 w-8 flex shrink-0 items-center justify-center rounded-full"
            :class="index === activeIndex ? 'bg-[#018d71]' : 'bg-[#e8f5f1]'"
          >
            <text
              class="i-carbon-play text-base"
              :class="index === activeIndex ? 'text-white' : 'text-[#018d71]'"
            />
          </view>
          <view class="min-w-0 flex-1">
            <text
              class="line-clamp-1 text-sm"
              :class="index === activeIndex ? 'text-[#018d71] font-medium' : 'text-[#333]'"
            >
              {{ lesson.title }}
            </text>
            <view class="mt-0.5 flex items-center gap-2">
              <text v-if="lesson.description" class="line-clamp-1 flex-1 text-xs text-[#999]">
                {{ lesson.description }}
              </text>
              <text class="shrink-0 text-xs text-[#999]">
                {{ formatDuration(lesson.durationSeconds) }}
              </text>
            </view>
          </view>
          <!-- 详情入口:进入单课时详情页(阻止冒泡,不触发弹层播放) -->
          <view
            class="flex shrink-0 items-center gap-0.5 rounded-full bg-[#f5f7f6] px-2.5 py-1 active:opacity-70"
            @click.stop="goLessonDetail(index)"
          >
            <text class="text-xs text-[#018d71]">
              详情
            </text>
            <text class="i-carbon-chevron-right text-xs text-[#018d71]" />
          </view>
        </view>

        <view v-if="lessons.length === 0" class="border-t border-[#f2f2f2] px-4 py-6">
          <text class="block text-center text-xs text-[#999]">
            课时整理中,敬请期待
          </text>
        </view>
      </view>

      <!-- ====== 课时播放弹层(点击课时项弹出) ====== -->
      <wd-popup
        v-model="playerVisible"
        position="center"
        round
        :z-index="2000"
        :close-on-click-modal="false"
        custom-class="course-player-popup"
      >
        <!-- 每次打开重建播放器,关闭即卸载,避免弹层隐藏后视频继续播放 -->
        <view
          v-if="playerVisible && currentLesson"
          class="w-[92vw] max-w-[420px] overflow-hidden rounded-2xl bg-black"
        >
          <VideoPlayer
            :src="currentLesson.videoUrl"
            :poster="course.coverImages[0]"
            :title="currentLesson.title"
            :playlist="playlist"
            :initial-position="initialPosition"
            video-id="courseLessonPlayer"
            @close="handlePlayerClose"
            @progress="handleProgress"
          />
        </view>
      </wd-popup>
    </template>
  </view>
</template>

<style lang="scss" scoped>
/* wd-popup 提升层级,确保居中弹层覆盖页面内容 */
:global(.course-player-popup) {
  z-index: 2000 !important;
}
</style>
