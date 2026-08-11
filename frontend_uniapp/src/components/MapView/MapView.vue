<script lang="ts" setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { loadAMap } from '@/utils/amap'

/**
 * 跨平台地图展示组件。
 *
 * - 小程序端:使用 uni-app 原生 <map>(微信腾讯地图)
 * - H5:使用高德地图 JS API(动态加载)
 *
 * 仅用于"展示"当前位置与标记,不含选点交互。
 * 选点请使用 H5LocationPicker。
 */

const props = withDefaults(defineProps<{
  /** 纬度(gcj02) */
  latitude: number
  /** 经度(gcj02) */
  longitude: number
  /** 缩放级别(默认 15) */
  scale?: number
  /** 是否展示当前位置标记(H5 始终展示) */
  showLocation?: boolean
  /** 地图加载/定位失败时的占位文案 */
  placeholderText?: string
}>(), {
  scale: 15,
  showLocation: true,
  placeholderText: '地图加载失败',
})

const loadError = ref(false)
// H5 端地图容器
const containerRef = ref<HTMLDivElement | null>(null)
let mapInstance: any = null
let markerInstance: any = null

// #ifdef H5
/** H5 端初始化高德地图 */
async function initH5Map() {
  try {
    const AMap = await loadAMap()
    if (!containerRef.value) return
    // 高德坐标顺序为 [lng, lat]
    mapInstance = new AMap.Map(containerRef.value, {
      zoom: props.scale,
      center: [props.longitude, props.latitude],
      resizeEnable: true,
    })
    markerInstance = new AMap.Marker({
      position: [props.longitude, props.latitude],
      map: mapInstance,
    })
    loadError.value = false
  }
  catch {
    loadError.value = true
  }
}

onBeforeUnmount(() => {
  // 卸载时销毁地图实例,释放内存
  if (mapInstance) {
    mapInstance.destroy()
    mapInstance = null
    markerInstance = null
  }
})

watch(
  () => [props.longitude, props.latitude] as const,
  ([lng, lat]) => {
    if (mapInstance && markerInstance) {
      // 高德坐标顺序为 [lng, lat]
      mapInstance.setCenter([lng, lat])
      markerInstance.setPosition([lng, lat])
    }
  },
)
// #endif
</script>

<template>
  <!-- #ifndef H5 -->
  <!-- 小程序端:uni-app 原生 map 组件 -->
  <map
    class="h-full w-full"
    :longitude="longitude"
    :latitude="latitude"
    :scale="scale"
    :show-location="showLocation"
  />
  <!-- #endif -->

  <!-- #ifdef H5 -->
  <view v-if="loadError" class="flex h-full w-full items-center justify-center bg-[#f5f6f7]">
    <text class="text-sm text-[#999]">
      {{ placeholderText }}
    </text>
  </view>
  <view v-else ref="containerRef" class="h-full w-full" />
  <!-- #endif -->
</template>

<style lang="scss" scoped>
//
</style>
