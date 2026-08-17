<script lang="ts" setup>
import { computed, ref } from 'vue'
import { onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { contactCircle, followCircle, getCircle, unfollowCircle } from '@/api/circles'
import { useUserStore } from '@/store/user'
import { useShare } from '@/composables/useShare'
import { formatDate, formatDateTime } from '@/utils/format'
import type { CircleDetailDTO } from '@/types'

definePage({
  style: {
    navigationBarTitleText: '圈子详情',
  },
})

const userStore = useUserStore()

// 路由参数 id(通过 getCurrentInstance 获取,兼容各种平台)
const circleId = ref('')

const circle = ref<CircleDetailDTO | null>(null)
const loading = ref(true)
const notFound = ref(false)
// 联系老师相关状态
const contactOpen = ref(false)
const contactInfo = ref<{ phone: string | null, wechat: string | null } | null>(null)
const contactLoading = ref(false)
// 关注状态与操作
const followed = ref(false)
const followLoading = ref(false)

/** 分享:小程序(好友/朋友圈) + H5 微信浏览器 JSSDK。内容在触发/配置时实时读取,兼容详情异步加载 */
const { share, shareAppMessage, shareTimeline } = useShare({
  title: () => (circle.value ? `${circle.value.title}｜${circle.value.description.slice(0, 40)}` : '趣邻圈'),
  path: '/pages/circle/circle',
  query: () => (circleId.value ? { id: circleId.value } : {}),
  imageUrl: () => circle.value?.coverImages?.[0] ?? '',
  desc: () => (circle.value ? circle.value.description.slice(0, 80) : ''),
})

// 分享钩子必须在页面顶层直接注册, 编译器才能生成微信小程序 Page 配置
// #ifdef MP-WEIXIN
onShareAppMessage(shareAppMessage)
onShareTimeline(shareTimeline)
// #endif

/** 拉取圈子详情 */
async function fetchCircle(id: string) {
  if (!id) {
    notFound.value = true
    loading.value = false
    return
  }
  loading.value = true
  try {
    const data = await getCircle(id)
    circle.value = data
    followed.value = !!data.isFollowed
    notFound.value = false
  }
  catch (e) {
    const err = e as Error
    // 404 或其他错误统一进入"已不存在"态
    notFound.value = true
    console.warn('[Circle] fetch error:', err?.message)
  }
  finally {
    loading.value = false
  }
}

// 进入与每次展示时刷新(从创建页编辑返回也需要刷新)
onShow(() => {
  // 从路由取 id
  const pages = getCurrentPages()
  const current = pages[pages.length - 1] as any
  const id = current?.options?.id || current?.$page?.options?.id || ''
  circleId.value = id
  void fetchCircle(id)
})

/** 是否为创建者 */
const isCreator = computed(() => {
  return !!(circle.value && userStore.userInfo && circle.value.creatorId === userStore.userInfo.id)
})

/** 联系老师:优先 phone,phone 为 null 时改 wechat */
async function handleContact() {
  const c = circle.value
  if (!c || contactLoading.value)
    return
  contactLoading.value = true
  try {
    // 优先尝试 phone;phone 为 null 时改用 wechat
    let res = await contactCircle(c.id, 'phone')
    if (!res.contactPhone) {
      // phone 为 null,改用 wechat
      res = await contactCircle(c.id, 'wechat')
    }
    contactInfo.value = { phone: res.contactPhone, wechat: res.wechat }
    contactOpen.value = true
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '联系失败', icon: 'none' })
  }
  finally {
    contactLoading.value = false
  }
}

/** 关注/取消关注圈子 */
async function handleFollow() {
  const c = circle.value
  if (!c || followLoading.value)
    return
  followLoading.value = true
  try {
    if (followed.value) {
      await unfollowCircle(c.id)
      followed.value = false
      if (c.followCount > 0)
        c.followCount -= 1
      uni.showToast({ title: '已取消关注', icon: 'none' })
    }
    else {
      await followCircle(c.id)
      followed.value = true
      c.followCount += 1
      uni.showToast({ title: '关注成功', icon: 'success' })
    }
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '操作失败', icon: 'none' })
  }
  finally {
    followLoading.value = false
  }
}

/** 拨打电话 */
function handleCall(phone: string) {
  uni.makePhoneCall({ phoneNumber: phone })
}

/** 复制微信号 */
function handleCopyWechat(wechat: string) {
  uni.setClipboardData({
    data: wechat,
    success() {
      uni.showToast({ title: '已复制', icon: 'success', duration: 800 })
    },
  })
}

/** 跳编辑页 */
function handleEdit() {
  if (!circle.value)
    return
  uni.navigateTo({ url: `/pages/create-circle/create-circle?id=${circle.value.id}` })
}

/** 返回上一页 */
function handleBack() {
  uni.navigateBack({
    fail() {
      uni.reLaunch({ url: '/pages/index/index' })
    },
  })
}
</script>

<template>
  <view class="min-h-screen flex flex-col bg-[#f7f8fa]">
    <!-- ====== 边界态:加载中 ====== -->
    <view v-if="loading && !circle" class="flex flex-col items-center pt-32">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <!-- ====== 边界态:圈子不存在 ====== -->
    <view v-else-if="notFound || !circle" class="flex flex-col items-center pt-32">
      <text class="text-base text-[#333] font-medium">
        该圈子已不存在
      </text>
      <wd-button class="mt-4" round size="small" @click="handleBack">
        返回
      </wd-button>
    </view>

    <template v-else>
      <scroll-view scroll-y class="flex-1">
        <!-- ====== 0. 轮播 Swiper(coverImages.length > 0 才渲染) ====== -->
        <swiper
          v-if="circle.coverImages.length > 0"
          class="h-56 w-full"
          indicator-color="rgba(255,255,255,0.5)"
          indicator-active-color="#fff"
          indicator-dots
          autoplay
          :interval="4000"
          circular
          :duration="500"
        >
          <swiper-item v-for="(url, idx) in circle.coverImages" :key="`${url}-${idx}`">
            <image :src="url" class="h-full w-full" mode="aspectFill" />
          </swiper-item>
        </swiper>

        <!-- ====== 1. 状态横幅(仅 pending / rejected 展示) ====== -->
        <view v-if="circle.status === 'pending'" class="bg-[#fff7e6] px-4 py-3">
          <text class="text-xs text-[#e68a00]">
            该圈子正在审核中,暂不对外公开。审核通过后将自动上线。
          </text>
        </view>
        <view v-if="circle.status === 'rejected'" class="bg-[#fff1f0] px-4 py-3">
          <text class="text-xs text-[#ff4d4f]">
            该圈子审核未通过。可修改信息后联系管理员重新审核。
          </text>
        </view>

        <!-- ====== 2. 标题 + 标签 ====== -->
        <view class="bg-white px-4 py-4">
          <text class="block text-xl text-[#333] font-semibold">
            {{ circle.title }}
          </text>
          <scroll-view v-if="circle.tags.length > 0" scroll-x class="mt-3 whitespace-nowrap">
            <view class="inline-flex gap-2">
              <text
                v-for="name in circle.tags"
                :key="name"
                class="rounded-full bg-[#e8f5f1] px-3 py-1 text-xs text-[#018d71]"
              >
                {{ name }}
              </text>
            </view>
          </scroll-view>
        </view>

        <!-- ====== 3. 创建者卡片 ====== -->
        <view class="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-white p-4">
          <view class="h-12 w-12 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1]">
            <image v-if="circle.creator.avatarUrl" :src="circle.creator.avatarUrl" class="h-full w-full" mode="aspectFill" />
            <text v-else class="text-lg text-[#018d71] font-medium">
              {{ circle.creator.name ? circle.creator.name[0] : '?' }}
            </text>
          </view>
          <view class="min-w-0 flex-1">
            <view class="flex items-center gap-2">
              <text class="truncate text-sm text-[#333] font-medium">
                {{ circle.creator.name }}
              </text>
              <text class="shrink-0 rounded-full bg-[#fff7e6] px-2 py-0.5 text-xs text-[#e68a00]">
                传承人
              </text>
            </view>
            <text class="mt-1 block text-xs text-[#999]">
              创建于 {{ formatDate(circle.createdAt) }}
            </text>
          </view>
        </view>

        <!-- ====== 4. 圈子介绍 ====== -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
          <text class="block text-sm text-[#333] font-medium">
            圈子介绍
          </text>
          <text class="mt-2 block text-sm text-[#666] leading-6">
            {{ circle.description }}
          </text>
        </view>

        <!-- ====== 5. 活动时间 ====== -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
          <text class="block text-sm text-[#333] font-medium">
            活动时间
          </text>
          <text class="mt-2 block text-sm text-[#666]">
            {{ formatDateTime(circle.activityTime) }}
          </text>
        </view>

        <!-- ====== 6. 活动地点(简化:仅展示地址文本) ====== -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
          <text class="block text-sm text-[#333] font-medium">
            活动地点
          </text>
          <text class="mt-2 block text-sm text-[#666]">
            {{ circle.address || '地点待定' }}
          </text>
        </view>

        <!-- ====== 7. 圈子数据(关注人数 / 被联系次数) ====== -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
          <view class="flex items-center justify-between">
            <text class="text-sm text-[#333] font-medium">
              关注人数
            </text>
            <text class="text-sm text-[#018d71]">
              {{ circle.followCount }}
            </text>
          </view>
          <text v-if="isCreator" class="mt-2 block text-xs text-[#999]">
            被联系 {{ circle.contactCount }} 次
          </text>
        </view>
      </scroll-view>

      <!-- ====== 底部固定按钮(横排:主按钮 + 分享) ====== -->
      <view class="border-t border-[#f0f0f0] bg-white px-4 py-3 pb-safe">
        <view class="flex items-center gap-3">
          <wd-button
            block
            :loading="contactLoading"
            @click="isCreator ? handleEdit() : handleContact()"
          >
            {{ isCreator ? '编辑圈子信息' : '联系老师' }}
          </wd-button>
          <!-- 关注/已关注:创建者无需关注自己的圈子 -->
          <wd-button
            v-if="!isCreator"
            plain
            custom-class="shrink-0"
            :loading="followLoading"
            @click="handleFollow"
          >
            {{ followed ? '已关注' : '关注' }}
          </wd-button>
          <!-- 小程序:原生转发按钮 -->
          <!-- #ifdef MP-WEIXIN -->
          <wd-button plain custom-class="shrink-0" open-type="share">
            分享
          </wd-button>
          <!-- #endif -->
          <!-- H5 微信浏览器:点击引导右上角分享 -->
          <!-- #ifdef H5 -->
          <wd-button plain custom-class="shrink-0" @click="share">
            分享
          </wd-button>
          <!-- #endif -->
        </view>
      </view>

      <!-- ====== 联系方式底部弹层 ====== -->
      <wd-popup v-model="contactOpen" position="bottom" round>
        <view class="bg-white p-6 pb-safe">
          <text class="block text-center text-base text-[#333] font-medium">
            联系方式
          </text>
          <view v-if="contactInfo && (contactInfo.phone || contactInfo.wechat)" class="mt-4">
            <view v-if="contactInfo.phone" class="flex items-center justify-between border-b border-[#f5f5f5] py-4" @click="handleCall(contactInfo.phone as string)">
              <text class="text-sm text-[#666]">
                电话
              </text>
              <text class="text-sm text-[#018d71]">
                {{ contactInfo.phone }} ›
              </text>
            </view>
            <view v-if="contactInfo.wechat" class="flex items-center justify-between border-b border-[#f5f5f5] py-4" @click="handleCopyWechat(contactInfo.wechat as string)">
              <text class="text-sm text-[#666]">
                微信
              </text>
              <text class="text-sm text-[#018d71]">
                {{ contactInfo.wechat }} 复制
              </text>
            </view>
            <text class="mt-4 block text-center text-xs text-[#999]">
              点击电话直接拨打,点击微信复制微信号
            </text>
          </view>
          <text v-else class="mt-6 block text-center text-sm text-[#999]">
            老师未提供联系方式
          </text>
        </view>
      </wd-popup>
    </template>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
