<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { updateMyProfile, fromUserDTO } from '@/api/auth'
import { uploadFileToCos } from '@/api/upload'
import { useUserStore } from '@/store/user'
import type { UserGender } from '@/types'
import AvatarPreview from '@/components/AvatarPreview/AvatarPreview.vue'
// #ifndef MP-WEIXIN
import { chooseImages } from '@/utils/chooseImage'
// #endif

/**
 * 资料补全弹窗(昵称 + 头像 + 性别 + 生日)。
 *
 * - 点击保存后直接提交:上传头像(可选) → `updateMyProfile` → 同步 `userStore`,
 *   完成后通过 `success` 通知父组件;
 * - 头像为可选项,裁剪产物先暂存本地,点击保存时才上传(避免取消产生 COS 孤儿文件);
 * - 性别 / 生日为可选项,未选择时不写入后端(不覆盖已有值);
 * - 保存中保持 loading,防止重复提交;
 * - 弹窗默认不允许点遮罩关闭,只有完成保存或点击"稍后再说"才会关闭。
 */

const props = defineProps<{
  /** 弹窗显隐 */
  modelValue: boolean
  /** 点击遮罩是否关闭(默认 false:补全引导需显式完成或关闭) */
  closeOnClickModal?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', visible: boolean): void
  (e: 'success'): void
  (e: 'cancel'): void
}>()

const userStore = useUserStore()

/** 微信 chooseAvatar 事件回调 detail 类型(字段可选,微信可能不返回 avatarUrl) */
type ChooseAvatarDetail = { avatarUrl?: string }
/** 小程序 input 事件回调类型(输入值位于 e.detail.value) */
type InputEvent = { detail: { value: string } }

/** 昵称长度上限(与后端一致) */
const NAME_MAX = 20

// ===== 表单状态 =====
const name = ref('')
/** 性别(可空:未选择) */
const gender = ref<UserGender | null>(null)
/** 生日 YYYY-MM-DD(可空字符串:未选择) */
const birthday = ref('')
/**
 * 头像本地路径(预览 + 确认时上传源):
 * - 非微信端:选图 + wd-img-cropper 1:1 裁剪后的临时路径
 * - 微信端:chooseAvatar 事件直接返回的临时路径(已带裁剪效果)
 */
const localAvatarPath = ref('')
/** 提交中(含头像上传);成功后保持,防止重复提交,待父组件关闭弹窗 */
const saving = ref(false)
/** 生日选择器显隐 */
const birthdayPickerVisible = ref(false)

// ===== 头像裁剪状态(非微信端:选图后 1:1 裁剪) =====
// #ifndef MP-WEIXIN
const cropVisible = ref(false)
const cropSrc = ref('')
// #endif

// 打开时重置状态(性别/生日回填当前用户已有值)
watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      name.value = ''
      localAvatarPath.value = ''
      saving.value = false
      gender.value = userStore.userInfo?.gender ?? null
      birthday.value = userStore.userInfo?.birthday ?? ''
      birthdayPickerVisible.value = false
    }
  },
)

// ===== 生日选择 =====
/** 生日可选范围:1900-01-01 ~ 今天 */
const BIRTHDAY_MIN_DATE = new Date(1900, 0, 1).getTime()
const todayEnd = new Date()
const BIRTHDAY_MAX_DATE = new Date(todayEnd.getFullYear(), todayEnd.getMonth(), todayEnd.getDate()).getTime()
/** 性别可选项 */
const GENDER_OPTIONS: { label: string, value: UserGender }[] = [
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
  { label: '其他', value: 'other' },
]

/** 时间戳 → YYYY-MM-DD(本地时区) */
function tsToDateString(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 生日选择器绑定的时间戳(已选则回填,否则定位到 30 岁) */
const birthdayTs = computed(() => {
  if (birthday.value) {
    const ts = new Date(`${birthday.value}T00:00:00`).getTime()
    return Number.isNaN(ts) ? BIRTHDAY_MAX_DATE : ts
  }
  return BIRTHDAY_MAX_DATE - 86400000 * 365 * 30
})

/** 打开生日选择器 */
function openBirthdayPicker() {
  if (saving.value)
    return
  birthdayPickerVisible.value = true
}

/** 生日确认:写回 YYYY-MM-DD 并关闭选择器 */
function handleBirthdayConfirm({ value }: { value: number | string }) {
  const ts = typeof value === 'number' ? value : Number(value)
  birthday.value = tsToDateString(ts)
  birthdayPickerVisible.value = false
}

/** 选择性别(再次点击同一项取消选择) */
function handleGenderSelect(value: UserGender) {
  if (saving.value)
    return
  gender.value = gender.value === value ? null : value
}

/** 从 tempFilePath 推断文件名(裁剪后无扩展名时兜底) */
function deriveFilenameFromPath(p: string): string {
  if (!p)
    return 'avatar.jpg'
  const seg = p.split('/').pop() ?? 'avatar.jpg'
  return seg.includes('.') ? seg : `${seg}.jpg`
}

// #ifndef MP-WEIXIN
/** 选择图片 → 打开 1:1 裁剪弹层(非微信端) */
async function handlePickAvatar() {
  if (saving.value)
    return
  try {
    const chosen = await chooseImages(1, { prefix: 'avatar' })
    const src = chosen[0]?.file
    if (!src || typeof src !== 'string') {
      uni.showToast({ title: '无法获取所选图片,请重试', icon: 'none' })
      return
    }
    cropSrc.value = src
    cropVisible.value = true
  }
  catch (e) {
    uni.showToast({ title: `选择图片失败: ${(e as Error).message}`, icon: 'none' })
  }
}

/** 裁剪确认:暂存裁剪产物用于预览,保存时再上传(非微信端) */
function handleCropConfirm(result: { tempFilePath: string }) {
  cropVisible.value = false
  const tempPath = result.tempFilePath
  if (!tempPath)
    return
  localAvatarPath.value = tempPath
}
// #endif

// #ifdef MP-WEIXIN
/** 微信小程序:chooseAvatar 选择头像(返回已裁剪的临时路径) */
function handleChooseAvatar(e: { detail: ChooseAvatarDetail }) {
  // saving=true 时(上传/保存进行中)禁止替换本地头像,避免覆盖导致最终落库与预览不一致
  if (saving.value)
    return
  const avatarUrl = e.detail.avatarUrl
  if (!avatarUrl)
    return
  localAvatarPath.value = avatarUrl
}
// #endif

/** 移除已选头像 */
function handleRemoveAvatar() {
  if (saving.value)
    return
  localAvatarPath.value = ''
}

/** 昵称输入(受控 + 长度截断) */
function handleNameInput(e: InputEvent) {
  name.value = String(e.detail.value || '').slice(0, NAME_MAX)
}

/** 保存:上传头像(可选)后,提交昵称/头像/性别/生日并同步到用户 store */
async function handleConfirm() {
  const trimmed = name.value.trim()
  if (!trimmed) {
    uni.showToast({ title: '请输入昵称', icon: 'none' })
    return
  }
  if (saving.value)
    return
  saving.value = true
  try {
    let finalAvatarUrl: string | undefined
    if (localAvatarPath.value) {
      const { url } = await uploadFileToCos({
        file: localAvatarPath.value,
        name: deriveFilenameFromPath(localAvatarPath.value),
        purpose: 'avatar',
      })
      finalAvatarUrl = url
    }
    const patch: {
      name: string
      avatarUrl?: string
      gender?: UserGender
      birthday?: string
    } = { name: trimmed }
    if (finalAvatarUrl) {
      patch.avatarUrl = finalAvatarUrl
    }
    // 性别/生日仅在用户选择后提交,未选择时不覆盖后端已有值
    if (gender.value) {
      patch.gender = gender.value
    }
    if (birthday.value) {
      patch.birthday = birthday.value
    }
    const res = await updateMyProfile(patch)
    userStore.updateUser(fromUserDTO(res))
    emit('success')
    // 保持 saving=true,防重复提交,待父组件关闭弹窗
  }
  catch (e) {
    saving.value = false
    console.error(e)
    uni.showToast({ title: '保存失败', icon: 'none' })
  }
}

/** 取消 */
function handleCancel() {
  if (saving.value)
    return
  emit('cancel')
  emit('update:modelValue', false)
}

/** wd-popup 内部发起的显隐变化(如点遮罩关闭)统一走取消逻辑 */
function handleVisibleChange(v: boolean) {
  if (v) {
    emit('update:modelValue', true)
    return
  }
  handleCancel()
}
</script>

<template>
  <wd-popup
    :model-value="modelValue"
    position="bottom"
    round
    :safe-area-inset-bottom="true"
    :close-on-click-modal="closeOnClickModal ?? false"
    :z-index="2000"
    custom-class="profile-setup-popup"
    @update:model-value="handleVisibleChange"
  >
    <view class="px-6 pb-6 pt-6">
      <!-- 标题 -->
      <view class="flex flex-col items-center">
        <text class="text-lg text-[#1a1a1a] font-semibold">
          完善资料
        </text>
        <text class="mt-1 text-sm text-[#999]">
          补充昵称、头像等资料,让邻居更容易认识你
        </text>
      </view>

      <!-- 头像选择(可选) -->
      <view class="mt-5 flex flex-col items-center">
        <!-- 微信小程序:原生 button + open-type="chooseAvatar" -->
        <!-- #ifdef MP-WEIXIN -->
        <button
          class="profile-avatar-btn relative h-20 w-20 m-0 flex items-center justify-center overflow-hidden rounded-full border-2 border-[#e8e8e8] bg-[#f5f6f7] p-0 leading-none"
          :disabled="saving"
          open-type="chooseAvatar"
          @chooseavatar="handleChooseAvatar"
        >
          <AvatarPreview :src="localAvatarPath" :saving="saving" />
        </button>
        <!-- #endif -->

        <!-- 其他端:点击选图后 1:1 裁剪 -->
        <!-- #ifndef MP-WEIXIN -->
        <view
          class="relative h-20 w-20 flex items-center justify-center overflow-hidden rounded-full border-2 border-[#e8e8e8] bg-[#f5f6f7] active:scale-[0.96]"
          @click="handlePickAvatar"
        >
          <AvatarPreview :src="localAvatarPath" :saving="saving" />
        </view>
        <!-- #endif -->

        <text class="mt-2 text-xs text-[#999]">
          点击上传头像(可选)
        </text>
        <text
          v-if="localAvatarPath"
          class="mt-1 text-xs text-[#018d71]"
          @click="handleRemoveAvatar"
        >
          移除头像
        </text>
      </view>

      <!-- 昵称输入 -->
      <view class="mt-4 h-12 flex items-center rounded-lg border border-[#e8e8e8] bg-[#fafafa] px-3">
        <input
          :value="name"
          class="flex-1 text-base"
          <!-- #ifdef MP-WEIXIN -->
          type="nickname"
          <!-- #endif -->
          :maxlength="NAME_MAX"
          placeholder="请输入昵称"
          placeholder-class="text-[#bbb]"
          @input="handleNameInput"
        >
      </view>

      <!-- 性别选择(可选) -->
      <view class="mt-4">
        <text class="text-sm text-[#666]">
          性别(可选)
        </text>
        <view class="mt-2 flex gap-3">
          <view
            v-for="opt in GENDER_OPTIONS"
            :key="opt.value"
            class="h-9 flex flex-1 items-center justify-center rounded-lg border text-sm"
            :class="gender === opt.value ? 'border-[#018d71] bg-[#e8f5f1] text-[#018d71]' : 'border-[#e8e8e8] bg-[#fafafa] text-[#666]'"
            @click="handleGenderSelect(opt.value)"
          >
            {{ opt.label }}
          </view>
        </view>
      </view>

      <!-- 生日选择(可选) -->
      <view class="mt-4">
        <text class="text-sm text-[#666]">
          生日(可选)
        </text>
        <view
          class="mt-2 h-12 flex items-center justify-between rounded-lg border border-[#e8e8e8] bg-[#fafafa] px-3"
          @click="openBirthdayPicker"
        >
          <text :class="birthday ? 'text-base text-[#333]' : 'text-base text-[#bbb]'">
            {{ birthday || '请选择生日' }}
          </text>
          <text v-if="birthday" class="text-xs text-[#018d71]">
            重选
          </text>
        </view>
      </view>

      <!-- 操作按钮 -->
      <view class="mt-6 grid grid-cols-2 gap-3">
        <wd-button block @click="handleCancel">
          稍后再说
        </wd-button>
        <wd-button block type="primary" :loading="saving" @click="handleConfirm">
          保存
        </wd-button>
      </view>
    </view>

    <!-- 头像裁剪弹层(1:1;微信端用 chooseAvatar 无需裁剪) -->
    <!-- #ifndef MP-WEIXIN -->
    <!-- wd-img-cropper 无 z-index prop,层级只能走 CSS 变量(默认 1,嵌套在 popup 内已足够) -->
    <wd-img-cropper
      v-model="cropVisible"
      :img-src="cropSrc"
      aspect-ratio="1:1"
      file-type="jpg"
      :quality="0.9"
      :export-scale="2"
      custom-style="--wot-img-cropper-z-index: 2100"
      @confirm="handleCropConfirm"
    />
    <!-- #endif -->

    <!-- 生日选择器:z-index 需高于包裹它的 popup(2000);root-portal 渲染到根,
         避免被外层 popup 的 mask 遮挡或事件拦截 -->
    <wd-datetime-picker
      :visible="birthdayPickerVisible"
      :model-value="birthdayTs"
      type="date"
      title="选择生日"
      :min-date="BIRTHDAY_MIN_DATE"
      :max-date="BIRTHDAY_MAX_DATE"
      :z-index="2100"
      :root-portal="true"
      @confirm="handleBirthdayConfirm"
      @update:visible="birthdayPickerVisible = $event"
    />
  </wd-popup>
</template>

<style scoped>
/* wd-popup 提升层级,确保覆盖登录页内容 */
:global(.profile-setup-popup) {
  z-index: 2000 !important;
}
</style>

<style>
/* 微信小程序原生 button(open-type="chooseAvatar")默认样式重置:
   去掉按钮自带边框,避免与圆角头像边框重叠 */
.profile-avatar-btn::after {
  border: none;
}
</style>
