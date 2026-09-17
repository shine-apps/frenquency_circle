<script lang="ts" setup>
/**
 * 视频课程列表页(用户端)。
 *
 * - 调 GET /api/courses 拉取已上线课程,按创建时间倒序分页;
 * - 支持下拉刷新 / 触底加载更多,首屏失败可在空态中重试;
 * - 点击卡片跳课程详情播放页。
 * 入口:我的 → 视频课程。
 */
import { ref } from 'vue'
import { onReachBottom, onPullDownRefresh, onShow } from '@dcloudio/uni-app'
import { getCourses } from '@/api/courses'
import { formatDate } from '@/utils/format'
import type { PublicCourseDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '视频课程',
    enablePullDownRefresh: true,
  },
  excludeLoginPath: false,
})

const PAGE_SIZE = 10

const list = ref<PublicCourseDTO[]>([])
const total = ref(0)
const page = ref(1)
const loading = ref(false)
const finished = ref(false)
/** 首屏加载失败(空态中展示重试入口;错误提示已由 http 拦截统一 toast) */
const loadFailed = ref(false)

/** 拉取列表;reset=true 时回到第一页 */
async function fetchList(reset = false) {
  if (loading.value)
    return
  if (reset) {
    page.value = 1
    finished.value = false
  }
  loading.value = true
  try {
    const res = await getCourses({ page: page.value, pageSize: PAGE_SIZE })
    list.value = reset ? res.list : [...list.value, ...res.list]
    total.value = res.total
    loadFailed.value = false
    // total 与 list 口径一致,同时以「不足一页」兜底判定到底
    if (list.value.length >= res.total || res.list.length < PAGE_SIZE)
      finished.value = true
  }
  catch (e) {
    console.error('[course-list] fetch failed:', e)
    if (list.value.length === 0)
      loadFailed.value = true
  }
  finally {
    loading.value = false
  }
}

// 进入时拉取(从详情页返回也会触发 onShow,保持数据新鲜)
onShow(() => {
  void fetchList(true)
})

/** 下拉刷新 */
onPullDownRefresh(() => {
  fetchList(true).finally(() => {
    uni.stopPullDownRefresh()
  })
})

/** 触底加载下一页 */
onReachBottom(() => {
  if (finished.value || loading.value)
    return
  page.value += 1
  void fetchList()
})

/** 跳课程详情播放页 */
function goCourse(courseId: string) {
  uni.navigateTo({ url: `/pages/course-detail/course-detail?id=${courseId}` })
}
</script>

<template>
  <view class="min-h-screen flex flex-col bg-[#f7f8fa]">
    <!-- 头部:标题 + 说明 -->
    <view class="flex items-center justify-between bg-white px-4 py-4">
      <view class="flex flex-col">
        <text class="text-base text-[#333] font-semibold">
          视频课程
        </text>
        <text class="mt-1 text-xs text-[#999]">
          {{ total > 0 ? `共 ${total} 门课程,跟着老师一起练` : '精选兴趣课程,随时随地学' }}
        </text>
      </view>
      <view class="flex items-center gap-1 rounded-full bg-[#e8f5f1] px-3 py-1.5">
        <text class="i-carbon-play text-sm text-[#018d71]" />
        <text class="text-xs text-[#018d71] font-medium">
          在线观看
        </text>
      </view>
    </view>

    <!-- 加载中(首屏) -->
    <view v-if="loading && list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <!-- 空态 / 失败重试 -->
    <view v-else-if="list.length === 0" class="flex flex-col items-center pt-20">
      <text class="i-carbon-video text-5xl text-[#d9d9d9]" />
      <text class="mt-4 text-sm text-[#999]">
        {{ loadFailed ? '课程加载失败,请检查网络后重试' : '暂无课程,敬请期待' }}
      </text>
      <wd-button v-if="loadFailed" class="mt-4" round size="small" @click="fetchList(true)">
        重新加载
      </wd-button>
    </view>

    <!-- 课程卡片流 -->
    <view v-else class="mx-4 mt-3 flex flex-col gap-3 pb-10">
      <view
        v-for="(course, idx) in list"
        :key="course.id"
        class="course-card overflow-hidden rounded-2xl bg-white shadow-sm active:opacity-80"
        :style="{ animationDelay: `${Math.min(idx, 6) * 40}ms` }"
        @click="goCourse(course.id)"
      >
        <!-- 封面:16:9 视觉区,无封面时浅绿占位 -->
        <view class="relative h-[180px] w-full overflow-hidden bg-[#e8f5f1]">
          <image
            v-if="course.coverImages.length > 0"
            :src="course.coverImages[0]"
            class="h-full w-full"
            mode="aspectFill"
          />
          <view v-else class="h-full w-full flex items-center justify-center">
            <text class="i-carbon-video text-5xl text-[#018d71]/30" />
          </view>

          <!-- 居中播放按钮:无封面时由占位图标表达视频语义,避免与之重叠 -->
          <view
            v-if="course.coverImages.length > 0"
            class="absolute left-0 top-0 h-full w-full flex items-center justify-center"
          >
            <view class="h-12 w-12 flex items-center justify-center rounded-full bg-black/35">
              <text class="i-carbon-play-filled text-2xl text-white" />
            </view>
          </view>

          <!-- 课时数角标 -->
          <view class="absolute right-2 top-2 rounded-full bg-black/45 px-2.5 py-1">
            <text class="text-xs text-white">
              {{ course.lessonCount }} 课时
            </text>
          </view>
        </view>

        <!-- 课程信息 -->
        <view class="px-4 pb-4 pt-3">
          <text class="line-clamp-1 text-base text-[#333] font-medium">
            {{ course.title }}
          </text>
          <text class="mt-1 line-clamp-2 text-xs text-[#999] leading-relaxed">
            {{ course.description }}
          </text>
          <view class="mt-2.5 flex flex-wrap items-center gap-2">
            <text
              v-for="tag in course.tags.slice(0, 3)"
              :key="tag"
              class="rounded-full bg-[#e8f5f1] px-2.5 py-1 text-xs text-[#018d71]"
            >
              {{ tag }}
            </text>
            <text class="text-xs text-[#999]">
              {{ formatDate(course.updatedAt) }} 更新
            </text>
          </view>
        </view>
      </view>

      <text v-if="finished" class="py-3 text-center text-xs text-[#999]">
        没有更多了
      </text>
      <text v-else-if="loading" class="py-3 text-center text-xs text-[#999]">
        加载中...
      </text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
/* 卡片轻微上浮渐显:进入列表时依次错峰出现(动画延迟见模板 animationDelay) */
.course-card {
  animation: course-card-in 0.32s ease-out both;
}

@keyframes course-card-in {
  from {
    opacity: 0;
    transform: translateY(12rpx);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
