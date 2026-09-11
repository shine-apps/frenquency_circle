<script lang="ts" setup>
import { useUserStore } from '@/store/user'

definePage({
  layout: 'navbar',
  style: {
    navigationBarTitleText: 'MBTI 人格测试',
  },
  excludeLoginPath: true,
})

const userStore = useUserStore()

function startTest() {
  uni.navigateTo({ url: '/pages/mbti/test' })
}

function goHistory() {
  if (!userStore.isLoggedIn) {
    uni.showToast({ title: '请先登录后查看历史', icon: 'none' })
    return
  }
  uni.navigateTo({ url: '/pages/mbti/history' })
}

function goTypes() {
  uni.navigateTo({ url: '/pages/mbti/types' })
}

function goHome() {
  uni.reLaunch({ url: '/pages/index/index' })
}
</script>

<template>
  <view class="min-h-screen bg-[#F7F9F8]">
    <!-- 渐变主视觉区 -->
    <view class="relative overflow-hidden px-6 pb-16 pt-10 text-center" style="background: linear-gradient(150deg, #018d71 0%, #02a887 55%, #35c4a0 100%)">
      <!-- 装饰光斑 -->
      <view class="pointer-events-none absolute -top-10 -right-10 h-44 w-44 rounded-full opacity-15" style="background: #ffffff" />
      <view class="pointer-events-none absolute top-24 -left-12 h-32 w-32 rounded-full opacity-10" style="background: #ffffff" />

      <view class="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-white/15 text-4xl backdrop-blur">
        <text>🧠</text>
      </view>
      <text class="mt-5 block text-[28px] font-semibold text-white">
        MBTI 人格测试
      </text>
      <text class="mt-2 block text-sm text-white/85">
        精简版问卷 · 约 5 分钟 · 发现你的性格密码
      </text>

      <view class="mx-auto mt-8 flex flex-row justify-center gap-6">
        <view v-for="(item, i) in [{ label: '16 型人格', icon: '🎭' }, { label: '四维解析', icon: '📊' }, { label: '兴趣推荐', icon: '🎯' }]" :key="i" class="flex flex-col items-center gap-1 rounded-2xl bg-white/12 px-4 py-3 backdrop-blur">
          <text class="text-xl">
            {{ item.icon }}
          </text>
          <text class="text-xs text-white/90">
            {{ item.label }}
          </text>
        </view>
      </view>
    </view>

    <!-- 开始卡片 -->
    <view class="relative mx-4 -mt-10 rounded-3xl bg-white p-6 shadow-sm">
      <view class="flex flex-col items-center">
        <view
          class="h-36 w-36 flex items-center justify-center rounded-full shadow-lg transition-transform active:scale-95"
          style="background: linear-gradient(150deg, #02a887 0%, #018d71 100%)"
          @click="startTest"
        >
          <text class="text-2xl text-white font-semibold">
            开始测试
          </text>
        </view>
        <text class="mt-4 text-xs text-[#999]">
          每题两个选项,选择更符合你日常状态的那一个
        </text>
      </view>

      <!-- 次级入口 -->
      <view class="mt-6 flex flex-col gap-3">
        <view class="flex items-center justify-between rounded-2xl bg-[#F7F9F8] px-4 py-3 active:opacity-80" @click="goHistory">
          <view class="flex items-center gap-3">
            <text class="text-lg">🕘</text>
            <text class="text-sm text-[#333]">历史测试结果</text>
          </view>
          <text class="text-xs text-[#999]">{{ userStore.isLoggedIn ? '已为你保存每次结果' : '登录后自动保存' }} ›</text>
        </view>
        <view class="flex items-center justify-between rounded-2xl bg-[#F7F9F8] px-4 py-3 active:opacity-80" @click="goTypes">
          <view class="flex items-center gap-3">
            <text class="text-lg">🗂️</text>
            <text class="text-sm text-[#333]">浏览 16 型兴趣推荐</text>
          </view>
          <text class="text-xs text-[#999]">看看其他人格适合什么 ›</text>
        </view>
      </view>
    </view>

    <!-- 底部说明 -->
    <view class="mt-6 mb-8 flex flex-col items-center gap-1 px-6">
      <text class="text-center text-xs text-[#bbb]">
        题目参考开源量表 OEJTS 改编 · 非官方测试,结果仅供兴趣推荐参考
      </text>
      <text class="text-xs text-[#bbb] underline" @click="goHome">
        返回首页
      </text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
