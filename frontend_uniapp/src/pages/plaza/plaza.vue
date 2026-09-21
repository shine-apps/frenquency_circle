<script lang="ts" setup>
/**
 * 广场(Tab 页,替换原「打卡广场」)。
 *
 * - 顶部 wd-tabs 三标签:打卡 / 活动 / 课程;
 * - 「打卡」展示最新打卡列表(沿用原打卡广场逻辑,含游客第一页策略);
 * - 「活动」展示最新发布的活动列表;
 * - 「课程」展示最新上线的视频课程(支持按名称 / 简介 / 标签检索);应用发布维护中(isAppDeploying 为 true)时隐藏该 tab,禁止停留在该 tab;
 * - 列表数据各自封装在子组件中,本页只负责:
 *   1) tab 切换时懒加载未加载过的 tab(已加载的保留内容,不重置滚动);
 *   2) 页面级 onShow / 下拉刷新 / 触底加载 委托给当前激活 tab 的子组件。
 */
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { onPullDownRefresh, onReachBottom, onReady, onShow } from '@dcloudio/uni-app'
import { useSettingsStore } from '@/store/settings'
import ActivityList from './components/ActivityList.vue'
import CheckinList from './components/CheckinList.vue'
import CourseList from './components/CourseList.vue'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '广场',
    enablePullDownRefresh: true,
  },
  // 免登录:游客可预览第一页,翻页时再引导登录
  excludeLoginPath: true,
})

/** 广场子 tab 名称 */
type PlazaTab = 'checkin' | 'activity' | 'course'

const settingsStore = useSettingsStore()
/** 应用发布维护中(isAppDeploying 为 true):隐藏「课程」tab(课程入口统一口径) */
const isAppDeploying = computed(() => settingsStore.isAppDeploying)

const activeTab = ref<PlazaTab>('checkin')

const checkinListRef = ref<InstanceType<typeof CheckinList> | null>(null)
const activityListRef = ref<InstanceType<typeof ActivityList> | null>(null)
const courseListRef = ref<InstanceType<typeof CourseList> | null>(null)

/** 各 tab 是否已加载过(首次切换时懒加载) */
const loadedTabs = reactive<Record<PlazaTab, boolean>>({
  checkin: false,
  activity: false,
  course: false,
})

/** 当前激活 tab 对应的列表组件(三个 tab 均实现 refresh / loadMore) */
function getActiveListRef() {
  switch (activeTab.value) {
    case 'checkin':
      return checkinListRef.value
    case 'activity':
      return activityListRef.value
    default:
      return courseListRef.value
  }
}

/** 刷新当前 tab 列表(reset=true 回到第一页) */
async function refreshActive(reset = true) {
  const comp = getActiveListRef()
  if (!comp)
    return
  loadedTabs[activeTab.value] = true
  await comp.refresh(reset)
}

/** 触底加载当前 tab 下一页 */
function loadMoreActive() {
  void getActiveListRef()?.loadMore()
}

// 首次切换到某 tab 时懒加载;nextTick 等待 tab 面板挂载完成再取 ref
watch(activeTab, (name) => {
  void nextTick(() => {
    if (!loadedTabs[name])
      void refreshActive(true)
  })
})

// 维护期开启时,若当前停留在「课程」tab,切回「打卡」,避免停留在已隐藏的 tab
watch(isAppDeploying, (deploying) => {
  if (deploying && activeTab.value === 'course')
    activeTab.value = 'checkin'
})

// 页面生命周期:仅首次进入由 onReady 拉取(此时子组件已挂载);
// 从发布页等返回触发的 onShow 刷新当前 tab
let shownOnce = false
onReady(() => {
  void refreshActive(true)
})
onShow(() => {
  // 每次回到广场同步一次系统设置(命中 10 分钟缓存时无网络开销),保证维护开关变化即时生效
  void settingsStore.getSettings().catch(() => { /* 拉取失败沿用旧值 */ })
  if (!shownOnce) {
    shownOnce = true
    return
  }
  void refreshActive(true)
})

/** 下拉刷新当前 tab */
onPullDownRefresh(() => {
  refreshActive(true).finally(() => {
    uni.stopPullDownRefresh()
  })
})

/** 触底加载下一页 */
onReachBottom(() => {
  loadMoreActive()
})
</script>

<template>
  <view class="min-h-screen flex flex-col bg-[#f7f8fa]">
    <!-- 头部:标题 -->
    <view class="bg-white px-4 pb-1 pt-4">
      <text class="text-base text-[#333] font-semibold">
        广场
      </text>
      <text class="mt-1 block text-xs text-[#999]">
        {{ isAppDeploying ? '打卡动态 · 活动,一站式浏览' : '打卡动态 · 活动 · 课程,一站式浏览' }}
      </text>
    </view>

    <!-- 顶部 tabs + 三栏内容(面板由组件内部 v-show 切换) -->
    <wd-tabs v-model="activeTab" sticky>
      <wd-tab title="打卡" name="checkin">
        <CheckinList ref="checkinListRef" />
      </wd-tab>
      <wd-tab title="活动" name="activity">
        <ActivityList ref="activityListRef" :active="activeTab === 'activity'" />
      </wd-tab>
      <!-- 应用发布维护中隐藏课程入口(课程功能不开放) -->
      <wd-tab v-if="!isAppDeploying" title="课程" name="course">
        <CourseList ref="courseListRef" :active="activeTab === 'course'" />
      </wd-tab>
    </wd-tabs>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
