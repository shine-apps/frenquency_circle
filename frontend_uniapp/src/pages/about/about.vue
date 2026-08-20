<script lang="ts" setup>
definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '关于我们',
  },
  excludeLoginPath: true,
})

/** 应用版本号(与 manifest.config.ts 中 versionName 保持一致) */
const APP_VERSION = '1.0.0'

/** 应用简介 */
const APP_INTRO = '趣邻圈是一款基于地理位置的兴趣圈子匹配平台。无论你热爱运动、艺术、手工、音乐、阅读、美食还是其他任何兴趣爱好,都能通过兴趣标签与定位匹配,在 1km / 5km / 10km / 30km 范围内发现同趣的人与圈子,让"同趣"的人在城市中相遇。'

/** 核心特性 */
const FEATURES = [
  { title: '同趣匹配', desc: '按兴趣标签精准匹配附近同趣之人' },
  { title: '兴趣圈子', desc: '发现并加入身边的各类兴趣圈子' },
  { title: '便捷联系', desc: '平台内微信 / 手机号直联,低门槛社交' },
]
</script>

<template>
  <view class="flex flex-col pb-16">
    <!-- ====== Logo 与版本 ====== -->
    <view class="mt-10 flex flex-col items-center">
      <image
        src="/static/images/logo_256_circle.png"
        class="h-24 w-24 rounded-full shadow"
        mode="aspectFit"
      />
      <text class="mt-4 text-xl text-[#333] font-semibold">
        趣邻圈
      </text>
      <text class="mt-1 text-xs text-[#999]">
        V{{ APP_VERSION }}
      </text>
    </view>

    <!-- ====== 应用简介 ====== -->
    <view class="mx-4 mt-6 rounded-2xl bg-white px-4 py-5">
      <text class="block text-sm leading-6 text-[#555]">
        {{ APP_INTRO }}
      </text>
    </view>

    <!-- ====== 核心特性 ====== -->
    <view class="mx-4 mt-3 flex gap-3">
      <view
        v-for="feature in FEATURES"
        :key="feature.title"
        class="flex-1 rounded-2xl bg-white px-3 py-4"
      >
        <text class="block text-center text-sm text-[#018d71] font-semibold">
          {{ feature.title }}
        </text>
        <text class="mt-1 block text-center text-xs leading-5 text-[#999]">
          {{ feature.desc }}
        </text>
      </view>
    </view>

    <!-- ====== 版权信息 ====== -->
    <view class="mt-10 flex flex-col items-center">
      <text class="text-xs text-[#ccc]">
        Copyright © 2026 趣邻圈
      </text>
      <text class="mt-1 text-xs text-[#ccc]">
        上海祥和一文化科技有限公司
      </text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
