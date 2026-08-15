<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useUserStore } from '@/store/user'
import { useTokenStore } from '@/store/token'
import { getMyProfile, updateMyTags } from '@/api/auth'
import { canCreateCircle } from '@/utils/role'
import { LOGIN_PAGE } from '@/router/config'
import TagSelectorPopup from '@/components/TagSelectorPopup/TagSelectorPopup.vue'
import type { UserRole } from '@/types'

defineOptions({
  name: 'Me',
})
definePage({
  style: {
    navigationBarTitleText: '我的',
  },
})

const userStore = useUserStore()
const tokenStore = useTokenStore()

const user = computed(() => userStore.userInfo)
const isLoggedIn = computed(() => userStore.isLoggedIn)

// 进入时刷新用户资料(头像/标签/role 最新)
onShow(() => {
  if (!userStore.isLoggedIn)
    return
  getMyProfile()
    .then((profile) => {
      userStore.setProfile(profile)
    })
    .catch(() => {
      // 静默:token 失效由拦截器跳登录
    })
})

/** 未登录点击用户卡片 → 跳登录页 */
function handleProfileClick() {
  if (!isLoggedIn.value) {
    uni.navigateTo({ url: LOGIN_PAGE })
    return
  }
  uni.navigateTo({ url: '/pages/profile/profile' })
}

/** 兴趣标签选择弹窗显隐 */
const tagPopupVisible = ref(false)

/** 打开兴趣标签选择弹窗 */
function handleTags() {
  tagPopupVisible.value = true
}

/** 编辑兴趣确认:已登录时保存到"我的兴趣标签集合"(后端),并同步本地 store */
async function handleTagsConfirmed(tags: string[]): Promise<void> {
  if (!userStore.isLoggedIn) {
    uni.showToast({ title: '请先登录', icon: 'none' })
    return
  }
  try {
    const saved = await updateMyTags(tags)
    userStore.setTags(saved)
    uni.showToast({ title: '兴趣已保存', icon: 'success' })
  }
  catch (e) {
    console.error('[me] updateMyTags failed:', e)
    uni.showToast({ title: '兴趣保存失败,请重试', icon: 'none' })
  }
}

/** 跳我的圈子页(展示最近匹配的圈子) */
function handleMyCircles() {
  uni.navigateTo({ url: '/pages/my-circles/my-circles' })
}

/** 跳我关注的圈子页 */
function handleFollowedCircles() {
  uni.navigateTo({ url: '/pages/followed-circles/followed-circles' })
}

/** 跳我发布的圈子页(TEACHER / ADMIN 专属) */
function handleMyPublished() {
  if (!canCreateCircle(user.value?.role)) {
    uni.showToast({ title: '仅传承人可访问', icon: 'none' })
    return
  }
  uni.navigateTo({ url: '/pages/my-published/my-published' })
}

/** 跳教师认证页(非 TEACHER / ADMIN 角色) */
function handleTeacherCert() {
  uni.navigateTo({ url: '/pages/teacher-certification/teacher-certification' })
}

/** 跳隐私设置页 */
function handlePrivacy() {
  uni.navigateTo({ url: '/pages/privacy/privacy' })
}

/** 退出登录:showModal 确认后执行 */
function handleLogout() {
  uni.showModal({
    title: '退出登录',
    content: '确定要退出当前账号吗?',
    confirmText: '退出',
    cancelText: '取消',
    success(res) {
      if (res.confirm) {
        tokenStore.logout()
        uni.reLaunch({ url: LOGIN_PAGE })
      }
    },
  })
}

// 头像 fallback:已登录显示昵称首字,未登录显示"游"
const avatarFallback = computed(() => {
  return isLoggedIn.value && user.value?.name ? user.value.name[0] : '游'
})

/** 身份标签配置 */
const roleInfo = computed<{ text: string, type: 'warning' | 'primary' | 'danger' }>(() => {
  const role: UserRole | undefined = user.value?.role
  if (role === 'TEACHER')
    return { text: '传承人', type: 'warning' }
  if (role === 'ADMIN')
    return { text: '管理员', type: 'danger' }
  return { text: '爱好者', type: 'primary' }
})

/** 兴趣标签数量 */
const tagsCount = computed(() => user.value?.tags?.length ?? 0)
const tagsText = computed(() => (tagsCount.value > 0 ? `${tagsCount.value} 个` : '尚未选择'))

/** 身份标签颜色映射 */
const roleChipClass = computed(() => {
  if (roleInfo.value.type === 'warning')
    return 'bg-[#fff7e6] text-[#e68a00]'
  if (roleInfo.value.type === 'danger')
    return 'bg-[#fff1f0] text-[#ff4d4f]'
  return 'bg-[#e8f5f1] text-[#018d71]'
})
</script>

<template>
  <view class="min-h-screen flex flex-col bg-[#f7f8fa] pb-32">
    <!-- ====== 顶部用户信息卡片 ====== -->
    <view class="m-4 flex items-center gap-4 rounded-2xl bg-white p-5" @click="handleProfileClick">
      <view class="h-16 w-16 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1]">
        <image
          v-if="user?.avatar"
          :src="user.avatar"
          class="h-full w-full"
          mode="aspectFill"
        />
        <text v-else class="text-2xl text-[#018d71] font-medium">
          {{ avatarFallback }}
        </text>
      </view>
      <view class="min-w-0 flex-1">
        <view class="flex items-center gap-2">
          <text class="truncate text-lg text-[#333] font-semibold">
            {{ isLoggedIn ? user?.name : '未登录用户' }}
          </text>
          <text v-if="isLoggedIn" class="shrink-0 rounded-full px-2.5 py-0.5 text-xs" :class="roleChipClass">
            {{ roleInfo.text }}
          </text>
        </view>
        <text class="mt-1 block truncate text-sm text-[#999]">
          {{ isLoggedIn ? (user?.email ?? '未绑定邮箱') : '点击登录体验更多功能' }}
        </text>
      </view>
      <text class="shrink-0 text-lg text-[#ccc]">
        ›
      </text>
    </view>

    <!-- ====== 设置入口列表 ====== -->
    <view class="mx-4 rounded-2xl bg-white">
      <view class="flex items-center justify-between border-b border-[#f5f5f5] px-4 py-4" @click="handleTags">
        <text class="text-sm text-[#333] font-medium">
          我的兴趣
        </text>
        <view class="flex items-center gap-2">
          <text class="text-xs text-[#999]">
            {{ tagsText }}
          </text>
          <text class="text-sm text-[#ccc]">
            ›
          </text>
        </view>
      </view>

      <view class="flex items-center justify-between border-b border-[#f5f5f5] px-4 py-4" @click="handleMyCircles">
        <view class="flex flex-col">
          <text class="text-sm text-[#333] font-medium">
            我的圈子
          </text>
          <text class="mt-0.5 text-xs text-[#999]">
            最近匹配的圈子
          </text>
        </view>
        <text class="text-sm text-[#ccc]">
          ›
        </text>
      </view>

      <view class="flex items-center justify-between border-b border-[#f5f5f5] px-4 py-4" @click="handleFollowedCircles">
        <view class="flex flex-col">
          <text class="text-sm text-[#333] font-medium">
            我关注的圈子
          </text>
          <text class="mt-0.5 text-xs text-[#999]">
            一键回看感兴趣的圈子
          </text>
        </view>
        <text class="text-sm text-[#ccc]">
          ›
        </text>
      </view>

      <view
        v-if="canCreateCircle(user?.role)"
        class="flex items-center justify-between border-b border-[#f5f5f5] px-4 py-4"
        @click="handleMyPublished"
      >
        <view class="flex flex-col">
          <text class="text-sm text-[#333] font-medium">
            我发布的圈子
          </text>
          <text class="mt-0.5 text-xs text-[#999]">
            传承人专属
          </text>
        </view>
        <text class="text-sm text-[#ccc]">
          ›
        </text>
      </view>

      <view
        v-if="!canCreateCircle(user?.role)"
        class="flex items-center justify-between border-b border-[#f5f5f5] px-4 py-4"
        @click="handleTeacherCert"
      >
        <view class="flex flex-col">
          <text class="text-sm text-[#333] font-medium">
            教师认证
          </text>
          <text class="mt-0.5 text-xs text-[#999]">
            申请成为认证教师,发布圈子
          </text>
        </view>
        <text class="text-sm text-[#ccc]">
          ›
        </text>
      </view>

      <view class="flex items-center justify-between px-4 py-4" @click="handlePrivacy">
        <text class="text-sm text-[#333] font-medium">
          隐私设置
        </text>
        <text class="text-sm text-[#ccc]">
          ›
        </text>
      </view>
    </view>

    <!-- ====== 退出登录按钮 ====== -->
    <view v-if="isLoggedIn" class="mx-4 mt-6 rounded-2xl bg-white py-4 text-center" @click="handleLogout">
      <text class="text-sm text-[#ff4d4f]">
        退出登录
      </text>
    </view>

    <!-- 兴趣标签选择弹窗(打开时预填当前用户兴趣,完成时由本页统一保存到后端) -->
    <TagSelectorPopup v-model="tagPopupVisible" :initial-tags="user?.tags ?? []" @confirm="handleTagsConfirmed" />
  </view>
</template>

<style lang="scss" scoped>
//
</style>
