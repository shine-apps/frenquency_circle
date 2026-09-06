<script lang="ts" setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import {
  acceptContactRequest,
  cancelContactRequest,
  getContactRequests,
  rejectContactRequest,
} from '@/api/users'
import { formatDateTime } from '@/utils/format'
import type { ContactRequestDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '联系请求',
    enablePullDownRefresh: true,
  },
  excludeLoginPath: false,
})

const PAGE_SIZE = 20

/** Tab:incoming 我收到的 / outgoing 我发出的 */
type Tab = 'incoming' | 'outgoing'

const activeTab = ref<Tab>('incoming')
const list = ref<ContactRequestDTO[]>([])
const loading = ref(false)
const page = ref(1)
const finished = ref(false)

/** 操作进行中的请求 id(按钮防重复点击) */
const actingId = ref<string | null>(null)

/** 服务端返回的真实总数(已过滤注销用户),与已加载条数解耦 */
const total = ref(0)
const currentTotal = computed(() => total.value)

/** 请求状态 → 徽标文案与配色 */
function statusMeta(status: ContactRequestDTO['status']): { label: string, cls: string } {
  if (status === 'accepted')
    return { label: '已通过', cls: 'bg-[#e8f5f1] text-[#018d71]' }
  if (status === 'rejected')
    return { label: '已婉拒', cls: 'bg-[#fdeaea] text-[#f56c6c]' }
  return { label: '待处理', cls: 'bg-[#fdf3e7] text-[#e68a00]' }
}

/** 拉取列表;reset=true 时回到第一页 */
async function fetchList(reset = false) {
  if (loading.value && !reset)
    return
  if (reset) {
    page.value = 1
    finished.value = false
  }
  loading.value = true
  try {
    const res = await getContactRequests({
      direction: activeTab.value,
      page: page.value,
      pageSize: PAGE_SIZE,
    })
    list.value = reset ? res.list : [...list.value, ...res.list]
    total.value = res.total
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

// 进入时拉取(从主页处理完返回也刷新)
onShow(() => {
  void fetchList(true)
})

/** 切换 Tab */
function handleTabChange(tab: Tab) {
  if (tab === activeTab.value)
    return
  activeTab.value = tab
  void fetchList(true)
}

/** 下拉刷新 */
onPullDownRefresh(() => {
  fetchList(true).finally(() => {
    uni.stopPullDownRefresh()
  })
})

/** 触底加载下一页 */
onReachBottom(() => {
  if (finished.value)
    return
  page.value += 1
  void fetchList()
})

/** 接收方:接受请求 */
async function handleAccept(item: ContactRequestDTO) {
  if (actingId.value)
    return
  actingId.value = item.id
  try {
    await acceptContactRequest(item.id)
    uni.showToast({ title: '已接受,可去对方主页查看微信号', icon: 'none' })
    await fetchList(true)
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '操作失败', icon: 'none' })
  }
  finally {
    actingId.value = null
  }
}

/** 接收方:拒绝请求 */
async function handleReject(item: ContactRequestDTO) {
  if (actingId.value)
    return
  actingId.value = item.id
  try {
    await rejectContactRequest(item.id)
    uni.showToast({ title: '已拒绝', icon: 'none' })
    await fetchList(true)
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '操作失败', icon: 'none' })
  }
  finally {
    actingId.value = null
  }
}

/** 发起方:撤回待处理请求 */
async function handleCancel(item: ContactRequestDTO) {
  if (actingId.value)
    return
  actingId.value = item.id
  try {
    await cancelContactRequest(item.id)
    uni.showToast({ title: '已撤回', icon: 'none' })
    await fetchList(true)
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '撤回失败', icon: 'none' })
  }
  finally {
    actingId.value = null
  }
}

/** 跳对方主页 */
function handleUserClick(userId: string) {
  uni.navigateTo({ url: `/pages/user-home/user-home?id=${userId}` })
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
    <!-- ====== 双 Tab 头部 ====== -->
    <view class="flex bg-white shadow-sm">
      <view
        class="flex-1 py-3 text-center text-sm"
        :class="activeTab === 'incoming' ? 'border-b-2 border-[#018d71] font-medium text-[#018d71]' : 'text-[#666]'"
        @click="handleTabChange('incoming')"
      >
        我收到的
      </view>
      <view
        class="flex-1 py-3 text-center text-sm"
        :class="activeTab === 'outgoing' ? 'border-b-2 border-[#018d71] font-medium text-[#018d71]' : 'text-[#666]'"
        @click="handleTabChange('outgoing')"
      >
        我发出的
      </view>
    </view>

    <view v-if="loading && list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <view v-else-if="list.length === 0" class="flex flex-col items-center pt-20">
      <text class="text-sm text-[#999]">
        {{ activeTab === 'incoming' ? '还没有收到联系请求,去匹配页发现同趣的人' : '还没有发出过联系请求' }}
      </text>
      <wd-button class="mt-4" round size="small" @click="handleBack">
        返回
      </wd-button>
    </view>

    <view v-else class="mx-4 mt-3 flex flex-col gap-3 pb-8">
      <view class="mb-1 text-xs text-[#999]">
        共 {{ currentTotal }} 条请求
      </view>
      <view
        v-for="r in list"
        :key="r.id"
        class="rounded-2xl bg-white p-4"
      >
        <view class="flex items-center gap-3" @click="handleUserClick(activeTab === 'incoming' ? r.fromUser.id : r.toUser.id)">
          <view class="h-12 w-12 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1]">
            <image
              v-if="(activeTab === 'incoming' ? r.fromUser.avatarUrl : r.toUser.avatarUrl)"
              :src="activeTab === 'incoming' ? r.fromUser.avatarUrl : r.toUser.avatarUrl"
              class="h-full w-full"
              mode="aspectFill"
            />
            <text v-else class="text-lg text-[#018d71] font-medium">
              {{ (activeTab === 'incoming' ? r.fromUser.name : r.toUser.name)?.[0] ?? '?' }}
            </text>
          </view>
          <view class="min-w-0 flex-1">
            <view class="flex items-center justify-between">
              <text class="truncate text-base text-[#333] font-medium">
                {{ activeTab === 'incoming' ? r.fromUser.name : r.toUser.name }}
              </text>
              <view class="shrink-0 rounded-full px-2 py-0.5" :class="statusMeta(r.status).cls">
                <text class="text-xs">
                  {{ statusMeta(r.status).label }}
                </text>
              </view>
            </view>
            <text class="mt-0.5 block text-xs text-[#999]">
              {{ formatDateTime(r.createdAt) }}
            </text>
          </view>
        </view>

        <!-- 留言 -->
        <view v-if="r.message" class="mt-3 rounded-xl bg-[#f5f6f7] px-3 py-2.5">
          <text class="block break-all text-sm text-[#666]">
            {{ r.message }}
          </text>
        </view>

        <!-- 操作区 -->
        <view class="mt-3 flex items-center justify-end gap-2.5">
          <!-- 收到的待处理:接受 / 拒绝 -->
          <template v-if="activeTab === 'incoming' && r.status === 'pending'">
            <button
              class="h-9 border border-[#e0e0e0] rounded-full bg-white px-5 text-sm text-[#666] leading-[36px] active:scale-95"
              :disabled="actingId === r.id"
              @click="handleReject(r)"
            >
              拒绝
            </button>
            <button
              class="h-9 rounded-full from-[#018d71] to-[#0aa07f] bg-gradient-to-br px-5 text-sm text-white leading-[36px] active:scale-95"
              :disabled="actingId === r.id"
              @click="handleAccept(r)"
            >
              接受
            </button>
          </template>
          <!-- 发出的待处理:撤回 -->
          <template v-else-if="activeTab === 'outgoing' && r.status === 'pending'">
            <button
              class="h-9 border border-[#e0e0e0] rounded-full bg-white px-5 text-sm text-[#666] leading-[36px] active:scale-95"
              :disabled="actingId === r.id"
              @click="handleCancel(r)"
            >
              撤回
            </button>
          </template>
        </view>
      </view>
      <text v-if="finished && list.length > 0" class="py-3 text-center text-xs text-[#999]">
        没有更多了
      </text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
