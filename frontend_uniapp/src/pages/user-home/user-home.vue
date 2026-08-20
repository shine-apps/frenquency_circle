<script lang="ts" setup>
import { ref } from 'vue'
import { getUserProfile } from '@/api/search'
import { activityLevelShortText, formatDate, practiceYearsText } from '@/utils/format'
import type { PublicUserProfileDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '用户主页',
  },
})

/** 标签展示最大数量 */
const MAX_TAG_VISIBLE = 5

const userId = ref('')
const profile = ref<PublicUserProfileDTO | null>(null)
const loading = ref(true)
const notFound = ref(false)

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
    const err = e as Error
    console.warn('[UserHome] fetch error:', err?.message)
    notFound.value = true
  }
  finally {
    loading.value = false
  }
}

onLoad((options) => {
  userId.value = (options as any)?.id || ''
  fetchProfile(userId.value)
})

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
  <view class="min-h-screen flex flex-col bg-[#f7f8fa]">
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
      <view v-if="profile.tags.length > 0" class="mx-4 mb-8 mt-4 rounded-2xl bg-white p-5 shadow-sm">
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
    </template>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
