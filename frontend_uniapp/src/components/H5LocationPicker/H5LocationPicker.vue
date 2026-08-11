<script lang="ts" setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { getCurrentLocation } from '@/utils/location'
import { loadAMap, reverseGeocode, searchPlaces, type PlaceSearchResult } from '@/utils/amap'

/** 逆地理编码防抖时长(ms) */
const REVERSE_GEOCODE_DEBOUNCE = 300
/** 搜索防抖时长(ms) */
const SEARCH_DEBOUNCE = 400

const props = defineProps<{
  /** 是否显示 */
  visible: boolean
  /** 初始纬度(可空,空则尝试当前定位) */
  initialLat?: number | null
  /** 初始经度(可空,空则尝试当前定位) */
  initialLng?: number | null
  title?: string
}>()

const emit = defineEmits<{
  (e: 'confirm', loc: { latitude: number; longitude: number; address: string }): void
  (e: 'close'): void
}>()

/**
 * 地图容器 DOM id。
 *
 * 用 id + document.getElementById 取真实 DOM,而非 ref:
 * - uni-app H5 端 <view> 渲染为自定义元素 <uni-view>,Vue 3 对其使用 ref
 *   返回的是组件代理对象(Proxy),非标准 HTMLElement 实例。高德 SDK 2.0 内部
 *   instanceof HTMLElement 判断失败后会回退当作字符串 id 调 document.getElementById,
 *   触发 "Cannot convert object to primitive value" 错误。
 * - 此外 <uni-view> 上 :id 动态属性可能不落盘到真实 DOM,getElementById 会
 *   返回 null 触发 "Map container div not exist"。因此容器直接用原生 <div>,
 *   id 由 getElementById 唯一取用。
 */
const containerId = `h5-loc-picker-${Math.random().toString(36).slice(2, 10)}`

/** 等待地图容器 DOM 挂载(v-if 渲染存在异步时序,轮询兜底) */
function waitForContainer(timeout = 3000): Promise<HTMLElement | null> {
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
const mapRef = ref<any>(null)
/** 当前选中的中心点(经纬度) */
const center = ref<{ lat: number; lng: number } | null>(null)
/** 底部展示的地址 */
const address = ref('')
const loading = ref(true)
/** 加载失败时的具体错误信息(为空表示无错误) */
const errorMsg = ref('')
/** 搜索关键词 */
const searchKeyword = ref('')
/** 搜索结果列表 */
const searchResults = ref<PlaceSearchResult[]>([])
/** 是否正在搜索 */
const searching = ref(false)
/** 是否展示搜索下拉结果 */
const showSearchResult = ref(false)

// 逆地理防抖计时器
let debounceTimer: ReturnType<typeof setTimeout> | null = null
// 搜索防抖计时器
let searchTimer: ReturnType<typeof setTimeout> | null = null
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
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  if (mapRef.value) {
    mapRef.value.destroy()
    mapRef.value = null
  }
  loading.value = true
  errorMsg.value = ''
  searchResults.value = []
  showSearchResult.value = false
  searching.value = false
}

/** 初始化地图 */
async function initMap() {
  loading.value = true
  errorMsg.value = ''
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
      catch (err) {
        // 定位失败,兜底北京天安门
        console.warn('[H5LocationPicker] getCurrentLocation 失败,使用兜底坐标:', err)
        lat = 39.908823
        lng = 116.397470
      }
    }

    const AMap = await loadAMap()
    const el = await waitForContainer()
    if (!el) {
      throw new Error('地图容器 DOM 未就绪')
    }

    // 高德坐标顺序 [lng, lat]
    mapRef.value = new AMap.Map(el, {
      zoom: 16,
      center: [lng, lat],
      resizeEnable: true,
    })

    // 拖动结束 → 取中心点 → 逆地理
    mapRef.value.on('mapmove', () => {
      if (!ready) return
      // 拖动地图时收起搜索结果下拉
      showSearchResult.value = false
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
  catch (err) {
    console.error('[H5LocationPicker] 地图初始化失败:', err)
    loading.value = false
    errorMsg.value = err instanceof Error ? err.message : String(err)
  }
}

/** 重试加载地图 */
function handleRetry() {
  destroyMap()
  ready = false
  setTimeout(initMap, 50)
}

/** 输入防抖触发搜索 */
function handleSearchInput() {
  showSearchResult.value = true
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  const kw = searchKeyword.value.trim()
  if (!kw) {
    searchResults.value = []
    searching.value = false
    return
  }
  searching.value = true
  searchTimer = setTimeout(() => {
    void doSearch(kw)
  }, SEARCH_DEBOUNCE)
}

/** 执行 POI 搜索 */
async function doSearch(kw: string) {
  searching.value = true
  const results = await searchPlaces(kw)
  // 关键词可能已变化,仅展示最新一次的结果
  if (kw === searchKeyword.value.trim()) {
    searchResults.value = results
    searching.value = false
  }
}

/** 选择搜索结果:地图中心移到该地点并更新地址 */
function handleSelectPlace(poi: PlaceSearchResult) {
  if (!mapRef.value) return
  // 移动地图中心(setCenter 会触发 mapmove,进而逆地理编码更新地址)
  mapRef.value.setCenter([poi.lng, poi.lat])
  // 地址先直接用 POI 名称,等 mapmove 的逆地理结果回来再覆盖为完整地址
  center.value = { lat: poi.lat, lng: poi.lng }
  address.value = poi.name
  searchKeyword.value = poi.name
  searchResults.value = []
  showSearchResult.value = false
}

/** 清空搜索关键词 */
function clearSearch() {
  searchKeyword.value = ''
  searchResults.value = []
  showSearchResult.value = false
  searching.value = false
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
  <view v-if="visible" class="fixed inset-0 z-1000 flex flex-col bg-white pb-safe">
    <!-- 头部:左取消 / 中标题 / 右确认 -->
    <view class="relative flex h-12 items-center justify-between border-b border-[#f0f0f0] px-4">
      <text class="py-2 text-sm text-[#666]" @click="emit('close')">
        取消
      </text>
      <text class="absolute left-1/2 -translate-x-1/2 text-base font-medium text-[#333]">
        {{title || '选择位置' }}
      </text>
      <text class="py-2 text-sm font-medium text-[#018d71]" @click="handleConfirm">
        确认
      </text>
    </view>

    <!-- 位置信息 -->
    <view class="flex flex-col gap-4 p-4">
      <text class="line-clamp-2 text-sm text-[#333]">
        {{ address || '拖动地图选择位置' }}
      </text>
    </view>
    <!-- 地图容器 -->
    <view class="relative flex-1">
      <!-- 搜索框(覆盖在地图上方) -->
      <view class="absolute top-3 left-3 right-3 z-20">
        <view class="flex items-center rounded-full border border-[#e5e5e5] bg-white px-3 shadow-md">
          <text class="mr-2 text-base text-[#999]">
            🔍
          </text>
          <input
            v-model="searchKeyword"
            class="h-10 flex-1 text-sm text-[#333]"
            placeholder="搜索地点,如: 天安门"
            confirm-type="search"
            :disabled="loading || !!errorMsg"
            @input="handleSearchInput"
          />
          <text v-if="searchKeyword" class="px-1 text-base text-[#ccc]" @click="clearSearch">
            ✕
          </text>
        </view>

        <!-- 搜索结果下拉 -->
        <view
          v-if="showSearchResult && (searching || searchResults.length)"
          class="absolute top-full left-0 right-0 z-30 mt-2 max-h-72 overflow-y-auto rounded-xl border border-[#e5e5e5] bg-white shadow-lg"
        >
          <view v-if="searching" class="flex justify-center py-4">
            <text class="text-xs text-[#999]">
              搜索中...
            </text>
          </view>
          <template v-else>
            <view
              v-for="poi in searchResults"
              :key="poi.id"
              class="border-b border-[#f5f5f5] px-3 py-2.5 last:border-b-0 active:bg-[#f5f5f5]"
              @click="handleSelectPlace(poi)"
            >
              <text class="block truncate text-sm text-[#333]">
                {{ poi.name }}
              </text>
              <text class="mt-0.5 block truncate text-xs text-[#999]">
                {{ poi.district }}{{ poi.address }}
              </text>
            </view>
            <view v-if="showSearchResult && !searching && searchResults.length === 0" class="py-4 text-center">
              <text class="text-xs text-[#999]">
                未找到相关地点
              </text>
            </view>
          </template>
        </view>
      </view>

      <!-- 用原生 div 作为地图容器:uni-app H5 中 view/uni-view 的 id 动态属性
           可能不落盘到真实 DOM,且 ref 拿到的是组件代理对象,高德 SDK 无法识别 -->
      <div :id="containerId" class="h-full w-full" />
      <!-- 中心图钉(固定在地图视觉中心) -->
      <view class="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-full">
        <view class="i-carbon:location-filled text-[30px] leading-none text-red-500" />
      </view>
      <!-- 加载遮罩 -->
      <view v-if="loading" class="absolute inset-0 flex items-center justify-center bg-white/80">
        <text class="text-sm text-[#999]">
          加载中...
        </text>
      </view>
      <!-- 加载失败遮罩:显示具体错误 + 重试按钮 -->
      <view v-else-if="errorMsg" class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white/95 px-6">
        <text class="text-sm text-[#666]">
          地图加载失败
        </text>
        <text class="text-center text-xs text-[#999]">
          {{ errorMsg }}
        </text>
        <button
          class="mt-2 h-9 rounded-full bg-[#018d71] px-6 text-sm font-medium text-white"
          @click="handleRetry"
        >
          重新加载
        </button>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
