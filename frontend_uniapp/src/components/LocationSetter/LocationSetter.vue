<script lang="ts" setup>
/**
 * 位置设置组件(供首页与个人资料页复用)。
 *
 * 设计要点:
 * - compact:卡片式嵌入,展示当前地址 + "切换位置/选择位置"按钮
 * - full:作为页面主体展示(目前等同 compact;预留扩展)
 * - H5:选点交互走 H5LocationPicker 弹层(高德地图)
 * - 小程序端:选点走 uni.chooseLocation
 * - 组件仅提供选点能力,通过 update:location 把选中位置 emit 给父级;
 *   是否保存到用户资料由父级决定
 *
 * 注意:
 * - 组件本身不控制定位授权,定位失败时由调用方降级引导手动选择
 */
import { computed, ref } from 'vue'

// #ifdef H5
import H5LocationPicker from '@/components/H5LocationPicker/H5LocationPicker.vue'
// #endif

const props = withDefaults(defineProps<{
  /** 当前纬度(可空) */
  latitude?: number | null
  /** 当前经度(可空) */
  longitude?: number | null
  /** 当前地址(可空) */
  address?: string | null
  /** 展示模式 */
  mode?: 'compact' | 'full'
  /** 主标题(卡片头部,仅 compact 显示) */
  title?: string
}>(), {
  mode: 'compact',
  title: '当前位置',
  latitude: null,
  longitude: null,
  address: null,
})

const emit = defineEmits<{
  /** 用户选点完成(仅携带位置信息,是否保存由父级决定) */
  (e: 'update:location', loc: { latitude: number, longitude: number, address: string }): void
}>()

/** H5 端选点弹层显隐 */
const h5PickerVisible = ref(false)
/** 小程序端是否在选点中(避免重复调用) */
const choosing = ref(false)

/** 是否已定位 */
const hasLocation = computed(() => props.latitude != null && props.longitude != null)

/** 主按钮文案 */
const actionLabel = computed(() => (hasLocation.value ? '切换位置' : '选择位置'))

/**
 * 小程序端选点(uni.chooseLocation 返回 { latitude, longitude, address })。
 * 失败(用户取消 / 系统错误)静默处理,不弹 toast。
 */
async function chooseByMiniProgram(): Promise<void> {
  if (choosing.value) return
  choosing.value = true
  try {
    // #ifdef MP-WEIXIN
    const res = await uni.chooseLocation({})
    emitLocation({
      latitude: res.latitude,
      longitude: res.longitude,
      address: res.address || '已定位',
    })
    // #endif
    // #ifndef MP-WEIXIN
    uni.showToast({ title: '当前平台暂不支持选点', icon: 'none' })
    // #endif
  }
  catch (err) {
    // 用户主动取消 uni.chooseLocation 会抛错,无需 toast
    console.warn('[LocationSetter] chooseLocation 取消或失败:', err)
  }
  finally {
    choosing.value = false
  }
}

/** 选中位置:仅将位置信息 emit 给父级,由父级决定是否持久化 */
function emitLocation(loc: { latitude: number, longitude: number, address: string }): void {
  emit('update:location', loc)
}

/** 统一处理选点入口(根据平台分发) */
function handleChoose(): void {
  // #ifdef H5
  h5PickerVisible.value = true
  // #endif
  // #ifndef H5
  void chooseByMiniProgram()
  // #endif
}

/** H5 端弹层确认 */
function handleH5Confirm(loc: { latitude: number, longitude: number, address: string }): void {
  h5PickerVisible.value = false
  emitLocation(loc)
}

/** H5 端弹层关闭 */
function handleH5Close(): void {
  h5PickerVisible.value = false
}
</script>

<template>
  <view
    class="rounded-2xl bg-white p-4 shadow-sm"
    :class="mode === 'full' ? 'min-h-[60vh]' : ''"
  >
    <!-- 头部:标题 + 操作按钮 -->
    <view class="flex items-center justify-between">
      <view class="flex items-center gap-2">
        <view class="i-carbon:location-filled text-[18px] text-[#018d71]" />
        <text class="text-sm font-medium text-[#333]">
          {{ title }}
        </text>
        <view v-if="hasLocation" class="rounded-full bg-[#e8f5f1] px-2 py-0.5">
          <text class="text-xs text-[#018d71]">
            已设置
          </text>
        </view>
      </view>
      <wd-button type="primary" @click="handleChoose" variant="text" size="small">{{ actionLabel }} ›</wd-button>
    </view>

    <!-- 当前地址 -->
    <view class="mt-3 flex items-start gap-2">
      <view class="i-carbon:location text-[16px] text-[#999] mt-0.5" />
      <text class="flex-1 text-sm leading-6 text-[#333] break-all">
        {{ address || '暂未设置位置,选择后可匹配附近同频的人与圈子' }}
      </text>
    </view>

    <!-- H5 端选点弹层 -->
    <!-- #ifdef H5 -->
    <H5LocationPicker
      :visible="h5PickerVisible"
      :initial-lat="latitude ?? null"
      :initial-lng="longitude ?? null"
      title="选择位置"
      @confirm="handleH5Confirm"
      @close="handleH5Close"
    />
    <!-- #endif -->
  </view>
</template>

<style lang="scss" scoped>
//
</style>