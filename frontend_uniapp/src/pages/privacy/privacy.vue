<script lang="ts" setup>
import { onBeforeUnmount, ref } from 'vue'
import { useUserStore } from '@/store/user'
import { updatePrivacy } from '@/api/auth'
import type { PrivacySettings } from '@/types'

definePage({
  style: {
    navigationBarTitleText: '隐私设置',
  },
})

/** 默认隐私设置(用户首次进入且 store 为空时使用) */
const DEFAULT_PRIVACY: PrivacySettings = {
  allowMatch: true,
  publicContact: false,
  locationPrecision: 'community',
}

/** 位置精度选项 */
const PRECISION_OPTIONS: Array<{
  value: PrivacySettings['locationPrecision']
  label: string
  desc: string
}> = [
  { value: 'exact', label: '精确', desc: '展示真实距离' },
  { value: 'community', label: '社区', desc: '0.5km 范围脱敏' },
  { value: 'region', label: '区域', desc: '5km 范围脱敏' },
]

const userStore = useUserStore()

// 表单状态(初值从 store 取,空则用默认)
const settings = ref<PrivacySettings>({ ...DEFAULT_PRIVACY })
const saving = ref(false)
// 标记是否已初始化(避免首次 mount 时把默认值当变更触发保存)
const initialized = ref(false)

// 防抖定时器引用
let debounceTimer: ReturnType<typeof setTimeout> | null = null

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})

// 进入时从 store 预填
const user = userStore.userInfo
settings.value = user?.privacySettings ? { ...user.privacySettings } : { ...DEFAULT_PRIVACY }
initialized.value = true

/** 任意字段变更 → 防抖调 updatePrivacy */
function handleChange(next: PrivacySettings) {
  settings.value = next
  if (!initialized.value) return
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    void doSave(next)
  }, 300)
}

/** 实际保存请求 */
async function doSave(next: PrivacySettings) {
  if (saving.value) return
  saving.value = true
  try {
    const persisted = await updatePrivacy(next)
    userStore.setPrivacy(persisted)
    // 同步本地 state(后端可能归一化字段)
    settings.value = persisted
    uni.showToast({ title: '已保存', icon: 'success', duration: 800 })
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '保存失败', icon: 'none' })
  }
  finally {
    saving.value = false
  }
}

/** 切换公开联系方式 */
function handlePublicContactChange(e: any) {
  handleChange({ ...settings.value, publicContact: e.detail.value })
}

/** 切换允许被匹配 */
function handleAllowMatchChange(e: any) {
  handleChange({ ...settings.value, allowMatch: e.detail.value })
}

/** 切换位置精度 */
function handlePrecisionChange(val: PrivacySettings['locationPrecision']) {
  handleChange({ ...settings.value, locationPrecision: val })
}
</script>

<template>
  <view class="flex min-h-screen flex-col bg-[#f7f8fa]">
    <view class="m-4 flex items-center justify-between">
      <text class="text-base font-semibold text-[#333]">
        隐私设置
      </text>
      <text class="text-xs text-[#999]">
        {{ saving ? '保存中...' : '修改后自动保存' }}
      </text>
    </view>

    <!-- ====== 1. 公开联系方式 ====== -->
    <view class="mx-4 flex items-center justify-between rounded-2xl bg-white px-4 py-4">
      <view class="flex flex-col">
        <text class="text-sm font-medium text-[#333]">
          公开联系方式
        </text>
        <text class="mt-1 text-xs text-[#999]">
          关闭后,他人在匹配列表中无法查看你的联系方式
        </text>
      </view>
      <switch
        :checked="settings.publicContact"
        color="#018d71"
        @change="handlePublicContactChange"
      />
    </view>

    <!-- ====== 2. 允许被匹配 ====== -->
    <view class="mx-4 mt-3 flex items-center justify-between rounded-2xl bg-white px-4 py-4">
      <view class="flex flex-col">
        <text class="text-sm font-medium text-[#333]">
          允许被匹配
        </text>
        <text class="mt-1 text-xs text-[#999]">
          关闭后,你不会出现在他人的"同频的人"匹配结果中
        </text>
      </view>
      <switch
        :checked="settings.allowMatch"
        color="#018d71"
        @change="handleAllowMatchChange"
      />
    </view>

    <!-- ====== 3. 位置精度 ====== -->
    <view class="mx-4 mt-3 rounded-2xl bg-white px-4 py-4">
      <view class="flex flex-col">
        <text class="text-sm font-medium text-[#333]">
          位置精度
        </text>
        <text class="mt-1 text-xs text-[#999]">
          控制他人看到的距离精度
        </text>
      </view>
      <view class="mt-4 flex gap-3">
        <view
          v-for="opt in PRECISION_OPTIONS"
          :key="opt.value"
          class="flex-1 rounded-xl border px-3 py-3"
          :class="settings.locationPrecision === opt.value ? 'border-[#018d71] bg-[#f0faf7]' : 'border-[#e8e8e8] bg-white'"
          @click="handlePrecisionChange(opt.value)"
        >
          <text
            class="block text-sm"
            :class="settings.locationPrecision === opt.value ? 'font-medium text-[#018d71]' : 'text-[#333]'"
          >
            {{ opt.label }}
          </text>
          <text class="mt-1 block text-xs text-[#999]">
            {{ opt.desc }}
          </text>
        </view>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
