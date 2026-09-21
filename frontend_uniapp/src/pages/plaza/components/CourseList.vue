<script lang="ts" setup>
/**
 * 广场-课程列表(最新上线的视频课程,供广场页 Tab 复用)。
 *
 * - 调 GET /api/courses 拉取已上线课程,按创建时间倒序分页;
 * - 检索:关键词命中「标题 / 简介 / 标签」,由服务端过滤;
 *   输入防抖后回到第一页重拉(wd-search 的 change / search / clear 三个入口统一走 applyKeyword);
 * - 首次激活时拉取,后续由父级(广场页)在 onShow / 下拉 / 触底时
 *   通过 defineExpose 的 refresh / loadMore 委托调用(刷新保留当前关键词);
 * - 点击卡片跳课程详情播放页。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getCourses } from '@/api/courses'
import { debounce } from '@/utils/debounce'
import { formatDate, formatTotalDuration } from '@/utils/format'
import type { PublicCourseDTO } from '@/types'

const props = defineProps<{
  /** 是否为当前激活 tab(兜底:懒渲染场景下挂载即拉取) */
  active?: boolean
}>()

const PAGE_SIZE = 20
/** 检索输入防抖时长:避免逐字符触发请求 */
const SEARCH_DEBOUNCE_MS = 300

const list = ref<PublicCourseDTO[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const finished = ref(false)
/** 首屏加载失败(空态中展示重试入口;错误提示已由 http 拦截统一 toast) */
const loadFailed = ref(false)

/** 搜索框输入值(与生效关键词解耦:防抖之后才生效) */
const keywordInput = ref('')
/** 已生效的检索关键词(空串表示未检索) */
const appliedKeyword = ref('')

/** 拉取列表;reset=true 时回到第一页,检索沿用当前生效的关键词 */
async function fetchList(reset = false) {
  if (loading.value)
    return
  if (reset) {
    page.value = 1
    finished.value = false
  }
  loading.value = true
  try {
    const res = await getCourses({
      page: page.value,
      pageSize: PAGE_SIZE,
      keyword: appliedKeyword.value || undefined,
    })
    list.value = reset ? res.list : [...list.value, ...res.list]
    total.value = res.total
    loadFailed.value = false
    // total 与 list 口径一致,同时以「不足一页」兜底判定到底
    if (list.value.length >= res.total || res.list.length < PAGE_SIZE)
      finished.value = true
  }
  catch (e) {
    console.error('[plaza-course] fetch failed:', e)
    if (list.value.length === 0)
      loadFailed.value = true
  }
  finally {
    loading.value = false
  }
}

/** 刷新(reset=true 回到第一页),供父级下拉 / onShow 委托 */
async function refresh(reset = true) {
  await fetchList(reset)
}

/** 触底加载下一页 */
async function loadMore() {
  if (finished.value || loading.value)
    return
  page.value += 1
  await fetchList()
}

defineExpose({ refresh, loadMore })

/** 应用检索关键词:值未变化不重复请求,变化则回到第一页重拉 */
function applyKeyword(raw: string) {
  const next = raw.trim()
  if (next === appliedKeyword.value)
    return
  appliedKeyword.value = next
  void fetchList(true)
}

/** 输入防抖:连续输入只在停顿后触发一次检索 */
const applyKeywordDebounced = debounce(applyKeyword, SEARCH_DEBOUNCE_MS)

/** 输入变化(wd-search change):防抖检索 */
function handleKeywordChange({ value }: { value: string }) {
  applyKeywordDebounced(value)
}

/** 键盘确认(wd-search search):跳过防抖立即检索 */
function handleKeywordSearch({ value }: { value: string }) {
  applyKeywordDebounced.cancel()
  applyKeyword(value)
}

/** 清空检索:输入框与生效关键词一起清空,恢复全量列表 */
function handleResetKeyword() {
  keywordInput.value = ''
  applyKeywordDebounced.cancel()
  applyKeyword('')
}

/** 工具条提示:区分「检索中」与「未检索」两种口径 */
const hintText = computed(() => {
  if (appliedKeyword.value)
    return `「${appliedKeyword.value}」共 ${total.value} 门课程`
  return total.value > 0 ? `共 ${total.value} 门课程,跟着老师一起练` : '精选兴趣课程,随时随地学'
})

/** 空态文案:加载失败 / 检索无结果 / 暂无课程 */
const emptyText = computed(() => {
  if (loadFailed.value)
    return '课程加载失败,请检查网络后重试'
  if (appliedKeyword.value)
    return `没有找到与「${appliedKeyword.value}」相关的课程`
  return '暂无课程,敬请期待'
})

// 兜底:若父级 tab 为懒渲染,挂载时正处于激活态则自行拉取
onMounted(() => {
  if (props.active)
    void refresh(true)
})

// 卸载时取消未触发的防抖,避免离场后仍发起请求
onUnmounted(() => {
  applyKeywordDebounced.cancel()
})

/** 跳课程详情播放页 */
function goCourse(courseId: string) {
  uni.navigateTo({ url: `/pages/course-detail/course-detail?id=${courseId}` })
}
</script>

<template>
  <view class="flex flex-col">
    <!-- 工具条:检索框 + 统计 -->
    <view class="bg-white px-4 pb-3 pt-1">
      <wd-search
        v-model="keywordInput"
        placeholder="搜索课程名称 / 简介 / 标签"
        hide-cancel
        @change="handleKeywordChange"
        @search="handleKeywordSearch"
        @clear="handleResetKeyword"
      />
      <text class="mt-2 block text-xs text-[#999]">
        {{ hintText }}
      </text>
    </view>

    <!-- 加载中(首屏) -->
    <view v-if="loading && list.length === 0" class="flex flex-col items-center pt-16">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <!-- 空态 / 检索无结果 / 失败重试 -->
    <view v-else-if="list.length === 0" class="flex flex-col items-center pt-16">
      <text class="i-carbon-video text-5xl text-[#d9d9d9]" />
      <text class="mt-4 text-sm text-[#999]">
        {{ emptyText }}
      </text>
      <wd-button v-if="loadFailed" class="mt-4" round size="small" @click="fetchList(true)">
        重新加载
      </wd-button>
      <wd-button v-else-if="appliedKeyword" class="mt-4" round size="small" @click="handleResetKeyword">
        清空检索
      </wd-button>
    </view>

    <!-- 课程卡片流 -->
    <view v-else class="mx-4 mt-3 flex flex-col gap-3 pb-32">
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
          <text class="line-clamp-2 mt-1 text-xs text-[#999] leading-relaxed">
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
              {{ course.lessonCount }} 课时 · {{ formatTotalDuration(course.totalDurationSeconds) }} · {{ formatDate(course.updatedAt) }} 更新
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
