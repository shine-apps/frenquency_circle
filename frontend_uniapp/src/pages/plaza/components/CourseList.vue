<script lang="ts" setup>
/**
 * 广场-课程列表(占位组件,课程功能后续接入)。
 *
 * 预留与 CheckinList / ActivityList 一致的 refresh / loadMore 接口形态,
 * 后续接入真实数据时无需改动广场页的委托逻辑。
 */
async function refresh(_reset = true) {
  // TODO: 课程列表接入后实现
}

async function loadMore() {
  // TODO: 课程列表接入后实现
}

defineExpose({ refresh, loadMore })
</script>

<template>
  <view class="flex flex-col">
    <!-- 工具条:说明文案 -->
    <view class="bg-white px-4 pb-3 pt-1">
      <text class="text-xs text-[#999]">
        精选视频课程,即将上线
      </text>
    </view>

    <!-- 占位空态 -->
    <view class="flex flex-col items-center pt-16">
      <text class="i-carbon-education text-5xl text-[#d9d9d9]" />
      <text class="mt-4 text-sm text-[#999]">
        课程功能建设中,敬请期待
      </text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
