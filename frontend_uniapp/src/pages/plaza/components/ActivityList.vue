<script lang="ts" setup>
/**
 * 广场-活动列表(最新发布的活动,供广场页 Tab 复用)。
 *
 * - 调 GET /api/activities 拉取全部 active 活动,按起始时间倒序分页;
 * - 首次激活时拉取,后续由父级(广场页)在 onShow / 下拉 / 触底时
 *   通过 defineExpose 的 refresh / loadMore 委托调用;
 * - 点击卡片跳活动详情。
 */
import { ref } from 'vue'
import { onMounted } from 'vue'
import { getActivities } from '@/api/activities'
import ActivityCard from '@/components/ActivityCard/ActivityCard.vue'
import type { ActivityDTO } from '@/types'

const props = defineProps<{
  /** 是否为当前激活 tab(兜底:懒渲染场景下挂载即拉取) */
  active?: boolean
}>()

const PAGE_SIZE = 20

const list = ref<ActivityDTO[]>([])
const loading = ref(false)
const total = ref(0)
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
    const res = await getActivities({ page: page.value, pageSize: PAGE_SIZE })
    list.value = reset ? (res?.list || []) : [...list.value, ...(res?.list || [])]
    total.value = res?.total || 0
    // total 与 list 口径一致,同时以「不足一页」兜底判定到底
    if (list.value.length >= total.value || (res?.list || []).length < PAGE_SIZE)
      finished.value = true
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
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

// 兜底:若父级 tab 为懒渲染,挂载时正处于激活态则自行拉取
onMounted(() => {
  if (props.active)
    void refresh(true)
})

/** 跳活动详情 */
function goActivity(activity: ActivityDTO) {
  uni.navigateTo({ url: `/pages/activity/activity?activityId=${activity.id}` })
}
</script>

<template>
  <view class="flex flex-col">
    <!-- 工具条:统计 -->
    <view class="bg-white px-4 pb-3 pt-1">
      <text class="text-xs text-[#999]">
        {{ total > 0 ? `共 ${total} 个活动,按起始时间排序` : '发现身边的精彩活动' }}
      </text>
    </view>

    <!-- 加载中 -->
    <view v-if="loading && list.length === 0" class="flex flex-col items-center pt-16">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <!-- 空态 -->
    <view v-else-if="list.length === 0" class="flex flex-col items-center pt-16">
      <text class="i-carbon-events text-5xl text-[#d9d9d9]" />
      <text class="mt-4 text-sm text-[#999]">
        暂无活动,敬请期待
      </text>
    </view>

    <!-- 卡片流 -->
    <view v-else class="mx-4 mt-3 flex flex-col gap-3 pb-32">
      <ActivityCard
        v-for="a in list"
        :key="a.id"
        :activity="a"
        clickable
        @tap="goActivity"
      />
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
//
</style>
