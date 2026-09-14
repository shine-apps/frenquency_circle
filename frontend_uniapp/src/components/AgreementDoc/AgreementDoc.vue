<script lang="ts" setup>
/**
 * 协议 / 政策正文展示组件。
 *
 * - 原生渲染(不依赖 web-view):小程序端无需配置业务域名,H5 与小程序表现一致;
 * - 《用户协议》与《隐私政策》两页共用同一版式,正文由各页面通过 sections 传入;
 * - 仅负责排版,不关心协议内容,内容调整不需要改本组件。
 */
defineProps<{
  /** 文档主标题 */
  title: string
  /** 副标题,如「趣邻圈用户服务协议」 */
  subtitle: string
  /** 更新日期,如 2026-09-14 */
  updatedAt: string
  /** 正文小节 */
  sections: Array<{
    /** 小节标题 */
    heading: string
    /** 段落(整段展示) */
    paragraphs?: string[]
    /** 要点(以圆点引导逐条展示) */
    bullets?: string[]
    /** 收尾段落(展示在要点之后) */
    trailingParagraphs?: string[]
  }>
}>()
</script>

<template>
  <view class="flex flex-col px-4 pb-16 pt-4">
    <!-- ====== 标题与更新日期 ====== -->
    <view class="rounded-2xl bg-white px-4 py-5">
      <text class="block text-lg text-[#333] font-semibold">
        {{ title }}
      </text>
      <text class="mt-1 block text-xs text-[#999]">
        {{ subtitle }}
      </text>
      <text class="mt-2 block text-xs text-[#999]">
        更新日期:{{ updatedAt }}
      </text>
    </view>

    <!-- ====== 正文小节 ====== -->
    <view
      v-for="(section, idx) in sections"
      :key="section.heading"
      class="mt-3 rounded-2xl bg-white px-4 py-5"
    >
      <text class="block text-sm text-[#018d71] font-semibold">
        {{ idx + 1 }}. {{ section.heading }}
      </text>
      <text
        v-for="(paragraph, pIdx) in section.paragraphs ?? []"
        :key="`p-${pIdx}`"
        class="mt-2 block text-sm text-[#555] leading-6"
      >
        {{ paragraph }}
      </text>
      <text
        v-for="(bullet, bIdx) in section.bullets ?? []"
        :key="`b-${bIdx}`"
        class="mt-2 block text-sm text-[#555] leading-6"
      >
        · {{ bullet }}
      </text>
      <text
        v-for="(tail, tIdx) in section.trailingParagraphs ?? []"
        :key="`t-${tIdx}`"
        class="mt-2 block text-sm text-[#555] leading-6"
      >
        {{ tail }}
      </text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
