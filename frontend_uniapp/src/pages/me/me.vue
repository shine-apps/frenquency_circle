<script lang="ts" setup>
import { computed, reactive, ref } from 'vue'
import { useUserStore } from '@/store/user'
import { useTokenStore } from '@/store/token'
import { useSettingsStore } from '@/store/settings'
import { getMyProfile, updateMyTags, updateProfile } from '@/api/auth'
import { getUnreadNotificationCount } from '@/api/notifications'
import { canCreateCircle } from '@/utils/role'
import { LOGIN_PAGE } from '@/router/config'
import { toLoginWithRedirect } from '@/utils/toLoginPage'
import TagSelectorPopup from '@/components/TagSelectorPopup/TagSelectorPopup.vue'
// #ifdef H5
import H5LocationPicker from '@/components/H5LocationPicker/H5LocationPicker.vue'
// #endif
import type { UserRole } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '我的',
  },
  excludeLoginPath: true,
})

const userStore = useUserStore()
const tokenStore = useTokenStore()
const settingsStore = useSettingsStore()

const user = computed(() => userStore.userInfo)
const isLoggedIn = computed(() => userStore.isLoggedIn)
/** 系统设置 isAppDeploying 为 true 时表示应用处于发布维护中,直接读取 store 计算属性 */
const isAppDeploying = computed(() => settingsStore.isAppDeploying)

// 进入时刷新用户资料(头像/标签/role 最新)
onShow(() => {
  // 每次回到我的页同步一次系统设置(命中 10 分钟缓存时无网络开销)
  void settingsStore.getSettings().catch(() => { /* 拉取失败沿用旧值 */ })
  if (!userStore.isLoggedIn)
    return
  getMyProfile()
    .then((profile) => {
      userStore.setProfile(profile)
      fillAddressFromUser()
    })
    .catch(() => {
      // 静默:token 失效由拦截器跳登录
      fillAddressFromUser()
    })
  // 同步未读消息数(失败静默,不影响其他功能)
  void fetchUnreadCount()
})

/** 未读消息数量(>0 时我的页显示角标) */
const unreadCount = ref(0)

/** 拉取未读消息数 */
async function fetchUnreadCount() {
  try {
    const res = await getUnreadNotificationCount()
    unreadCount.value = res.count ?? 0
  }
  catch {
    // 静默
  }
}

/** 跳消息中心 */
function handleNotifications() {
  uni.navigateTo({ url: '/pages/notifications/notifications' })
}

/** 未登录点击用户卡片 → 跳登录页(navigateTo 保留页面栈,登录后回到本页) */
function handleProfileClick() {
  if (!isLoggedIn.value) {
    toLoginWithRedirect('navigateTo')
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

// ===== 地址编辑(H5 用地图选点弹层,小程序用原生 chooseLocation) =====
const addressForm = reactive({
  address: '',
  latitude: null as number | null,
  longitude: null as number | null,
})
const addressPickerVisible = ref(false)

/** 从 store 回填地址表单初值 */
function fillAddressFromUser() {
  const u = user.value
  addressForm.address = u?.address ?? ''
  addressForm.latitude = u?.location?.latitude ?? null
  addressForm.longitude = u?.location?.longitude ?? null
}

/** 地址保存(选点确认 / 清除后调用,地址+经纬度一起提交) */
async function saveAddress() {
  try {
    await updateProfile({
      address: addressForm.address,
      latitude: addressForm.latitude,
      longitude: addressForm.longitude,
    })
    const fresh = await getMyProfile()
    userStore.setProfile(fresh)
    fillAddressFromUser()
    uni.showToast({ title: '地址已保存', icon: 'success' })
  }
  catch (e) {
    console.error('[me] saveAddress failed:', e)
    uni.showToast({ title: '地址保存失败,请重试', icon: 'none' })
    // 失败静默刷新 store 并回填,避免本地与后端不一致
    getMyProfile()
      .then((p) => {
        userStore.setProfile(p)
        fillAddressFromUser()
      })
      .catch(() => {})
  }
}

/** 打开地址选择器 */
async function handleChooseLocation() {
  // #ifdef H5
  addressPickerVisible.value = true
  // #endif
  // #ifndef H5
  try {
    const res = await uni.chooseLocation({})
    addressForm.address = res.address || res.name || '已选择位置'
    addressForm.latitude = res.latitude
    addressForm.longitude = res.longitude
    await saveAddress()
  }
  catch (e) {
    const err = e as Error & { errMsg?: string }
    // 用户取消选点静默
    if (err?.errMsg && /cancel/i.test(err.errMsg))
      return
    uni.showToast({ title: err?.message || '选择位置失败,请检查授权', icon: 'none' })
  }
  // #endif
}

/** H5 地图选点弹层确认回调 */
function handleAddressPickerConfirm(loc: { latitude: number, longitude: number, address: string }) {
  addressForm.address = loc.address
  addressForm.latitude = loc.latitude
  addressForm.longitude = loc.longitude
  addressPickerVisible.value = false
  void saveAddress()
}

/** 清除地址(连同经纬度,立即保存) */
function handleClearAddress() {
  addressForm.address = ''
  addressForm.latitude = null
  addressForm.longitude = null
  void saveAddress()
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

/** 跳我关注的人页 */
function handleFollowedUsers() {
  uni.navigateTo({ url: '/pages/followed-users/followed-users' })
}

/** 跳联系请求页(打招呼的收发处理) */
function handleContactRequests() {
  uni.navigateTo({ url: '/pages/contact-requests/contact-requests' })
}

/** 跳我发布的圈子页(TEACHER / ADMIN 专属) */
function handleMyPublished() {
  if (!canCreateCircle(user.value?.role)) {
    uni.showToast({ title: '仅教师身份可访问', icon: 'none' })
    return
  }
  uni.navigateTo({ url: '/pages/my-published/my-published' })
}

/** 跳我的活动页:TEACHER / ADMIN 直达,其他角色弹框引导教师认证 */
function handleMyActivities() {
  if (!isLoggedIn.value) {
    toLoginWithRedirect('navigateTo')
    return
  }
  if (canCreateCircle(user.value?.role)) {
    uni.navigateTo({ url: '/pages/my-activities/my-activities' })
    return
  }
  uni.showModal({
    title: '提示',
    content: '仅认证教师可发布与管理活动,是否前往教师认证?',
    confirmText: '去认证',
    cancelText: '暂不',
    success(res) {
      if (res.confirm) {
        uni.navigateTo({ url: '/pages/teacher-certification/teacher-certification' })
      }
    },
  })
}

/** 跳教师认证页(非 TEACHER / ADMIN 角色) */
function handleTeacherCert() {
  uni.navigateTo({ url: '/pages/teacher-certification/teacher-certification' })
}

/** 跳隐私设置页 */
function handlePrivacy() {
  uni.navigateTo({ url: '/pages/privacy/privacy' })
}

/** 跳关于页 */
function handleAbout() {
  uni.navigateTo({ url: '/pages/about/about' })
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
    return { text: '老师', type: 'warning' }
  if (role === 'ADMIN')
    return { text: '管理员', type: 'danger' }
  return { text: '爱好者', type: 'primary' }
})

/** 兴趣标签数量 */
const tagsCount = computed(() => user.value?.tags?.length ?? 0)

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
  <view class="flex flex-col pb-32">
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
    <view class="mx-4 rounded-2xl bg-white" v-if="!isAppDeploying">
      <view class="flex items-center justify-between border-[#f5f5f5] border-b-inset px-4 py-4" @click="handleNotifications">
        <text class="text-sm text-[#333] font-medium">
          消息
        </text>
        <view class="flex items-center gap-2">
          <view
            v-if="unreadCount > 0"
            class="h-5 min-w-5 flex items-center justify-center rounded-full bg-[#f44336] px-1.5"
          >
            <text class="text-xs text-white">
              {{ unreadCount > 99 ? '99+' : unreadCount }}
            </text>
          </view>
          <text class="text-sm text-[#ccc]">
            ›
          </text>
        </view>
      </view>

      <view class="flex flex-col border-[#f5f5f5] border-b-inset px-4 py-4" @click="handleTags">
        <view class="flex items-center justify-between">
          <text class="text-sm text-[#333] font-medium">
            我的兴趣
          </text>
          <text class="text-sm text-[#ccc]">
            ›
          </text>
        </view>
        <view v-if="tagsCount > 0" class="mt-2 flex flex-wrap gap-2">
          <text
            v-for="tag in user?.tags"
            :key="tag"
            class="rounded-full bg-[#f5f5f5] px-2.5 py-1 text-xs text-[#666]"
          >
            {{ tag }}
          </text>
        </view>
        <text v-else class="mt-1 text-xs text-[#999]">
          尚未选择
        </text>
      </view>

      <view class="flex flex-col border-[#f5f5f5] border-b-inset px-4 py-4" @click="handleChooseLocation">
        <view class="flex items-center justify-between">
          <text class="text-sm text-[#333] font-medium">
            地址
          </text>
          <text class="text-sm text-[#ccc]">
            ›
          </text>
        </view>
        <text class="mt-1 line-clamp-2 break-all text-xs text-[#999]">
          {{ addressForm.address || '点击选择地址' }}
        </text>
        <text
          v-if="addressForm.address"
          class="mt-1 self-start text-xs text-[#ff4d4f]"
          @click.stop="handleClearAddress"
        >
          清除地址
        </text>
      </view>

      <view class="flex items-center justify-between border-[#f5f5f5] border-b-inset px-4 py-4" @click="handleMyCircles">
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

      <view class="flex items-center justify-between border-[#f5f5f5] border-b-inset px-4 py-4" @click="handleFollowedCircles">
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

      <view class="flex items-center justify-between border-[#f5f5f5] border-b-inset px-4 py-4" @click="handleFollowedUsers">
        <view class="flex flex-col">
          <text class="text-sm text-[#333] font-medium">
            我关注的人
          </text>
          <text class="mt-0.5 text-xs text-[#999]">
            收藏的同趣伙伴,随时回看
          </text>
        </view>
        <text class="text-sm text-[#ccc]">
          ›
        </text>
      </view>

      <view class="flex items-center justify-between border-[#f5f5f5] border-b-inset px-4 py-4" @click="handleContactRequests">
        <view class="flex flex-col">
          <text class="text-sm text-[#333] font-medium">
            联系请求
          </text>
          <text class="mt-0.5 text-xs text-[#999]">
            收到与发出的打招呼,同意后互看微信号
          </text>
        </view>
        <text class="text-sm text-[#ccc]">
          ›
        </text>
      </view>

      <view
        v-if="canCreateCircle(user?.role)"
        class="flex items-center justify-between border-[#f5f5f5] border-b-inset px-4 py-4"
        @click="handleMyPublished"
      >
        <view class="flex flex-col">
          <text class="text-sm text-[#333] font-medium">
            我发布的圈子
          </text>
          <text class="mt-0.5 text-xs text-[#999]">
            教师专属
          </text>
        </view>
        <text class="text-sm text-[#ccc]">
          ›
        </text>
      </view>

      <view
        class="flex items-center justify-between border-[#f5f5f5] border-b-inset px-4 py-4"
        @click="handleMyActivities"
      >
        <view class="flex flex-col">
          <text class="text-sm text-[#333] font-medium">
            我的活动
          </text>
          <text class="mt-0.5 text-xs text-[#999]">
            发布与维护活动
          </text>
        </view>
        <text class="text-sm text-[#ccc]">
          ›
        </text>
      </view>

      <view
        v-if="!canCreateCircle(user?.role)"
        class="flex items-center justify-between border-[#f5f5f5] border-b-inset px-4 py-4"
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

      <view class="flex items-center justify-between border-[#f5f5f5] border-b-inset px-4 py-4" @click="handlePrivacy">
        <text class="text-sm text-[#333] font-medium">
          隐私设置
        </text>
        <text class="text-sm text-[#ccc]">
          ›
        </text>
      </view>

      <view class="flex items-center justify-between px-4 py-4" @click="handleAbout">
        <text class="text-sm text-[#333] font-medium">
          关于我们
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

    <!-- H5 端地图选点弹层 -->
    <!-- #ifdef H5 -->
    <H5LocationPicker
      :visible="addressPickerVisible"
      :initial-lat="addressForm.latitude"
      :initial-lng="addressForm.longitude"
      @confirm="handleAddressPickerConfirm"
      @close="addressPickerVisible = false"
    />
    <!-- #endif -->
  </view>
</template>

<style lang="scss" scoped>
//
</style>
