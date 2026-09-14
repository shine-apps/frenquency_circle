<script lang="ts" setup>
/**
 * 打卡广场(Tab 页,替换原「活动广场」)。
 *
 * - 仅展示「含图片或视频」的打卡(纯文字打卡不上广场);
 * - 按发布时间倒序分页,支持下拉刷新 / 触底加载;
 * - 右下角悬浮发布按钮进入发布打卡页。
 *
 * 游客策略:未登录可进入本页并预览**第一页**,触底翻页时引导登录
 * (服务端同样限制未登录只能取第一页,前端只是提前拦截并给出引导)。
 */
import { computed, ref } from 'vue'
import { onReachBottom, onShow } from '@dcloudio/uni-app'
import { getPlazaCheckins } from '@/api/checkins'
import CheckinCard from '@/components/CheckinCard/CheckinCard.vue'
import { useUserStore } from '@/store/user'
import { toLoginWithRedirect } from '@/utils/toLoginPage'
import type { CheckinDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '打卡广场',
    enablePullDownRefresh: true,
  },
  // 免登录:游客可预览第一页,翻页时再引导登录
  excludeLoginPath: true,
})

const PAGE_SIZE = 20

const userStore = useUserStore()

const list = ref<CheckinDTO[]>([])
const loading = ref(false)
const total = ref(0)
const page = ref(1)
const finished = ref(false)

/** 是否已登录(游客仅能看第一页) */
const isLoggedIn = computed(() => userStore.isLoggedIn)
/** 登录引导弹窗是否已弹出(每次进入页面只自动引导一次) */
let loginPromptVisible = false

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
    const res = await getPlazaCheckins({ page: page.value, pageSize: PAGE_SIZE })
    list.value = reset ? res.list : [...list.value, ...res.list]
    total.value = res.total
    // total 与 list 口径一致,同时以「不足一页」兜底判定到底
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

// 进入时拉取(从发布页返回也会触发 onShow 刷新)
onShow(() => {
  void fetchList(true)
})

/** 下拉刷新 */
onPullDownRefresh(() => {
  fetchList(true).finally(() => {
    uni.stopPullDownRefresh()
  })
})

/** 触底加载下一页(游客引导登录,不再请求下一页) */
onReachBottom(() => {
  if (finished.value)
    return
  if (!isLoggedIn.value) {
    promptLogin()
    return
  }
  page.value += 1
  void fetchList()
})

/** 跳登录页(携带 redirect,登录后回到打卡广场) */
function handleLogin() {
  toLoginWithRedirect('navigateTo')
}

/** 游客翻页:弹窗引导登录(每次进入页面只自动引导一次,避免反复触底重复打扰;底部另有常驻登录入口) */
function promptLogin() {
  if (loginPromptVisible)
    return
  // 不复位:重复触底不再弹窗(如需区分语义,可把该标记重命名为 loginPrompted)
  loginPromptVisible = true
  uni.showModal({
    title: '登录后可查看更多',
    content: '打卡广场支持免登录浏览最新内容,登录后即可继续往下翻看。',
    confirmText: '去登录',
    cancelText: '暂不',
    success: (res) => {
      if (res.confirm)
        handleLogin()
    },
  })
}

/** 去发布打卡(未登录先引导登录) */
function handleCreate() {
  if (!isLoggedIn.value) {
    handleLogin()
    return
  }
  uni.navigateTo({ url: '/pages/create-checkin/create-checkin' })
}

/** 跳圈子详情 */
function handleCircle(circleId: string) {
  uni.navigateTo({ url: `/pages/circle/circle?id=${circleId}` })
}

/** 跳打卡详情(分享落地页) */
function handleCheckinTap(checkin: CheckinDTO) {
  uni.navigateTo({ url: `/pages/checkin-detail/checkin-detail?id=${checkin.id}` })
}
</script>

<template>
  <view class="min-h-screen flex flex-col bg-[#f7f8fa]">
    <!-- 头部:标题 + 发布入口 -->
    <view class="flex items-center justify-between bg-white px-4 py-4">
      <view class="flex flex-col">
        <text class="text-base text-[#333] font-semibold">
          打卡广场
        </text>
        <text class="mt-1 text-xs text-[#999]">
          {{ total > 0 ? `共 ${total} 条打卡${isLoggedIn ? '' : ' · 登录后可看更多'}` : '记录你的兴趣日常' }}
        </text>
      </view>
      <view class="flex items-center gap-1 rounded-full bg-[#e8f5f1] px-3 py-1.5" @click="handleCreate">
        <text class="i-carbon-add text-sm text-[#018d71]" />
        <text class="text-xs text-[#018d71] font-medium">
          去打卡
        </text>
      </view>
    </view>

    <!-- 加载中 -->
    <view v-if="loading && list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <!-- 空态 -->
    <view v-else-if="list.length === 0" class="flex flex-col items-center pt-20">
      <text class="i-carbon-calendar-heat-map text-5xl text-[#d9d9d9]" />
      <text class="mt-4 text-sm text-[#999]">
        还没有打卡,来发布第一条吧
      </text>
      <wd-button class="mt-4" round size="small" @click="handleCreate">
        发布打卡
      </wd-button>
    </view>

    <!-- 卡片流 -->
    <view v-else class="mx-4 mt-3 flex flex-col gap-3 pb-32">
      <CheckinCard
        v-for="item in list"
        :key="item.id"
        :checkin="item"
        clickable
        @tap="handleCheckinTap"
        @circle="handleCircle"
      />
      <text v-if="finished" class="py-3 text-center text-xs text-[#999]">
        没有更多了
      </text>
      <text v-else-if="loading" class="py-3 text-center text-xs text-[#999]">
        加载中...
      </text>
      <!-- 游客:第一页预览结束,引导登录继续翻看 -->
      <view v-else-if="!isLoggedIn" class="flex flex-col items-center pb-2 pt-1">
        <text class="text-xs text-[#999]">
          登录后可查看更多打卡
        </text>
        <wd-button class="mt-3" round size="small" @click="handleLogin">
          立即登录
        </wd-button>
      </view>
    </view>

    <!-- 悬浮发布按钮(Tab 栏之上) -->
    <view
      class="fixed bottom-[140rpx] right-4 h-12 w-12 flex items-center justify-center rounded-full bg-[#018d71] shadow-lg"
      @click="handleCreate"
    >
      <text class="i-carbon-add text-2xl text-white" />
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
