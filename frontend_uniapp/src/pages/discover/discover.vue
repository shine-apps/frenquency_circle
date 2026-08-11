<script lang="ts" setup>
import { nextTick, ref, watch } from 'vue'
import { searchUsers, searchCircles } from '@/api/search'
import { searchTags } from '@/api/tags'
import { highlightText, isFieldMatched } from '@/utils/highlight'
import { debounce } from '@/utils/debounce'
import type { CircleSearchResultDTO, SearchQueryParams, TagDTO, UserSearchResultDTO } from '@/types'

definePage({
  style: {
    navigationBarTitleText: '发现',
    navigationBarBackgroundColor: '#018d71',
    navigationBarTextStyle: 'white',
  },
})

/** Tab 类型 */
type DiscoverTab = 'people' | 'circles'

/** 分页常量 */
const PAGE_SIZE = 15

/** 热门标签最多展示数量 */
const HOT_TAGS_LIMIT = 12

/** 用户标签展示最大数量 */
const MAX_TAG_VISIBLE = 3

// ====== 状态 ======
const keyword = ref('')
const activeTab = ref<DiscoverTab>('people')
const hotTags = ref<TagDTO[]>([])
const loading = ref(false)

// 人列表
const peopleCache = ref<Record<number, UserSearchResultDTO[]>>({})
const peopleTotal = ref(0)

// 圈子列表
const circlesCache = ref<Record<number, CircleSearchResultDTO[]>>({})
const circlesTotal = ref(0)

/** 当前 tab 的结果列表(兼容 z-paging v-model) */
const currentList = ref<any[]>([])

// ====== 计算属性 ======
const isSearching = () => keyword.value.trim().length > 0

// ====== 热门标签(初始加载) ======
async function fetchHotTags() {
  try {
    const res = await searchTags('', HOT_TAGS_LIMIT)
    hotTags.value = res.list || []
  }
  catch (e) {
    console.warn('[Discover] hot tags fetch error:', e)
  }
}

// ====== 通用搜索 ======
async function doSearch(page: number = 1): Promise<{ list: any[]; total: number }> {
  const q = keyword.value.trim()
  if (!q) return { list: [], total: 0 }

  const params: SearchQueryParams = { q, page, pageSize: PAGE_SIZE }

  if (activeTab.value === 'people') {
    const res = await searchUsers(params)
    // 缓存结果
    peopleCache.value[page] = res.list
    peopleTotal.value = res.total
    return { list: res.list, total: res.total }
  }
  else {
    const res = await searchCircles(params)
    circlesCache.value[page] = res.list
    circlesTotal.value = res.total
    return { list: res.list, total: res.total }
  }
}

// ====== z-paging 查询回调 ======
/**
 * z-paging @query 事件处理。注意:Vue 3 emit() 不捕获返回值,
 * 需显式调用 pagingRef.complete() 通知 z-paging 加载完成/失败,
 * 否则组件会永远停在"正在刷新"状态。
 */
async function onQuery(pageNo: number) {
  const cache = activeTab.value === 'people' ? peopleCache.value : circlesCache.value

  // 命中缓存 → 同步返回,同时调用 complete 解除 z-paging 加载态
  if (cache[pageNo]) {
    currentList.value = cache[pageNo]
    pagingRef.value?.complete(cache[pageNo])
    return
  }

  loading.value = true
  try {
    const { list } = await doSearch(pageNo)
    currentList.value = list
    // 显式通知 z-paging 数据已加载完成,解除刷新/加载态
    pagingRef.value?.complete(list)
  }
  catch (e) {
    // 通知 z-paging 加载失败,停止刷新动画
    pagingRef.value?.complete(false)
    uni.showToast({ title: (e as Error).message || '搜索失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

// ====== z-paging ref(提前声明,供 debouncedSearch 闭包引用) ======
const pagingRef = ref<any>(null)

// ====== 防抖搜索(支持 cancel 取消) ======
const debouncedSearch = debounce(
  () => {
    // 清空缓存
    peopleCache.value = {}
    circlesCache.value = {}
    peopleTotal.value = 0
    circlesTotal.value = 0
    // reload() 内部会清空列表并显示刷新动画,无需手动置空 currentList
    pagingRef.value?.reload()
  },
  300,
)

/** 点击热门标签 → 仅设置关键词,后续由 watch(keyword) 驱动搜索 */
function onHotTagClick(tag: TagDTO) {
  keyword.value = tag.name
}

/** 点击人卡片→用户主页 */
function onPersonClick(userId: string) {
  uni.navigateTo({ url: `/pages/user-home/user-home?id=${userId}` })
}

/** 点击圈子卡片→圈子详情 */
function onCircleClick(circleId: string) {
  uni.navigateTo({ url: `/pages/circle/circle?id=${circleId}` })
}

// ====== 辅助函数 ======
function activityLevelText(level: string): string {
  if (level === 'low') return '低活跃'
  if (level === 'medium') return '中活跃'
  return '高活跃'
}

function practiceYearsText(years: number | null): string {
  if (years === null || years === undefined) return ''
  return `${years}年`
}

function formatActivityTime(iso: string | null): string {
  if (!iso) return '时间待定'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '时间待定'
    return `${d.getMonth() + 1}月${d.getDate()}日 ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  catch {
    return '时间待定'
  }
}

/** 渲染标签(最多 MAX_TAG_VISIBLE + "+N") */
function renderTags(tags: string[]): { visible: string[]; rest: number } {
  const visible = tags.slice(0, MAX_TAG_VISIBLE)
  return { visible, rest: tags.length - visible.length }
}

// ====== 响应式监听(watch 替代 @change 事件,避免 v-model 与 event 时序冲突) ======
/** 关键词变化 → 同步清空/防抖搜索 */
watch(keyword, (val) => {
  const trimmed = val.trim()
  if (trimmed.length === 0) {
    peopleCache.value = {}
    circlesCache.value = {}
    currentList.value = []
  }
  else {
    debouncedSearch()
  }
})

/** 找人/找圈子 Tab 切换 → 重置列表并重新加载 */
watch(activeTab, (newTab, oldTab) => {
  if (newTab === oldTab) return
  currentList.value = []
  if (isSearching()) {
    nextTick(() => {
      pagingRef.value?.reload()
    })
  }
})

// ====== 生命周期 ======
onShow(() => {
  if (hotTags.value.length === 0) {
    fetchHotTags()
  }
})

/** 离开页面时取消防抖定时器,避免内存泄漏和无效请求 */
onHide(() => {
  debouncedSearch.cancel()
})
</script>

<template>
  <!--
    布局说明:z-paging 默认使用内部 scroll-view 滚动(usePageScroll=false),
    其 `slot="top"` 为顶部固定区域,不随列表滚动。将搜索栏/Tab/热门标签
    放入 top 插槽,由 z-paging 内部管理布局,可从根本上避免列表覆盖顶部区域。
    外层容器需提供确定高度(h-screen),z-paging 才能正确计算 height:100%。
  -->
  <view class="flex h-screen flex-col bg-[#f7f8fa]">
    <z-paging
      ref="pagingRef"
      v-model="currentList"
      :default-page-size="PAGE_SIZE"
      :auto="false"
      :show-refresher-when-reload="true"
      refresher-default-text="下拉刷新"
      loading-more-default-text="加载更多..."
      loading-more-no-more-text="— 没有更多了 —"
      empty-view-text="未找到相关结果"
      @query="onQuery"
    >
      <!-- ====== 顶部固定区域:搜索栏 + Tab + 热门标签 ====== -->
      <template #top>
        <!-- 顶部搜索栏 -->
        <view class="bg-[#018d71] px-4 pb-3 pt-2">
          <wd-search
            v-model="keyword"
            placeholder="搜索同频的人或圈子"
            hide-cancel
            :light="false"
            custom-style="--wot-search-bg: rgba(255,255,255,0.2); --wot-search-color: #fff; --wot-search-placeholder-color: rgba(255,255,255,0.7); --wot-search-border-radius: 22px;"
          />
        </view>

        <!-- Tab 切换 -->
        <wd-tabs
          v-model="activeTab"
          :duration="250"
          custom-style="--wot-tabs-nav-background: #fff;"
        >
          <wd-tab title="找人" name="people" />
          <wd-tab title="找圈子" name="circles" />
        </wd-tabs>

        <!-- 热门标签入口(未搜索时) -->
        <view v-if="!isSearching() && hotTags.length > 0" class="bg-white px-4 pb-4">
          <text class="mb-3 block text-sm font-medium text-[#333]">
            热门标签
          </text>
          <view class="flex flex-wrap gap-2.5">
            <view
              v-for="tag in hotTags"
              :key="tag.id"
              class="rounded-full border border-[#e0e0e0] bg-[#f7f8fa] px-3.5 py-1.5 active:opacity-70"
              @click="onHotTagClick(tag)"
            >
              <text class="text-xs text-[#666]">
                {{ tag.name }}
              </text>
            </view>
          </view>
        </view>
      </template>

      <!-- ====== 列表内容(搜索时) ====== -->
      <template v-if="isSearching()">
        <!-- 人卡片列表(pb-32 避让底部 tabbar) -->
        <view v-if="activeTab === 'people'" class="px-4 pb-32 pt-3">
          <view class="flex flex-col gap-3">
            <view
              v-for="item in currentList"
              :key="(item as UserSearchResultDTO).userId"
              class="rounded-2xl bg-white p-4 shadow-sm active:opacity-80"
              @click="onPersonClick((item as UserSearchResultDTO).userId)"
            >
              <view class="flex items-center gap-3">
                <!-- 头像 -->
                <view class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1]">
                  <image
                    v-if="(item as UserSearchResultDTO).avatarUrl"
                    :src="(item as UserSearchResultDTO).avatarUrl"
                    class="h-full w-full"
                    mode="aspectFill"
                  />
                  <text v-else class="text-lg font-medium text-[#018d71]">
                    {{ (item as UserSearchResultDTO).name ? (item as UserSearchResultDTO).name[0] : '?' }}
                  </text>
                </view>
                <view class="min-w-0 flex-1">
                  <view class="flex items-center gap-1.5">
                    <!-- 名称(高亮) -->
                    <text
                      v-for="(seg, si) in highlightText((item as UserSearchResultDTO).name, keyword)"
                      :key="si"
                      :class="seg.highlight ? 'font-semibold text-[#018d71]' : 'text-[#333]'"
                      class="text-base leading-snug"
                    >
                      {{ seg.text }}
                    </text>
                  </view>
                  <view class="mt-1 flex items-center gap-1">
                    <text class="text-xs text-[#999]">
                      {{ activityLevelText((item as UserSearchResultDTO).activityLevel) }}
                    </text>
                    <template v-if="(item as UserSearchResultDTO).practiceYears !== null && (item as UserSearchResultDTO).practiceYears !== undefined">
                      <text class="text-xs text-[#ccc]">·</text>
                      <text class="text-xs text-[#999]">{{ practiceYearsText((item as UserSearchResultDTO).practiceYears) }}</text>
                    </template>
                  </view>
                </view>
              </view>
              <!-- 标签 -->
              <view v-if="(item as UserSearchResultDTO).tags.length > 0" class="mt-3 flex flex-wrap gap-2">
                <template v-for="name in renderTags((item as UserSearchResultDTO).tags).visible" :key="name">
                  <text
                    class="rounded-full bg-[#e8f5f1] px-2.5 py-1 text-xs"
                    :class="isFieldMatched((item as UserSearchResultDTO).matchedFields, 'tag') ? 'font-medium text-[#018d71]' : 'text-[#018d71]'"
                  >
                    <template v-for="(seg, si) in highlightText(name, keyword)" :key="si">
                      <text v-if="seg.highlight" class="font-semibold">{{ seg.text }}</text>
                      <text v-else>{{ seg.text }}</text>
                    </template>
                  </text>
                </template>
                <text v-if="renderTags((item as UserSearchResultDTO).tags).rest > 0" class="text-xs text-[#999]">
                  +{{ renderTags((item as UserSearchResultDTO).tags).rest }}
                </text>
              </view>
            </view>
          </view>
        </view>

        <!-- 圈子卡片列表(pb-32 避让底部 tabbar) -->
        <view v-else class="px-4 pb-32 pt-3">
          <view class="flex flex-col gap-3">
            <view
              v-for="item in currentList"
              :key="(item as CircleSearchResultDTO).circleId"
              class="rounded-2xl bg-white p-4 shadow-sm active:opacity-80"
              @click="onCircleClick((item as CircleSearchResultDTO).circleId)"
            >
              <view class="flex items-start gap-3">
                <!-- 圈子图标 -->
                <view class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#fdf3e7]">
                  <text class="text-lg font-medium text-[#e68a00]">圈</text>
                </view>
                <view class="min-w-0 flex-1">
                  <!-- 标题(高亮) -->
                  <view class="flex items-center gap-1.5">
                    <text
                      v-for="(seg, si) in highlightText((item as CircleSearchResultDTO).title, keyword)"
                      :key="si"
                      :class="seg.highlight ? 'font-semibold text-[#018d71]' : 'text-[#333]'"
                      class="text-base leading-snug"
                    >
                      {{ seg.text }}
                    </text>
                  </view>
                  <!-- 描述(高亮, 2行截断) -->
                  <text
                    v-if="(item as CircleSearchResultDTO).description"
                    class="mt-1 line-clamp-2 text-xs leading-relaxed text-[#999]"
                  >
                    <template v-for="(seg, si) in highlightText((item as CircleSearchResultDTO).description, keyword)" :key="si">
                      <text v-if="seg.highlight" class="font-semibold text-[#018d71]">{{ seg.text }}</text>
                      <text v-else>{{ seg.text }}</text>
                    </template>
                  </text>
                  <!-- 元信息 -->
                  <view class="mt-1.5 flex items-center gap-1">
                    <text class="text-xs text-[#999]">{{ formatActivityTime((item as CircleSearchResultDTO).activityTime) }}</text>
                    <text class="text-xs text-[#ccc]">·</text>
                    <text class="text-xs text-[#999]">{{ (item as CircleSearchResultDTO).memberCount }}/{{ (item as CircleSearchResultDTO).maxMembers ?? '∞' }}人</text>
                    <text v-if="(item as CircleSearchResultDTO).address" class="text-xs text-[#ccc]">·</text>
                    <text v-if="(item as CircleSearchResultDTO).address" class="truncate text-xs text-[#999]">{{ (item as CircleSearchResultDTO).address }}</text>
                  </view>
                </view>
              </view>
              <!-- 标签 -->
              <view v-if="(item as CircleSearchResultDTO).tags.length > 0" class="mt-3 flex flex-wrap gap-2">
                <template v-for="name in renderTags((item as CircleSearchResultDTO).tags).visible" :key="name">
                  <text class="rounded-full bg-[#fdf3e7] px-2.5 py-1 text-xs text-[#e68a00]">
                    <template v-for="(seg, si) in highlightText(name, keyword)" :key="si">
                      <text v-if="seg.highlight" class="font-semibold">{{ seg.text }}</text>
                      <text v-else>{{ seg.text }}</text>
                    </template>
                  </text>
                </template>
                <text v-if="renderTags((item as CircleSearchResultDTO).tags).rest > 0" class="text-xs text-[#999]">
                  +{{ renderTags((item as CircleSearchResultDTO).tags).rest }}
                </text>
              </view>
            </view>
          </view>
        </view>
      </template>

      <!-- ====== 未搜索且无热门标签时的初始空状态 ====== -->
      <template v-else>
        <view v-if="hotTags.length === 0" class="flex flex-1 flex-col items-center justify-center py-20">
          <text class="text-[#ccc]" style="font-size: 56px;">🔍</text>
          <text class="mt-3 text-sm text-[#999]">输入关键词探索同频的人与圈子</text>
        </view>
      </template>
    </z-paging>
  </view>
</template>

<style lang="scss" scoped>
// z-paging 内置样式覆盖(如需)
</style>
