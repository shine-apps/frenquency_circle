<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useUserStore } from '@/store/user'
import { useLocationStore } from '@/store/location'
import { useMatchStore } from '@/store/match'
import { publishLocation } from '@/api/locations'
import MapView from '@/components/MapView/MapView.vue'
import { reverseGeocode } from '@/utils/amap'
import { getCurrentLocation } from '@/utils/location'

definePage({
  style: {
    navigationBarTitleText: '搜寻同频',
  },
})

/** 可选匹配范围(公里),与后端 LocationPublishInput.rangeKm 一致 */
const RANGE_OPTIONS: Array<{ label: string; value: 1 | 5 | 10 | 30 }> = [
  { label: '1km', value: 1 },
  { label: '5km', value: 5 },
  { label: '10km', value: 10 },
  { label: '30km', value: 30 },
]

const userStore = useUserStore()
const locationStore = useLocationStore()
const matchStore = useMatchStore()
const user = computed(() => userStore.userInfo)

// 从 location store 预填(若之前已选过位置)
const latitude = ref<number | null>(locationStore.latitude)
const longitude = ref<number | null>(locationStore.longitude)
const address = ref<string | null>(locationStore.address)
const rangeKm = ref<1 | 5 | 10 | 30>(5)
const submitting = ref(false)
const locating = ref(false)
// H5 端地图选点弹层显隐
const pickerVisible = ref(false)
// 发布类型 Tab:location 搜寻同频 / circle 圈子发布
const publishType = ref<'location' | 'circle'>('location')

/** 切换到"发布圈子":TEACHER / ADMIN 直接跳转,其余角色引导先完成教师认证 */
function handleSwitchToCircle() {
  const role = user.value?.role
  if (role === 'TEACHER' || role === 'ADMIN') {
    uni.navigateTo({ url: '/pages/create-circle/create-circle' })
    return
  }
  // 非 TEACHER / ADMIN:弹窗引导前往教师认证页
  uni.showModal({
    title: '教师认证',
    content: '创建圈子需要先完成教师认证,审核通过后即可发布。是否前往认证页面?',
    confirmText: '去认证',
    success(res) {
      if (res.confirm) {
        uni.navigateTo({ url: '/pages/teacher-certification/teacher-certification' })
      }
    },
  })
}

const tagIds = computed(() => (user.value?.tags || []).map(t => t.id))
const hasTags = computed(() => tagIds.value.length > 0)
const hasLocation = computed(() => latitude.value !== null && longitude.value !== null)

// 进入时若无位置,自动尝试一次定位(静默,失败不打扰)
onShow(() => {
  if (latitude.value === null || longitude.value === null) {
    getCurrentLocation()
      .then(async (res) => {
        latitude.value = res.latitude
        longitude.value = res.longitude
        // #ifdef H5
        // H5 端用高德逆地理拿到真实地址;小程序端保持 "已定位" 兜底
        const addr = await reverseGeocode(res.latitude, res.longitude)
        address.value = address.value ?? addr
        // #endif
        // #ifndef H5
        address.value = address.value ?? '已定位'
        // #endif
      })
      .catch((err) => {
        console.warn('[publish] getCurrentLocation failed:', err?.message || err)
      })
  }
})

/**
 * 重新定位/选择位置:
 * - 小程序端:uni.chooseLocation 原生选点(可选点 + 拿地址)
 * - H5:打开 H5LocationPicker 地图选点弹层
 */
async function handleRelocate() {
  if (locating.value) return
  // #ifdef H5
  pickerVisible.value = true
  return
  // #endif
  // #ifndef H5
  locating.value = true
  try {
    // chooseLocation 无 type 参数(仅 getLocation 有),不传默认 gcj02
    const res = await uni.chooseLocation({})
    latitude.value = res.latitude
    longitude.value = res.longitude
    address.value = res.address || res.name || '已选择位置'
  }
  catch (e) {
    const err = e as Error & { errMsg?: string }
    // 用户取消静默
    if (err?.errMsg && /cancel/i.test(err.errMsg)) return
    uni.showToast({ title: err?.message || '定位失败,请检查授权', icon: 'none' })
  }
  finally {
    locating.value = false
  }
  // #endif
}

/** H5 选点弹层确认回调 */
function handlePickerConfirm(loc: { latitude: number; longitude: number; address: string }) {
  latitude.value = loc.latitude
  longitude.value = loc.longitude
  address.value = loc.address
  pickerVisible.value = false
}

/** 跳兴趣选择页 */
function handleEditTags() {
  uni.navigateTo({ url: '/pages/search/search' })
}

/** 搜寻同频 */
async function handlePublish() {
  if (!hasTags.value) {
    uni.showToast({ title: '请先选择兴趣', icon: 'none' })
    return
  }
  if (!hasLocation.value) {
    uni.showToast({ title: '请先选择位置', icon: 'none' })
    return
  }
  if (submitting.value) return
  submitting.value = true
  try {
    const lat = latitude.value as number
    const lng = longitude.value as number
    await publishLocation({
      latitude: lat,
      longitude: lng,
      address: address.value || '已定位',
      tagIds: tagIds.value,
      rangeKm: rangeKm.value,
    })
    // 缓存位置到 location store
    locationStore.setLocation(lat, lng, address.value)
    // 预填 match store(暂不带结果,匹配页进入时拉取)
    matchStore.setMatchResult({
      rangeKm: rangeKm.value,
      location: { latitude: lat, longitude: lng },
      tagIds: tagIds.value,
    })
    uni.navigateTo({ url: '/pages/match/match' })
  }
  catch (e) {
    // 含 429 频控,直接展示后端 message
    uni.showToast({ title: (e as Error).message || '搜寻失败', icon: 'none' })
  }
  finally {
    submitting.value = false
  }
}

const tagsText = computed(() => {
  return hasTags.value
    ? (user.value?.tags || []).map(t => t.name).join('、')
    : '尚未选择兴趣,点击去选择'
})
</script>

<template>
  <view class="flex min-h-screen flex-col bg-[#f7f8fa] pb-40">
    <!-- ====== 0. 发布类型 Tab ====== -->
    <view class="flex bg-white">
      <view
        class="flex-1 py-3 text-center text-sm"
        :class="publishType === 'location' ? 'font-medium text-[#018d71]' : 'text-[#666]'"
        @click="publishType = 'location'"
      >
        搜寻同频
      </view>
      <view
        class="flex-1 py-3 text-center text-sm"
        :class="publishType === 'circle' ? 'font-medium text-[#018d71]' : 'text-[#666]'"
        @click="handleSwitchToCircle"
      >
        发布圈子
      </view>
    </view>

    <!-- ====== 1. 顶部地图 ====== -->
    <view class="relative h-56 bg-white">
      <view v-if="hasLocation" class="h-full w-full">
        <MapView
          :latitude="latitude as number"
          :longitude="longitude as number"
          :scale="15"
          show-location
        />
      </view>
      <view v-else class="flex h-full w-full flex-col items-center justify-center bg-[#f5f6f7]">
        <text class="text-sm text-[#999]">
          未获取到位置
        </text>
        <text class="mt-1 text-xs text-[#ccc]">
          点击右下角"手动定位"
        </text>
      </view>
    </view>

    <!-- ====== 2. 当前位置卡片 ====== -->
    <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
      <view class="flex items-center justify-between">
        <text class="block text-sm font-medium text-[#333]">
          当前位置
        </text>
        <text class="text-sm text-[#018d71]" @click="handleRelocate">
          {{ locating ? '定位中...' : '手动定位 ›' }}
        </text>
      </view>
      <text class="mt-1 block text-base text-[#333]">
        {{ hasLocation ? (address || '已定位') : '点击手动定位选择位置' }}
      </text>
      <text v-if="hasLocation" class="mt-1 block text-xs text-[#999]">
        经纬度:{{ Number(latitude).toFixed(6) }}, {{ Number(longitude).toFixed(6) }}
      </text>
    </view>

    <!-- ====== 3. 我的兴趣卡片 ====== -->
    <view class="mx-4 mt-3 rounded-2xl bg-white p-4" @click="handleEditTags">
      <view class="flex items-center justify-between">
        <text class="text-sm font-medium text-[#333]">
          我的兴趣
        </text>
        <text class="text-sm text-[#018d71]">
          编辑 ›
        </text>
      </view>
      <text class="mt-1 block text-base text-[#333]">
        {{ tagsText }}
      </text>
      <text class="mt-1 block text-xs text-[#999]">
        共 {{ tagIds.length }} 个标签
      </text>
    </view>

    <!-- ====== 4. 范围选择 ====== -->
    <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
      <text class="block text-sm font-medium text-[#333]">
        匹配范围
      </text>
      <view class="mt-3 flex gap-2">
        <view
          v-for="opt in RANGE_OPTIONS"
          :key="opt.value"
          class="flex-1 rounded-lg py-2 text-center"
          :class="rangeKm === opt.value ? 'bg-[#018d71]' : 'bg-[#f5f6f7]'"
          @click="rangeKm = opt.value"
        >
          <text :class="rangeKm === opt.value ? 'text-sm font-medium text-white' : 'text-sm text-[#666]'">
            {{ opt.label }}
          </text>
        </view>
      </view>
    </view>

    <!-- ====== 5. 搜寻按钮 ====== -->
    <view class="mx-4 mt-4">
      <wd-button
        block
        :loading="submitting"
        :disabled="!hasTags || !hasLocation"
        @click="handlePublish"
      >
        开始搜寻
      </wd-button>
      <text v-if="!hasTags" class="mt-2 block text-center text-xs text-[#999]">
        请先选择兴趣
      </text>
      <text v-else-if="!hasLocation" class="mt-2 block text-center text-xs text-[#999]">
        请先选择位置
      </text>
    </view>

    <!-- ====== H5 端地图选点弹层 ====== -->
    <!-- #ifdef H5 -->
    <H5LocationPicker
      :visible="pickerVisible"
      :initial-lat="latitude"
      :initial-lng="longitude"
      @confirm="handlePickerConfirm"
      @close="pickerVisible = false"
    />
    <!-- #endif -->
  </view>
</template>
