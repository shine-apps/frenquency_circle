<script lang="ts" setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadAMap } from '@/utils/amap'

const props = withDefaults(defineProps<{
  /** 纬度(gcj02) */
  latitude: number
  /** 经度(gcj02) */
  longitude: number
  /** 缩放级别(默认 15) */
  scale?: number
  /** 是否展示当前位置标记(H5 始终展示主标注点) */
  showLocation?: boolean
  /** 地图加载/定位失败时的占位文案 */
  placeholderText?: string
  /** 附加标注点列表(经纬度 gcj02),H5 与小程序端均支持 */
  markers?: Array<{ latitude: number, longitude: number, label?: string }>
  /** 是否自动缩放视野以容纳所有标注点(默认 false) */
  fitMarkers?: boolean
  /** H5 端 SDK 加载超时(ms) */
  timeout?: number
}>(), {
  scale: 15,
  showLocation: true,
  placeholderText: '地图加载失败',
  markers: () => [],
  fitMarkers: false,
  timeout: DEFAULT_LOAD_TIMEOUT,
})

/**
 * 跨平台地图展示组件。
 *
 * - 小程序端:使用 uni-app 原生 <map>(微信腾讯地图)
 * - H5:使用高德地图 JS API(动态加载)
 *
 * 仅用于"展示"指定位置与标注点,不含选点交互。
 * 选点请使用 H5LocationPicker。
 *
 * H5 端特性:
 * - 地图容器使用原生 <div> + document.getElementById 取真实 DOM。
 *   uni-app H5 的 <view> 渲染为 <uni-view> 自定义元素,ref 拿到的是组件
 *   代理对象,高德 SDK 2.0 无法识别,会触发 "Map container div not exist"。
 * - 显式开启拖拽 / 单双指缩放 / 双击放大等手势,并随容器与窗口尺寸变化重绘。
 * - SDK 加载带超时控制(默认 12s),加载失败 / 断网时降级为静态占位视图,
 *   仍展示经纬度信息,并提供"重新加载"入口。
 */

/** H5 端 SDK 默认加载超时(ms) */
const DEFAULT_LOAD_TIMEOUT = 12000

// 小程序端原生 map 的附加标注点(主位置由 show-location 蓝点展示)。
// 类型放宽为 any:uni-app 类型要求 iconPath,但本项目无 marker 图标资源,
// 无 iconPath 时小程序端以 label 气泡形式展示标注。
const nativeMarkers = computed<any[]>(() =>
  props.markers.map((m, i) => ({
    id: i + 1,
    latitude: m.latitude,
    longitude: m.longitude,
    title: m.label || '',
    ...(m.label ? { label: { content: m.label, fontSize: 12, color: '#333' } } : {}),
  })),
)

// #ifdef H5
/** 地图容器 DOM id(随机唯一,供 getElementById 取真实 DOM) */
const containerId = `map-view-${Math.random().toString(36).slice(2, 10)}`
/** 是否正在加载 SDK/初始化地图 */
const loading = ref(true)
/** SDK 加载失败或超时 */
const loadError = ref(false)
/** 当前是否处于断网状态(navigator.onLine 兜底) */
const isOffline = ref(typeof navigator !== 'undefined' && navigator.onLine === false)
/** 地图已加载后断网:显示轻提示(瓦片可能加载不全) */
const offlineNotice = ref(false)

/** 高德 SDK 模块(loadAMap 的返回值,供标注点渲染复用) */
let AMapModule: any = null
let mapInstance: any = null
/** 主标注点(指定位置) */
let primaryMarker: any = null
/** 附加标注点列表 */
let extraMarkers: any[] = []
/** SDK 加载超时定时器 */
let loadTimer: ReturnType<typeof setTimeout> | null = null
/** 容器尺寸观察器 */
let resizeObserver: ResizeObserver | null = null

/** 等待地图容器 DOM 挂载(v-if 渲染存在异步时序,轮询兜底) */
function waitForContainer(timeout = 5000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const start = Date.now()
    const tick = () => {
      const el = document.getElementById(containerId)
      if (el) {
        resolve(el)
        return
      }
      if (Date.now() - start > timeout) {
        resolve(null)
        return
      }
      setTimeout(tick, 30)
    }
    tick()
  })
}

/** 为加载 Promise 增加超时控制:网络不佳时 SDK 脚本可能挂起,避免无限 loading */
function withLoadTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (loadTimer)
      clearTimeout(loadTimer)
    loadTimer = setTimeout(() => {
      loadTimer = null
      reject(new Error(`地图加载超时(${ms}ms)`))
    }, ms)
    promise
      .then((v) => {
        if (loadTimer) {
          clearTimeout(loadTimer)
          loadTimer = null
        }
        resolve(v)
      })
      .catch((e) => {
        if (loadTimer) {
          clearTimeout(loadTimer)
          loadTimer = null
        }
        reject(e)
      })
  })
}

/** 清空附加标注点 */
function clearExtraMarkers() {
  extraMarkers.forEach((m) => {
    m?.setMap?.(null)
  })
  extraMarkers = []
}

/** 渲染附加标注点(重建,支持 label 气泡) */
function renderExtraMarkers() {
  if (!mapInstance || !AMapModule)
    return
  clearExtraMarkers()
  props.markers.forEach((m) => {
    const marker = new AMapModule.Marker({
      position: [m.longitude, m.latitude],
      title: m.label || '',
      ...(m.label ? { label: { content: m.label, direction: 'top' } } : {}),
    })
    marker.setMap(mapInstance)
    extraMarkers.push(marker)
  })
  if (props.fitMarkers)
    fitView()
}

/** 调整视野:多标注时容纳全部,单标注时回到默认缩放 */
function fitView() {
  if (!mapInstance)
    return
  const overlays = [primaryMarker, ...extraMarkers].filter(Boolean)
  if (overlays.length > 1) {
    // avoid 数组 [top, right, bottom, left],留边距避免标注贴边
    mapInstance.setFitView(overlays, false, [70, 70, 70, 70])
  }
  else {
    mapInstance.setZoomAndCenter(props.scale, [props.longitude, props.latitude])
  }
}

/** 更新中心点与主标注(高德坐标顺序为 [lng, lat]) */
function updateCenter(lng: number, lat: number) {
  if (!mapInstance)
    return
  mapInstance.setCenter([lng, lat])
  primaryMarker?.setPosition([lng, lat])
}

/** 窗口 / 容器尺寸变化时重绘地图 */
function handleResize() {
  mapInstance?.resize()
}

function handleOnline() {
  isOffline.value = false
  offlineNotice.value = false
}

function handleOffline() {
  isOffline.value = true
  // 地图已加载但断网:瓦片可能加载不全,给出轻提示(降级视图内另有断网文案)
  if (mapInstance)
    offlineNotice.value = true
}

/** H5 端初始化高德地图 */
async function initH5Map() {
  loading.value = true
  loadError.value = false
  try {
    // 带超时加载 SDK,失败走降级
    const AMap = await withLoadTimeout(loadAMap(), props.timeout)
    AMapModule = AMap
    const el = await waitForContainer()
    if (!el)
      throw new Error('地图容器 DOM 未就绪')

    // 显式开启手势:单指拖拽、双指/双击缩放、滚轮缩放
    mapInstance = new AMap.Map(el, {
      zoom: props.scale,
      center: [props.longitude, props.latitude],
      resizeEnable: true, // 容器尺寸变化自动重绘
      dragEnable: true, // 拖拽
      zoomEnable: true, // 缩放
      touchZoom: true, // 触屏双指缩放
      doubleClickZoom: true, // 双击放大
      scrollWheel: true, // 滚轮缩放
      keyboardEnable: false,
    })

    // 主标注点(指定位置)
    primaryMarker = new AMap.Marker({
      position: [props.longitude, props.latitude],
      map: mapInstance,
    })

    renderExtraMarkers()

    // 比例尺控件(轻量,帮助感知当前缩放级别)
    AMap.plugin(['AMap.Scale'], () => {
      mapInstance?.addControl(new AMap.Scale())
    })

    // 窗口(屏幕旋转 / 浏览器尺寸)与容器尺寸变化时重绘,保证移动端不同屏幕适配
    window.addEventListener('resize', handleResize)
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => mapInstance?.resize())
      resizeObserver.observe(el)
    }

    // 网络状态监听:断网时降级提示
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    loading.value = false
  }
  catch (err) {
    console.error('[MapView] H5 地图初始化失败:', err)
    loading.value = false
    loadError.value = true
  }
}

/** 降级视图中的"重新加载" */
function handleRetry() {
  if (mapInstance) {
    mapInstance.destroy()
    mapInstance = null
  }
  primaryMarker = null
  clearExtraMarkers()
  setTimeout(initH5Map, 50)
}

onBeforeUnmount(() => {
  // 清理定时器与事件监听,销毁地图实例释放内存
  if (loadTimer) {
    clearTimeout(loadTimer)
    loadTimer = null
  }
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('online', handleOnline)
  window.removeEventListener('offline', handleOffline)
  resizeObserver?.disconnect()
  resizeObserver = null
  if (mapInstance) {
    mapInstance.destroy()
    mapInstance = null
  }
  primaryMarker = null
  extraMarkers = []
  AMapModule = null
})

// 指定位置变化 → 平移中心并更新主标注
watch(
  () => [props.longitude, props.latitude] as const,
  ([lng, lat]) => {
    updateCenter(lng, lat)
  },
)

// 附加标注点变化 → 重建
watch(
  () => props.markers,
  () => {
    renderExtraMarkers()
  },
  { deep: true },
)

// 组件挂载后初始化 H5 地图
onMounted(() => {
  initH5Map()
})
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
    :markers="nativeMarkers"
  />
  <!-- #endif -->

  <!-- #ifdef H5 -->
  <view class="relative h-full w-full overflow-hidden">
    <!-- 地图容器:原生 div + id 取真实 DOM(uni-view 无法被高德 SDK 识别) -->
    <div :id="containerId" class="h-full w-full" />

    <!-- 加载遮罩:避免白屏闪烁 -->
    <view v-if="loading" class="absolute inset-0 z-10 flex items-center justify-center bg-[#f5f6f7]">
      <text class="text-sm text-[#999]">
        地图加载中...
      </text>
    </view>

    <!-- 网络不佳轻提示(地图已加载后断网) -->
    <view
      v-else-if="offlineNotice"
      class="pointer-events-none absolute left-1/2 top-3 z-20 rounded-full bg-black/60 px-3 py-1 -translate-x-1/2"
    >
      <text class="text-xs text-white">
        网络不佳,地图数据可能不完整
      </text>
    </view>

    <!-- 降级显示:SDK 加载失败 / 超时(常见于网络不佳) -->
    <view
      v-else-if="loadError"
      class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2.5 bg-[#eef1f4] px-6"
    >
      <!-- CSS 网格模拟地图底图,保证断网时仍有地图视觉 -->
      <view class="map-fallback-grid pointer-events-none absolute inset-0 opacity-40" />
      <view class="relative flex flex-col items-center gap-2.5">
        <view class="i-carbon-map text-[42px] text-[#c4c9d0] leading-none" />
        <text class="text-sm text-[#333] font-medium">
          {{ placeholderText }}
        </text>
        <text class="text-center text-xs text-[#999]">
          {{ isOffline ? '当前网络不可用,请检查网络后重试' : '可能处于网络不佳环境,可稍后重试' }}
        </text>
        <text class="text-center text-xs text-[#999]">
          位置 {{ Number(latitude).toFixed(6) }}, {{ Number(longitude).toFixed(6) }}
        </text>
        <wd-button
          size="small"
          @click="handleRetry"
        >
          重新加载
        </wd-button>
      </view>
    </view>
  </view>
  <!-- #endif -->
</template>

<style lang="scss" scoped>
// 降级视图的网格底图,模拟地图街道网
.map-fallback-grid {
  background-image:
    linear-gradient(to right, rgba(0, 0, 0, 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0, 0, 0, 0.05) 1px, transparent 1px);
  background-size: 36px 36px;
}
</style>
