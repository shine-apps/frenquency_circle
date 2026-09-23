<script lang="ts" setup>
import type { Ref } from 'vue'
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { getFollowedCircles } from '@/api/circles'
import { getFollowedCourses } from '@/api/courses'
import { getFollowedUsers } from '@/api/users'
import { useCourseFollow } from '@/composables/useCourseFollow'
import { useFollowStore } from '@/store/follow'
import { activityLevelText, formatDate } from '@/utils/format'
import type { FollowedCircleDTO, FollowedCourseDTO, FollowedUserDTO, Paginated } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '我的关注',
    enablePullDownRefresh: true,
  },
  excludeLoginPath: false,
})

const PAGE_SIZE = 20

/** 标签展示最大数量 */
const MAX_TAG_VISIBLE = 3

/** Tab:users 我关注的人 / circles 我关注的圈子 / courses 我关注的视频 */
type TabKey = 'users' | 'circles' | 'courses'

const TABS: { key: TabKey, label: string }[] = [
  { key: 'users', label: '关注的人' },
  { key: 'circles', label: '关注的圈子' },
  { key: 'courses', label: '关注的视频' },
]

const activeTab = ref<TabKey>('users')

/** 分页列表状态(两个 Tab 各自独立,切换 Tab 不清空对方已加载数据) */
interface PagedList<T> {
  list: Ref<T[]>
  loading: Ref<boolean>
  finished: Ref<boolean>
  fetchList: (reset?: boolean) => Promise<void>
}

/**
 * 创建分页列表状态,统一处理分页/到底判定/错误提示。
 * @param fetcher 具体列表接口,由调用方注入
 */
function createPagedList<T>(
  fetcher: (params: { page: number, pageSize: number }) => Promise<Paginated<T>>,
): PagedList<T> {
  const list = ref<T[]>([]) as Ref<T[]>
  const loading = ref(false)
  const page = ref(1)
  const finished = ref(false)

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
      const res = await fetcher({ page: page.value, pageSize: PAGE_SIZE })
      list.value = reset ? res.list : [...list.value, ...res.list]
      // total 统计可能含已删除数据(与 list 口径略有偏差),故同时以「不足一页」兜底判定到底
      if (list.value.length >= res.total || res.list.length < PAGE_SIZE)
        finished.value = true
    }
    catch (e) {
      uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
    }
    finally {
      loading.value = false
    }
  }

  return { list, loading, finished, fetchList }
}

/** 跨页关注态(取消关注后同步课程列表 / 详情页按钮)+ 取关交互 */
const followStore = useFollowStore()
const { loadingId: unfollowingId, unfollow } = useCourseFollow()

const followedUsers = createPagedList<FollowedUserDTO>(params => getFollowedUsers(params))
const followedCircles = createPagedList<FollowedCircleDTO>(params => getFollowedCircles(params))
// 关注课程列表额外把服务端关注态回填跨页 store(带请求时刻,避免覆盖刚完成的操作)
const followedCourses = createPagedList<FollowedCourseDTO>(async (params) => {
  const requestedAt = Date.now()
  const res = await getFollowedCourses(params)
  followStore.syncCourses(res.list, { requestedAt })
  return res
})

// 模板内直接使用(顶层 ref 自动解包)
const users = followedUsers.list
const usersLoading = followedUsers.loading
const usersFinished = followedUsers.finished
const circles = followedCircles.list
const circlesLoading = followedCircles.loading
const circlesFinished = followedCircles.finished
const courses = followedCourses.list
const coursesLoading = followedCourses.loading
const coursesFinished = followedCourses.finished

/** 当前 Tab 是否已加载到底 */
const activeFinished = computed(() => {
  if (activeTab.value === 'users')
    return usersFinished.value
  return activeTab.value === 'circles' ? circlesFinished.value : coursesFinished.value
})

/**
 * 拉取指定 Tab 的列表。
 * @param tab 目标 Tab
 * @param reset 是否回到第一页
 */
function fetchTab(tab: TabKey, reset = false) {
  if (tab === 'users')
    return followedUsers.fetchList(reset)
  return tab === 'circles' ? followedCircles.fetchList(reset) : followedCourses.fetchList(reset)
}

// 进入时拉取当前 Tab(从对方主页/圈子详情返回也会触发 onShow 刷新)
onShow(() => {
  void fetchTab(activeTab.value, true)
})

// query 参数 tab 决定初始 Tab(非法值忽略,默认「我关注的人」)
onLoad((options) => {
  const tab = (options as { tab?: string } | undefined)?.tab
  if (tab === 'users' || tab === 'circles' || tab === 'courses')
    activeTab.value = tab
})

/** 切换 Tab:该 Tab 首次进入才拉取,已加载过则复用缓存 */
function handleTabChange(tab: TabKey) {
  if (tab === activeTab.value)
    return
  activeTab.value = tab
  if (tab === 'users') {
    if (users.value.length === 0 && !usersFinished.value)
      void followedUsers.fetchList(true)
  }
  else if (tab === 'circles') {
    if (circles.value.length === 0 && !circlesFinished.value)
      void followedCircles.fetchList(true)
  }
  else if (courses.value.length === 0 && !coursesFinished.value) {
    void followedCourses.fetchList(true)
  }
}

/** 下拉刷新:刷新当前 Tab */
onPullDownRefresh(() => {
  fetchTab(activeTab.value, true).finally(() => {
    uni.stopPullDownRefresh()
  })
})

/** 触底加载当前 Tab 的下一页 */
onReachBottom(() => {
  if (activeFinished.value)
    return
  void fetchTab(activeTab.value)
})

/** 跳对方主页 */
function handleUserClick(userId: string) {
  uni.navigateTo({ url: `/pages/user-home/user-home?id=${userId}` })
}

/** 跳圈子详情 */
function handleCircleClick(circleId: string) {
  uni.navigateTo({ url: `/pages/circle/circle?id=${circleId}` })
}

/** 跳课程详情播放页 */
function handleCourseClick(courseId: string) {
  uni.navigateTo({ url: `/pages/course-detail/course-detail?id=${courseId}` })
}

/** 跳课程作者公开主页(作者已被删除时为 null,不跳转) */
function handleTeacherClick(teacher: FollowedCourseDTO['teacher']) {
  if (!teacher)
    return
  uni.navigateTo({ url: `/pages/user-home/user-home?id=${teacher.id}` })
}

/**
 * 关注列表中取消关注:先本地移出保证点击反馈即时,再重置分页游标重拉第一页。
 *
 * - 必须显式调用 `unfollow`(而非 `toggle`):该项已作为"已关注"呈现,
 *   方向应固定为取关,不能依赖本地 store 反推(状态失真时会反向关注并给作者发通知);
 * - 必须重置分页:`loadMore` 按服务端 offset 取数,本地删除一条会让后续翻页
 *   跳过一项并提前判定「没有更多了」,重拉第一页使游标与服务端口径重新对齐。
 */
async function handleUnfollow(courseId: string) {
  const ok = await unfollow(courseId)
  if (!ok)
    return
  courses.value = courses.value.filter(c => c.id !== courseId)
  await followedCourses.fetchList(true)
}

/** 返回上一页 */
function handleBack() {
  uni.navigateBack({
    fail() {
      uni.reLaunch({ url: '/pages/me/me' })
    },
  })
}
</script>

<template>
  <view class="flex flex-col">
    <!-- ====== 顶部三 Tab(青绿下划线):我关注的人 / 圈子 / 视频 ====== -->
    <view class="flex bg-white shadow-sm">
      <view
        v-for="t in TABS"
        :key="t.key"
        class="flex-1 py-3 text-center text-sm"
        :class="activeTab === t.key ? 'border-b-2 border-[#018d71] font-medium text-[#018d71]' : 'text-[#666]'"
        @click="handleTabChange(t.key)"
      >
        {{ t.label }}
      </view>
    </view>

    <!-- ====== 我关注的人 ====== -->
    <view v-if="activeTab === 'users' && usersLoading && users.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <view v-else-if="activeTab === 'users' && users.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        还没有关注任何人,去首页发现吧
      </text>
      <wd-button class="mt-4" round size="small" @click="handleBack">
        返回
      </wd-button>
    </view>

    <view v-else-if="activeTab === 'users'" class="mx-4 mt-3 flex flex-col gap-3">
      <view
        v-for="u in users"
        :key="u.id"
        class="rounded-2xl bg-white p-4"
        @click="handleUserClick(u.id)"
      >
        <view class="flex items-center gap-3">
          <view class="h-12 w-12 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1]">
            <image v-if="u.avatarUrl" :src="u.avatarUrl" class="h-full w-full" mode="aspectFill" />
            <text v-else class="text-lg text-[#018d71] font-medium">
              {{ u.name ? u.name[0] : '?' }}
            </text>
          </view>
          <view class="min-w-0 flex-1">
            <view class="flex items-center justify-between">
              <text class="truncate text-base text-[#333] font-medium">
                {{ u.name }}
              </text>
              <text class="shrink-0 text-xs text-[#999]">
                {{ activityLevelText(u.activityLevel) }}
              </text>
            </view>
            <text class="mt-0.5 block text-xs text-[#999]">
              关注于 {{ formatDate(u.followedAt) }}
            </text>
          </view>
        </view>
        <view v-if="u.tags.length > 0" class="mt-3 flex flex-wrap gap-2">
          <template v-for="(name, i) in u.tags" :key="name">
            <text v-if="i < MAX_TAG_VISIBLE" class="rounded-full bg-[#e8f5f1] px-2.5 py-1 text-xs text-[#018d71]">
              {{ name }}
            </text>
          </template>
          <text v-if="u.tags.length > MAX_TAG_VISIBLE" class="text-xs text-[#999]">
            +{{ u.tags.length - MAX_TAG_VISIBLE }}
          </text>
        </view>
      </view>
      <text v-if="usersFinished && users.length > 0" class="py-3 text-center text-xs text-[#999]">
        没有更多了
      </text>
    </view>

    <!-- ====== 我关注的圈子 ====== -->
    <view v-else-if="activeTab === 'circles' && circlesLoading && circles.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <view v-else-if="activeTab === 'circles' && circles.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        还没有关注任何圈子,去首页发现吧
      </text>
      <wd-button class="mt-4" round size="small" @click="handleBack">
        返回
      </wd-button>
    </view>

    <view v-else-if="activeTab === 'circles'" class="mx-4 mt-3 flex flex-col gap-3">
      <view
        v-for="c in circles"
        :key="c.id"
        class="rounded-2xl bg-white p-4"
        @click="handleCircleClick(c.id)"
      >
        <view class="flex items-start justify-between gap-2">
          <view class="min-w-0 flex-1">
            <text class="block truncate text-base text-[#333] font-medium">
              {{ c.title }}
            </text>
            <view class="mt-1 flex items-center gap-1">
              <text class="text-xs text-[#999]">
                关注于 {{ formatDate(c.followedAt) }}
              </text>
            </view>
            <text v-if="c.activityTime" class="mt-1 block truncate text-xs text-[#999]">
              {{ c.activityTime }}
            </text>
          </view>
        </view>
      </view>
      <text v-if="circlesFinished && circles.length > 0" class="py-3 text-center text-xs text-[#999]">
        没有更多了
      </text>
    </view>

    <!-- ====== 我关注的视频 ====== -->
    <view v-else-if="coursesLoading && courses.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <view v-else-if="courses.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        还没有关注任何视频,去视频课程里发现吧
      </text>
      <wd-button class="mt-4" round size="small" @click="handleBack">
        返回
      </wd-button>
    </view>

    <view v-else class="mx-4 mt-3 flex flex-col gap-3">
      <view
        v-for="co in courses"
        :key="co.id"
        class="overflow-hidden rounded-2xl bg-white"
        @click="handleCourseClick(co.id)"
      >
        <!-- 封面:16:9 视觉区,无封面时浅绿占位 -->
        <view class="relative h-[160px] w-full overflow-hidden bg-[#e8f5f1]">
          <image
            v-if="co.coverImages.length > 0"
            :src="co.coverImages[0]"
            class="h-full w-full"
            mode="aspectFill"
          />
          <view v-else class="h-full w-full flex items-center justify-center">
            <text class="i-carbon-video text-4xl text-[#018d71]/30" />
          </view>
          <view class="absolute right-2 top-2 rounded-full bg-black/45 px-2.5 py-1">
            <text class="text-xs text-white">
              {{ co.lessonCount }} 课时
            </text>
          </view>
        </view>

        <view class="p-4">
          <text class="line-clamp-1 text-base text-[#333] font-medium">
            {{ co.title }}
          </text>

          <!-- 作者 + 关注时间(点作者跳公开主页,阻止冒泡避免进课程详情) -->
          <view class="mt-2 flex items-center justify-between gap-2">
            <view class="min-w-0 flex flex-1 items-center gap-2" @click.stop="handleTeacherClick(co.teacher)">
              <view class="h-6 w-6 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1]">
                <image v-if="co.teacher && co.teacher.avatarUrl" :src="co.teacher.avatarUrl" class="h-full w-full" mode="aspectFill" />
                <text v-else class="text-xs text-[#018d71]">
                  {{ co.teacher ? co.teacher.name[0] : '?' }}
                </text>
              </view>
              <text class="truncate text-xs text-[#666]">
                {{ co.teacher ? co.teacher.name : '作者已注销' }}
              </text>
            </view>
            <text class="shrink-0 text-xs text-[#999]">
              关注于 {{ formatDate(co.followedAt) }}
            </text>
          </view>

          <!-- 取消关注:成功后该项立即移出列表 -->
          <view class="mt-3 flex items-center justify-end border-t border-[#f2f2f2] pt-3" @click.stop>
            <wd-button
              size="small"
              plain
              :loading="unfollowingId === co.id"
              custom-class="shrink-0"
              @click.stop="handleUnfollow(co.id)"
            >
              取消关注
            </wd-button>
          </view>
        </view>
      </view>
      <text v-if="coursesFinished && courses.length > 0" class="py-3 text-center text-xs text-[#999]">
        没有更多了
      </text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
