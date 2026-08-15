<script lang="ts" setup>
/**
 * 首页匹配过滤栏:兴趣卡片 + 位置卡片 + 范围选择 Tab 的纯输入/输出封装。
 *
 * 设计要点:
 * - 组件只有输入(props)与输出(emits),不产生任何副作用:
 *   - 不访问 store(userStore/matchStore)
 *   - 不调用 api、不触发 loadAll / 保存用户资料
 *   - 不 import useDialog 做保存类逻辑
 * - 兴趣标签弹窗 TagSelectorPopup 内嵌于本组件:弹窗显隐由本组件自管,
 *   confirm 结果仅通过 confirm-tags 事件原样交给父页面,由父页面执行
 *   保存/匹配等副作用(与登录态、userStore 相关逻辑保持一致)
 * - LocationSetter 为既有受控组件:直接透传坐标 props,将其
 *   update:location 事件原样转发
 * - rangeKm 由父页面通过 props 受控传入,点击仅 emit change-range,
 *   高亮完全由父级状态驱动,本组件不维护独立 rangeKm 状态
 */
import { computed, ref } from 'vue'
import LocationSetter from '@/components/LocationSetter/LocationSetter.vue'
import TagSelectorPopup from '@/components/TagSelectorPopup/TagSelectorPopup.vue'

const props = withDefaults(defineProps<{
  /** 我的兴趣标签 */
  userTags?: string[]
  /** 当前纬度(可空) */
  latitude?: number | null
  /** 当前经度(可空) */
  longitude?: number | null
  /** 当前地址(可空) */
  address?: string
  /** 当前匹配范围(km),受父级控制 */
  rangeKm?: number
  /** 是否已就绪(位置已设置),就绪后才展示范围 Tab */
  ready?: boolean
}>(), {
  userTags: () => [],
  latitude: null,
  longitude: null,
  address: '',
  rangeKm: 5,
  ready: false,
})

const emit = defineEmits<{
  /** 点击兴趣编辑/去选择按钮 */
  (e: 'edit-tags'): void
  /** 内嵌 TagSelectorPopup confirm:仅转发选择结果,保存由父级决定 */
  (e: 'confirm-tags', tags: string[]): void
  /** 位置选点完成(透传 LocationSetter) */
  (e: 'update:location', loc: { latitude: number, longitude: number, address: string }): void
  /** 切换匹配范围 */
  (e: 'change-range', value: number): void
}>()

/** 预设范围 Tab 选项(移除 30km, 由自定义距离替代) */
const RANGE_OPTIONS: Array<{ label: string, value: number }> = [
  { label: '1km', value: 1 },
  { label: '5km', value: 5 },
  { label: '10km', value: 10 },
]

/** 自定义距离输入(字符串,便于输入框清空/编辑) */
const customInput = ref<string>('')
/** 是否展示自定义距离输入框 */
const showCustomInput = ref(false)
/** 自定义距离输入上限(km) */
const MAX_CUSTOM_KM = 200

/** 当前是否为预设范围之一(高亮由父级 rangeKm 驱动) */
const isPresetActive = computed(() => props.rangeKm !== null && RANGE_OPTIONS.some(o => o.value === props.rangeKm))

/** 点击「自定义」Tab:展开输入框 */
function handleCustomTab(): void {
  showCustomInput.value = true
  customInput.value = ''
}

/** 确认自定义距离:校验通过 emit change-range,否则提示 */
function handleConfirmCustom(): void {
  const value = Number(customInput.value)
  if (!Number.isFinite(value) || value <= 0 || value > MAX_CUSTOM_KM) {
    uni.showToast({ title: `请输入 1~${MAX_CUSTOM_KM} 的公里数`, icon: 'none' })
    return
  }
  const km = Math.round(value * 10) / 10 // 保留 1 位小数
  showCustomInput.value = false
  emit('change-range', km)
}

/** 兴趣标签是否已选择 */
const tagsReady = computed(() => props.userTags.length > 0)

/** 兴趣标签选择弹窗显隐(本组件自管,无副作用) */
const tagPopupVisible = ref(false)

/** 点击兴趣编辑/去选择:通知父级并打开弹窗 */
function handleEditTags(): void {
  emit('edit-tags')
  tagPopupVisible.value = true
}

/** 弹窗确认:仅转发结果给父级,由父级处理保存/匹配副作用 */
function handleTagsConfirmed(tags: string[]): void {
  emit('confirm-tags', tags)
}
</script>

<template>
  <view>
    <!-- ====== 我的兴趣卡片 ====== -->
    <view class="mx-4 mt-3 rounded-2xl bg-white p-4 shadow-sm">
      <view class="flex items-center justify-between">
        <view class="flex items-center gap-2">
          <view class="i-carbon:tag text-[18px] text-[#018d71]" />
          <text class="text-sm text-[#333] font-medium">
            我的兴趣
          </text>
          <view v-if="tagsReady" class="rounded-full bg-[#e8f5f1] px-2 py-0.5">
            <text class="text-xs text-[#018d71]">
              {{ userTags.length }} 个
            </text>
          </view>
          <view v-else class="rounded-full bg-[#fff4e5] px-2 py-0.5">
            <text class="text-xs text-[#e68a00]">
              未选择
            </text>
          </view>
        </view>
        <wd-button type="primary" size="small" variant="text" @click="handleEditTags">
          {{ tagsReady ? '编辑' : '去选择' }} ›
        </wd-button>
      </view>
      <view v-if="tagsReady" class="mt-3 flex flex-wrap gap-2">
        <text
          v-for="name in userTags"
          :key="name"
          class="rounded-full bg-[#e8f5f1] px-3 py-1 text-xs text-[#018d71]"
        >
          {{ name }}
        </text>
      </view>
      <text v-else class="mt-3 block text-sm text-[#999] leading-6">
        未选择兴趣，将按距离展示附近的人与圈子；选择兴趣可获得更精准推荐
      </text>
    </view>

    <!-- ====== 当前位置卡片(复用 LocationSetter,原样透传事件) ====== -->
    <view class="mx-4 mt-3">
      <LocationSetter
        :latitude="latitude"
        :longitude="longitude"
        :address="address"
        title="当前位置"
        @update:location="emit('update:location', $event)"
      />
    </view>

    <!-- ====== 范围 Tab ====== -->
    <view v-if="ready" class="mt-3">
      <scroll-view scroll-x class="whitespace-nowrap">
        <view class="flex gap-2 px-4">
          <view
            v-for="opt in RANGE_OPTIONS"
            :key="opt.value"
            class="h-9 min-w-10 flex items-center justify-center rounded-full px-4"
            :class="rangeKm === opt.value ? 'bg-[#018d71]' : 'bg-white'"
            @click="emit('change-range', opt.value)"
          >
            <text :class="rangeKm === opt.value ? 'text-sm font-medium text-white' : 'text-sm text-[#666]'">
              {{ opt.label }}
            </text>
          </view>
          <!-- 自定义 Tab -->
          <view
            class="h-9 flex items-center justify-center rounded-full px-4"
            :class="!isPresetActive ? 'bg-[#018d71]' : 'bg-white'"
            @click="handleCustomTab"
          >
            <text :class="!isPresetActive ? 'text-sm font-medium text-white' : 'text-sm text-[#666]'">
              自定义
            </text>
          </view>
        </view>
      </scroll-view>

      <!-- 自定义距离输入行 -->
      <view v-if="showCustomInput" class="mt-2 flex items-center gap-2 px-4">
        <wd-input
          v-model="customInput"
          type="digit"
          :maxlength="4"
          placeholder="输入公里数"
          class="flex-1"
        />
        <text class="text-sm text-[#666]">km</text>
        <wd-button size="small" type="primary" @click="handleConfirmCustom">
          确定
        </wd-button>
      </view>
    </view>

    <!-- 兴趣标签选择弹窗:仅回传选择结果,保存由父级统一处理(未登录不保存) -->
    <TagSelectorPopup v-model="tagPopupVisible" :initial-tags="userTags" @confirm="handleTagsConfirmed" />
  </view>
</template>

<style lang="scss" scoped>
//
</style>
