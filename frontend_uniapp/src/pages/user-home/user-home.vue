<script lang="ts" setup>
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getUserProfile } from '@/api/search'
import {
  acceptContactRequest,
  cancelContactRequest,
  createContactRequest,
  followUser,
  rejectContactRequest,
  unfollowUser,
} from '@/api/users'
import { toLoginPage } from '@/utils/toLoginPage'
import { activityLevelShortText, formatDate, practiceYearsText } from '@/utils/format'
import { useUserStore } from '@/store/user'
import type { HttpError } from '@/http/types'
import type { PublicUserProfileDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '用户主页',
  },
  excludeLoginPath: true,
})

/** 标签展示最大数量 */
const MAX_TAG_VISIBLE = 5

/** 打招呼留言最大长度 */
const MESSAGE_MAX = 100

const userStore = useUserStore()

const userId = ref('')
const profile = ref<PublicUserProfileDTO | null>(null)
const loading = ref(true)
const notFound = ref(false)

/** 是否查看自己的主页(自己主页不展示联系/关注操作条) */
const isSelf = computed(() => !!profile.value && profile.value.id === userStore.userInfo.id)

/** 拉取用户公开资料 */
async function fetchProfile(id: string) {
  if (!id) {
    notFound.value = true
    loading.value = false
    return
  }
  loading.value = true
  try {
    const data = await getUserProfile(id)
    profile.value = data
    notFound.value = false
  }
  catch (e) {
    const err = e as HttpError
    // 未登录访问(后端 401):引导登录而非展示"用户不存在"的迷惑态
    if (err.statusCode === 401) {
      notFound.value = false
      toLoginPage()
    }
    else {
      console.warn('[UserHome] fetch error:', err?.message)
      notFound.value = true
    }
  }
  finally {
    loading.value = false
  }
}

onLoad((options) => {
  userId.value = (options as any)?.id || ''
})

/** 每次展示都重拉(从请求列表 accept/reject 返回后状态需刷新) */
onShow(() => {
  fetchProfile(userId.value)
})

// ====== 底部操作状态机 ======
type ActionState
  = | 'self'
    | 'not_provided'
    | 'can_request'
    | 'pending_sent'
    | 'pending_received'
    | 'accepted'

/** 依据 contact/relation 推导底部操作条状态 */
const actionState = computed<ActionState | null>(() => {
  if (!profile.value || isSelf.value)
    return isSelf.value ? 'self' : null
  const { contact, relation } = profile.value
  if (relation.contactStatus === 'accepted')
    return 'accepted'
  if (relation.contactStatus === 'pending_sent')
    return 'pending_sent'
  if (relation.contactStatus === 'pending_received')
    return 'pending_received'
  if (contact.reason === 'not_provided')
    return 'not_provided'
  // need_request / rejected(被拒后可再次发起)
  return 'can_request'
})

/** 操作进行中标记(按钮防重复点击) */
const acting = ref(false)

/** 未登录则引导登录 */
function ensureLogin(): boolean {
  if (userStore.isLoggedIn)
    return true
  toLoginPage()
  return false
}

// ====== 关注 / 取关 ======
async function handleToggleFollow() {
  if (!ensureLogin() || acting.value || !profile.value)
    return
  acting.value = true
  try {
    if (profile.value.relation.followed) {
      await unfollowUser(profile.value.id)
      profile.value.relation.followed = false
      uni.showToast({ title: '已取消关注', icon: 'none' })
    }
    else {
      await followUser(profile.value.id)
      profile.value.relation.followed = true
      uni.showToast({ title: '已关注', icon: 'none' })
    }
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '操作失败', icon: 'none' })
  }
  finally {
    acting.value = false
  }
}

// ====== 打招呼弹层 ======
const requestPopupVisible = ref(false)
const requestMessage = ref('')
/** 被拒绝后再次发起提示 */
const wasRejected = computed(() => profile.value?.relation.contactStatus === 'rejected')

function openRequestPopup() {
  if (!ensureLogin())
    return
  requestMessage.value = ''
  requestPopupVisible.value = true
}

/** 发送打招呼请求(空留言可直发) */
async function handleSendRequest() {
  if (acting.value || !profile.value)
    return
  acting.value = true
  try {
    const message = requestMessage.value.trim()
    await createContactRequest({
      toUserId: profile.value.id,
      ...(message ? { message } : {}),
    })
    requestPopupVisible.value = false
    uni.showToast({ title: '已发送,等待对方接受', icon: 'none' })
    await fetchProfile(userId.value)
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '发送失败', icon: 'none' })
  }
  finally {
    acting.value = false
  }
}

// ====== 撤回我发出的请求 ======
async function handleCancelRequest() {
  const requestId = profile.value?.relation.requestId
  if (!ensureLogin() || acting.value || !requestId)
    return
  acting.value = true
  try {
    await cancelContactRequest(requestId)
    uni.showToast({ title: '已撤回', icon: 'none' })
    await fetchProfile(userId.value)
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '撤回失败', icon: 'none' })
  }
  finally {
    acting.value = false
  }
}

// ====== 接受 / 拒绝收到的请求 ======
async function handleRespond(accept: boolean) {
  const requestId = profile.value?.relation.requestId
  if (!ensureLogin() || acting.value || !requestId)
    return
  acting.value = true
  try {
    if (accept)
      await acceptContactRequest(requestId)
    else
      await rejectContactRequest(requestId)
    uni.showToast({ title: accept ? '已接受,可查看对方微信号' : '已拒绝', icon: 'none' })
    await fetchProfile(userId.value)
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '操作失败', icon: 'none' })
  }
  finally {
    acting.value = false
  }
}

// ====== 联系方式展示(仅 accepted 态可见,公开设置不影响解锁) ======
/** 当前可展示/复制/拨打的联系方式(微信号优先,缺失时兜底手机号) */
const visibleContact = computed(() => {
  if (!profile.value)
    return { value: '', type: null as 'wechat' | 'phone' | null }
  const c = profile.value.contact
  const value = c.wechat ?? c.phone ?? ''
  const type = c.contactType ?? (c.wechat ? 'wechat' : c.phone ? 'phone' : null)
  return { value, type }
})

/** 复制联系方式 */
function copyContact() {
  const { value, type } = visibleContact.value
  if (!value)
    return
  uni.setClipboardData({
    data: value,
    success: () => uni.showToast({ title: type === 'phone' ? '手机号已复制' : '微信号已复制', icon: 'none' }),
  })
}

/** 拨打手机号(仅 phone 类型可用) */
function callPhone() {
  const { value, type } = visibleContact.value
  if (type !== 'phone' || !value)
    return
  uni.makePhoneCall({ phoneNumber: value })
}

// ====== 展示辅助 ======
function activityLevelColor(level: string): string {
  if (level === 'low')
    return '#f56c6c'
  if (level === 'medium')
    return '#e68a00'
  return '#018d71'
}

function renderTags(tags: string[]): { visible: string[], rest: number } {
  const visible = tags.slice(0, MAX_TAG_VISIBLE)
  return { visible, rest: tags.length - visible.length }
}
</script>

<template>
  <view class="flex flex-col">
    <!-- 加载态 -->
    <view v-if="loading" class="flex flex-1 flex-col items-center justify-center">
      <text class="text-sm text-[#999]">加载中...</text>
    </view>

    <!-- 不存在态 -->
    <view v-else-if="notFound || !profile" class="flex flex-1 flex-col items-center justify-center pb-20">
      <text class="text-[#ccc]" style="font-size: 56px;">😕</text>
      <text class="mt-3 text-sm text-[#999]">用户不存在或已注销</text>
    </view>

    <!-- 资料卡片 -->
    <template v-else>
      <!-- 头像与名称 -->
      <view class="bg-white px-5 pb-6 pt-10">
        <view class="flex flex-col items-center">
          <view class="h-20 w-20 flex items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1] shadow-sm">
            <image
              v-if="profile.avatarUrl"
              :src="profile.avatarUrl"
              class="h-full w-full"
              mode="aspectFill"
            />
            <text v-else class="text-3xl text-[#018d71] font-bold">
              {{ profile.name ? profile.name[0] : '?' }}
            </text>
          </view>
          <text class="mt-3 text-lg text-[#333] font-semibold">
            {{ profile.name }}
          </text>
        </view>
      </view>

      <!-- 信息块 -->
      <view class="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
        <!-- 活跃度 -->
        <view class="flex items-center justify-between border-b border-[#f5f5f5] pb-3.5">
          <text class="text-sm text-[#999]">活跃度</text>
          <text class="text-sm font-medium" :style="{ color: activityLevelColor(profile.activityLevel) }">
            {{ activityLevelShortText(profile.activityLevel) }}
          </text>
        </view>

        <!-- 练习年限 -->
        <view class="flex items-center justify-between border-b border-[#f5f5f5] py-3.5">
          <text class="text-sm text-[#999]">练习年限</text>
          <text class="text-sm text-[#333] font-medium">
            {{ practiceYearsText(profile.practiceYears, '未设置') }}
          </text>
        </view>

        <!-- 地址 -->
        <view class="flex items-center justify-between border-b border-[#f5f5f5] py-3.5">
          <text class="text-sm text-[#999]">所在地区</text>
          <text class="text-sm text-[#333]">
            {{ profile.address || '未设置' }}
          </text>
        </view>

        <!-- 加入时间 -->
        <view class="flex items-center justify-between pt-3.5">
          <text class="text-sm text-[#999]">加入时间</text>
          <text class="text-sm text-[#333]">
            {{ formatDate(profile.createdAt, '未知', '/') }}
          </text>
        </view>
      </view>

      <!-- 兴趣标签 -->
      <view v-if="profile.tags.length > 0" class="mx-4 mt-4 rounded-2xl bg-white p-5 shadow-sm">
        <text class="mb-3 block text-sm text-[#333] font-medium">兴趣标签</text>
        <view class="flex flex-wrap gap-2.5">
          <text
            v-for="name in renderTags(profile.tags).visible"
            :key="name"
            class="rounded-full bg-[#e8f5f1] px-3.5 py-1.5 text-xs text-[#018d71]"
          >
            {{ name }}
          </text>
          <text
            v-if="renderTags(profile.tags).rest > 0"
            class="border border-[#e0e0e0] rounded-full bg-white px-3.5 py-1.5 text-xs text-[#999]"
          >
            +{{ renderTags(profile.tags).rest }}
          </text>
        </view>
      </view>

      <!-- 底部操作条占位 -->
      <view v-if="!isSelf" class="pb-32" />

      <!-- ====== 固定底部联系操作条 ====== -->
      <view
        v-if="!isSelf"
        class="fixed bottom-0 left-0 right-0 z-10 border-t border-[#f0f0f0] bg-white px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3"
      >
        <!-- 未填微信号 -->
        <template v-if="actionState === 'not_provided'">
          <view class="flex items-center gap-3">
            <view class="h-11 flex flex-1 items-center justify-center rounded-full bg-[#f5f6f7]">
              <text class="text-sm text-[#999]">对方暂未开放联系方式</text>
            </view>
            <button
              class="h-11 w-24 shrink-0 rounded-full text-sm leading-[44px]"
              :class="profile.relation.followed ? 'border border-[#018d71] bg-white text-[#018d71]' : 'bg-[#e8f5f1] text-[#018d71]'"
              @click="handleToggleFollow"
            >
              {{ profile.relation.followed ? '已关注' : '关注' }}
            </button>
          </view>
        </template>

        <!-- 可发起打招呼(need_request / rejected) -->
        <template v-else-if="actionState === 'can_request'">
          <text v-if="wasRejected" class="mb-2 block text-xs text-[#e68a00]">
            对方婉拒了本次请求,可附上自我介绍再次发起
          </text>
          <view class="flex items-center gap-3">
            <button
              class="h-11 flex-1 rounded-full from-[#018d71] to-[#0aa07f] bg-gradient-to-br text-sm text-white leading-[44px] active:scale-95"
              @click="openRequestPopup"
            >
              打个招呼
            </button>
            <button
              class="h-11 w-24 shrink-0 rounded-full text-sm leading-[44px]"
              :class="profile.relation.followed ? 'border border-[#018d71] bg-white text-[#018d71]' : 'bg-[#e8f5f1] text-[#018d71]'"
              @click="handleToggleFollow"
            >
              {{ profile.relation.followed ? '已关注' : '关注' }}
            </button>
          </view>
        </template>

        <!-- 我发出的待处理 -->
        <template v-else-if="actionState === 'pending_sent'">
          <view class="flex items-center gap-3">
            <view class="h-11 flex flex-1 items-center justify-center rounded-full bg-[#f5f6f7]">
              <text class="text-sm text-[#999]">已发送请求,等待对方接受</text>
            </view>
            <button
              class="h-11 w-24 shrink-0 border border-[#e0e0e0] rounded-full bg-white text-sm text-[#666] leading-[44px] active:scale-95"
              @click="handleCancelRequest"
            >
              撤回
            </button>
          </view>
        </template>

        <!-- 我收到的待处理 -->
        <template v-else-if="actionState === 'pending_received'">
          <view class="flex items-center gap-3">
            <button
              class="h-11 flex-1 border border-[#e0e0e0] rounded-full bg-white text-sm text-[#666] leading-[44px] active:scale-95"
              @click="handleRespond(false)"
            >
              拒绝
            </button>
            <button
              class="h-11 flex-1 rounded-full from-[#018d71] to-[#0aa07f] bg-gradient-to-br text-sm text-white leading-[44px] active:scale-95"
              @click="handleRespond(true)"
            >
              接受
            </button>
          </view>
        </template>

        <!-- 已建立联系:展示联系方式(微信/手机号) + 复制/拨打 -->
        <template v-else-if="actionState === 'accepted'">
          <view class="flex items-center gap-3">
            <view class="h-11 flex flex-1 items-center justify-between rounded-full bg-[#f5f6f7] px-4">
              <text class="min-w-0 flex-1 truncate text-sm text-[#333]">
                {{ visibleContact.type === 'phone' ? '手机号:' : '微信号:' }}{{ visibleContact.value || '对方未填写' }}
              </text>
            </view>
            <button
              v-if="visibleContact.value"
              class="h-11 w-24 shrink-0 rounded-full bg-[#e8f5f1] text-sm text-[#018d71] leading-[44px] active:scale-95"
              @click="copyContact"
            >
              复制
            </button>
            <button
              v-if="visibleContact.type === 'phone'"
              class="h-11 w-24 shrink-0 rounded-full from-[#018d71] to-[#0aa07f] bg-gradient-to-br text-sm text-white leading-[44px] active:scale-95"
              @click="callPhone"
            >
              拨打
            </button>
          </view>
        </template>

      </view>
    </template>

    <!-- 打招呼留言弹层 -->
    <wd-popup
      v-model="requestPopupVisible"
      position="bottom"
      round
      :modal="true"
      close-on-click-modal
    >
      <view class="px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-6">
        <text class="block text-center text-base text-[#333] font-semibold">
          向 {{ profile?.name }} 打个招呼
        </text>
        <text class="mt-1 block text-center text-xs text-[#999]">
          说一句自我介绍,更容易被接受;对方同意后你们将互相看到微信号
        </text>

        <view class="mt-5 rounded-2xl bg-[#f5f6f7] px-4 py-3">
          <textarea
            v-model="requestMessage"
            class="h-24 w-full text-sm text-[#333]"
            :maxlength="MESSAGE_MAX"
            placeholder="如:你好,我也在练陈氏太极拳,想约周末一起晨练"
            :disabled="acting"
          />
          <view class="mt-1 text-right">
            <text class="text-xs text-[#999]">{{ requestMessage.length }}/{{ MESSAGE_MAX }}</text>
          </view>
        </view>

        <view class="mt-5 flex gap-3">
          <wd-button
            class="flex-1 border border-[#e5e5e5]! bg-white! text-[#666]!"
            round
            size="medium"
            variant="plain"
            @click="requestPopupVisible = false"
          >
            取消
          </wd-button>
          <wd-button
            class="flex-1 border-0 from-[#018d71] to-[#0aa07f] bg-gradient-to-br shadow-[0_6px_18px_rgba(1,141,113,0.28)] text-white!"
            round
            size="medium"
            :loading="acting"
            @click="handleSendRequest"
          >
            发送请求
          </wd-button>
        </view>
      </view>
    </wd-popup>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
