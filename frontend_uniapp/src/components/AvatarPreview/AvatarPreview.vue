<script lang="ts" setup>
/**
 * 圆形头像预览(纯展示,无交互)。
 * 供头像选择入口(button/view)内部复用,统一"图片 / + 占位 / 保存中 loading"三态。
 * 单根节点包裹(h-full w-full),父容器只需提供尺寸与定位上下文。
 */
defineProps<{
  /** 头像本地路径(chooseAvatar 临时路径或裁剪产物) */
  src: string
  /** 上传/保存中,叠加 loading 蒙层 */
  saving: boolean
}>()
</script>

<template>
  <view class="relative flex h-full w-full items-center justify-center overflow-hidden rounded-full">
    <image
      v-if="src"
      :src="src"
      class="h-full w-full"
      mode="aspectFill"
    />
    <text v-else class="text-[40px] text-[#ccc] leading-none">
      +
    </text>
    <view
      v-if="saving"
      class="absolute inset-0 flex items-center justify-center rounded-full bg-black/30"
    >
      <wd-loading color="#ffffff" size="20" />
    </view>
  </view>
</template>
