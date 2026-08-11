<script lang="ts" setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { getCurrentLocation } from '@/utils/location'
import { loadAMap, reverseGeocode } from '@/utils/amap'

/** 逆地理编码防抖时长(ms) */
const REVERSE_GEOCODE_DEBOUNCE = 300

const props = defineProps<{
  /** 是否显示 */
  visible: boolean
  /** 初始纬度(可空,空则尝试当前定位) */
  initialLat?: number | null
  /** 初始经度(可空,空则尝试当前定位) */
  initialLng?: number | null
}>()

const emit = defineEmits<{
  (e: 'confirm', loc: { latitude: number; longitude: number; address: string }): void
  (e: 'close'): void
}>()

const containerRef = ref<HTMLDivElement | null>(null)
const mapRef = ref<any>(null)
/** 当前选中的中心点(经纬度) */
const center = ref<{ lat: number; lng: number } | null>(null)
/** 底部展示的地址 */
const address = ref('')
const loading = ref(true)

// 逆地理防抖计时器
let debounceTimer: ReturnType<typeof setTimeout> | null = null
// 防止 moveend 回调在初始化时触发逆地理
let ready = false
// 逆地理请求令牌:每次发起新请求自增,resolve 时比对,避免旧请求覆盖新地址
let geoReqId = 0

function destroyMap() {
  geoReqId++
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (mapRef.value) {
    mapRef.value.destroy()
    mapRef.value = null
  }
  loading.value = true
}

/** 初始化地图 */
async function initMap() {
  try {
    // 解析初始中心点
    let lat = props.initialLat
    let lng = props.initialLng
    if (lat === null || lng === null || lat === undefined || lng === undefined) {
      try {
        const res = await getCurrentLocation()
        lat = res.latitude
        lng = res.longitude
      }
      catch {
        // 定位失败,兜底北京天安门
        lat = 39.908823
        lng = 116.397470
      }
    }

    const AMap = await loadAMap()
    if (!containerRef.value) return

    // 高德坐标顺序 [lng, lat]
    mapRef.value = new AMap.Map(containerRef.value, {
      zoom: 16,
      center: [lng, lat],
      resizeEnable: true,
    })

    // 拖动结束 → 取中心点 → 逆地理
    mapRef.value.on('mapmove', () => {
      if (!ready) return
      const c = mapRef.value.getCenter()
      // 防抖
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        const curLat = c.getLat()
        const curLng = c.getLng()
        center.value = { lat: curLat, lng: curLng }
        // 令牌:仅最新请求的 resolve 会 setAddress,避免旧请求覆盖
        const myId = ++geoReqId
        reverseGeocode(curLat, curLng).then((addr) => {
          if (myId === geoReqId) address.value = addr
        })
      }, REVERSE_GEOCODE_DEBOUNCE)
    })

    center.value = { lat, lng }
    const myId = ++geoReqId
    const addr = await reverseGeocode(lat, lng)
    if (myId === geoReqId) address.value = addr
    ready = true
    loading.value = false
  }
  catch {
    loading.value = false
    address.value = '地图加载失败'
  }
}

// 打开时初始化地图
watch(
  () => props.visible,
  (val) => {
    if (!val) return
    ready = false
    // 延迟一帧,确保弹层已挂载并具备尺寸
    setTimeout(initMap, 50)
  },
)

onBeforeUnmount(() => {
  destroyMap()
})

/** 确认选点 */
function handleConfirm() {
  if (!center.value) return
  emit('confirm', {
    latitude: center.value.lat,
    longitude: center.value.lng,
    address: address.value || '已定位',
  })
}
</script>

<template>
  <view v-if="visible" class="fixed inset-0 z-1000 flex flex-col bg-white">
    <!-- 头部 -->
    <view class="flex h-12 items-center justify-center border-b border-[#f0f0f0]">
      <text class="text-base font-medium text-[#333]">
        选择活动地点
      </text>
      <view class="absolute right-4 flex h-8 w-8 items-center justify-center" @click="emit('close')">
        <text class="text-lg text-[#999]">
          ✕
        </text>
      </view>
    </view>

    <!-- 地图容器 -->
    <view class="relative flex-1">
      <view ref="containerRef" class="h-full w-full" />
      <!-- 中心图钉(固定在地图视觉中心) -->
      <view class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full">
        <view class="relative mx-auto h-0 w-0 border-x-8 border-t-12 border-x-transparent border-t-[#018d71]" />
      </view>
      <!-- 加载遮罩 -->
      <view v-if="loading" class="absolute inset-0 flex items-center justify-center bg-white/80">
        <text class="text-sm text-[#999]">
          加载中...
        </text>
      </view>
    </view>

    <!-- 底部 -->
    <view class="flex flex-col gap-4 p-4 pb-safe">
      <text class="line-clamp-2 text-sm text-[#333]">
        {{ address || '拖动地图选择位置' }}
      </text>
      <button
        class="h-12 rounded-full bg-[#018d71] text-base font-medium text-white"
        :disabled="!center || loading"
        @click="handleConfirm"
      >
        确认位置
      </button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
