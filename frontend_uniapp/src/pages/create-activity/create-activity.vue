<script lang="ts" setup>
/**
 * 活动发布 / 编辑表单页(顶层独立资源,与圈子解耦)。
 *
 * - 路径参数:activityId(编辑态必填,新建态无)。
 * - 仅 TEACHER / ADMIN 可发布;非教师/管理员前端引导先完成教师认证,后端兜底 403。
 * - 字段:标题、活动介绍(纯文本 textarea)、轮播图片、活动起始时间、报名截止时间、联系人电话。
 * - 校验:报名截止 < 活动起始;时间用 wd-datetime-picker 选。
 */
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import {
  cancelActivity,
  createActivity,
  getActivity,
  updateActivity,
} from '@/api/activities'
import { uploadFileToCos } from '@/api/upload'
import { chooseImages } from '@/utils/chooseImage'
import { stripHtmlTags } from '@/utils/format'
import { useDialog } from '@wot-ui/ui/components/wd-dialog'
import { useUserStore } from '@/store/user'
import { LOGIN_PAGE } from '@/router/config'
import type { ActivityDTO } from '@/types'

/** 轮播图片最大数量 */
const COVER_IMAGES_MAX = 9

const dialog = useDialog()
const userStore = useUserStore()

const activityId = ref<string | null>(null)
const isEdit = ref(false)
const loadingDetail = ref(false)
const submitting = ref(false)

// 表单字段
const title = ref('')
const description = ref('')
const startTimeTs = ref<number>(Date.now())
const deadlineTs = ref<number>(Date.now())
const contactPhone = ref('')
const coverImages = ref<string[]>([])
const uploadingCover = ref(false)

// datetime-picker 控制
const pickerField = ref<'start' | 'deadline' | null>(null)
const pickerVisible = ref(false)

const startTimeText = ref('')
const deadlineText = ref('')
const PHONE_RE = /^1[3-9]\d{9}$|^0\d{2,3}-?\d{7,8}$/

function formatTs(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function syncTimeText() {
  startTimeText.value = formatTs(startTimeTs.value)
  deadlineText.value = formatTs(deadlineTs.value)
}

/** 当前选择器绑定的时间戳(只读,confirm 回调写回对应 ref) */
const pickerValue = computed(() =>
  pickerField.value === 'start' ? startTimeTs.value : deadlineTs.value,
)

function openPicker(field: 'start' | 'deadline') {
  pickerField.value = field
  pickerVisible.value = true
}

function handlePickerConfirm({ value }: { value: number | string }) {
  const ts = typeof value === 'number' ? value : Number(value)
  if (pickerField.value === 'start')
    startTimeTs.value = ts
  else
    deadlineTs.value = ts
  syncTimeText()
  pickerVisible.value = false
}

// ====== 加载编辑态 ======
async function loadDetail() {
  if (!activityId.value)
    return
  loadingDetail.value = true
  try {
    const res = await getActivity(activityId.value)
    const a = res as ActivityDTO
    title.value = a.title
    // 兼容历史富文本 HTML 数据:去除标签后回填纯文本
    description.value = stripHtmlTags(a.description || '')
    startTimeTs.value = new Date(a.startTime).getTime()
    deadlineTs.value = new Date(a.registrationDeadline).getTime()
    contactPhone.value = a.contactPhone ?? ''
    coverImages.value = a.coverImages || []
    isEdit.value = true
    syncTimeText()
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
  }
  finally {
    loadingDetail.value = false
  }
}

onLoad((options) => {
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: LOGIN_PAGE })
    return
  }
  activityId.value = (options as any)?.activityId || null
  // 新建模式:仅 TEACHER / ADMIN 可创建活动,其余角色先完成教师认证
  if (!activityId.value && !['TEACHER', 'ADMIN'].includes(userStore.userInfo?.role ?? '')) {
    uni.showToast({ title: '请先完成教师认证', icon: 'none' })
    uni.redirectTo({ url: '/pages/teacher-certification/teacher-certification' })
    return
  }
  if (activityId.value) {
    void loadDetail()
  }
  else {
    syncTimeText()
  }
})

// ====== 封面上传 ======
async function handlePickCover() {
  if (uploadingCover.value)
    return
  const remaining = COVER_IMAGES_MAX - coverImages.value.length
  if (remaining <= 0) {
    uni.showToast({ title: `最多 ${COVER_IMAGES_MAX} 张`, icon: 'none' })
    return
  }
  try {
    const chosen = await chooseImages(remaining, { prefix: 'cover' })
    if (chosen.length === 0)
      return
    uploadingCover.value = true
    const uploaded: string[] = []
    for (const { file, name } of chosen) {
      try {
        const result = await uploadFileToCos({ file, name, purpose: 'generic' })
        uploaded.push(result.url)
      }
      catch (e) {
        console.warn('[create-activity] cover upload failed:', e)
      }
    }
    if (uploaded.length === 0) {
      uni.showToast({ title: '上传失败', icon: 'none' })
      return
    }
    coverImages.value = [...coverImages.value, ...uploaded].slice(0, COVER_IMAGES_MAX)
    uni.showToast({ title: `已上传 ${uploaded.length} 张`, icon: 'success' })
  }
  catch (e) {
    const err = e as Error & { errMsg?: string }
    uni.showToast({ title: err?.message || '选择失败', icon: 'none' })
  }
  finally {
    uploadingCover.value = false
  }
}

function handleRemoveCover(idx: number) {
  coverImages.value = coverImages.value.filter((_, i) => i !== idx)
}

// ====== 校验 + 提交 ======
function validate(): string | null {
  if (!title.value.trim())
    return '请填写活动标题'
  if (!description.value.trim())
    return '请填写活动介绍'
  if (!PHONE_RE.test(contactPhone.value.trim()))
    return '联系电话格式不正确'
  if (deadlineTs.value >= startTimeTs.value)
    return '报名截止时间必须早于活动起始时间'
  return null
}

async function handleSubmit() {
  const err = validate()
  if (err) {
    uni.showToast({ title: err, icon: 'none' })
    return
  }
  submitting.value = true
  const payload = {
    title: title.value.trim(),
    description: description.value,
    startTime: new Date(startTimeTs.value).toISOString(),
    registrationDeadline: new Date(deadlineTs.value).toISOString(),
    contactPhone: contactPhone.value.trim(),
    coverImages: coverImages.value,
  }
  try {
    if (isEdit.value && activityId.value) {
      await updateActivity(activityId.value, payload)
      uni.showToast({ title: '已保存', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 600)
    }
    else {
      const created = await createActivity(payload)
      uni.showToast({ title: '发布成功', icon: 'success' })
      // 发布成功后跳转活动详情页
      setTimeout(() => {
        uni.redirectTo({
          url: `/pages/activity/activity?activityId=${created.id}`,
        })
      }, 600)
    }
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '提交失败', icon: 'none' })
  }
  finally {
    submitting.value = false
  }
}

// ====== 取消活动(编辑态) ======
async function handleCancel() {
  if (!isEdit.value || !activityId.value)
    return
  const res = await dialog.confirm({
    title: '取消活动',
    msg: '取消后该活动将不再对外展示,确定吗?',
  })
  if (res.action !== 'confirm')
    return
  try {
    await cancelActivity(activityId.value)
    uni.showToast({ title: '已取消', icon: 'success' })
    setTimeout(() => uni.navigateBack(), 600)
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '操作失败', icon: 'none' })
  }
}
</script>

<template>
  <view class="min-h-screen bg-[#f6f8fa] px-4 py-4">
    <view v-if="loadingDetail" class="flex items-center justify-center py-20">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <view v-else class="flex flex-col gap-3">
      <!-- 标题 -->
      <view class="rounded-2xl bg-white px-4 py-3">
        <text class="mb-2 block text-sm text-[#666]">
          活动标题
        </text>
        <input
          v-model="title" class="h-10 text-base" maxlength="100"
          placeholder="请输入活动标题" placeholder-class="text-[#bbb]"
        >
      </view>

      <!-- 活动介绍(纯文本) -->
      <view class="rounded-2xl bg-white px-4 py-3">
        <text class="mb-2 block text-sm text-[#666]">
          活动介绍
        </text>
        <textarea
          v-model="description"
          class="mt-2 h-32 rounded-lg bg-[#f5f6f7] p-3 text-sm leading-6"
          :maxlength="50000"
          placeholder="介绍活动内容、流程、注意事项等"
          placeholder-class="text-[#bbb]"
        />
      </view>

      <!-- 轮播图片 -->
      <view class="rounded-2xl bg-white px-4 py-3">
        <view class="flex items-center justify-between">
          <text class="text-sm text-[#666]">轮播图片</text>
          <text class="text-xs text-[#999]">{{ coverImages.length }}/{{ COVER_IMAGES_MAX }}</text>
        </view>
        <text class="mt-1 block text-xs text-[#999]">
          可上传 0-9 张图片,首张为默认封面
        </text>
        <view class="mt-3 flex flex-wrap gap-2">
          <view
            v-for="(url, idx) in coverImages"
            :key="`${url}-${idx}`"
            class="relative h-20 w-20 overflow-hidden rounded-lg"
          >
            <image :src="url" class="h-full w-full" mode="aspectFill" />
            <view v-if="idx === 0" class="absolute left-0 top-0 rounded-br-lg bg-[#018d71] px-1.5 py-0.5">
              <text class="text-[10px] text-white">封面</text>
            </view>
            <view
              class="absolute right-0 top-0 h-5 w-5 flex items-center justify-center rounded-bl-lg bg-black/50"
              @click="handleRemoveCover(idx)"
            >
              <text class="text-xs text-white">×</text>
            </view>
          </view>
          <view
            v-if="coverImages.length < COVER_IMAGES_MAX"
            class="h-20 w-20 flex flex-col items-center justify-center border border-[#e0e0e0] rounded-lg border-dashed bg-[#fafafa]"
            @click="handlePickCover"
          >
            <text class="text-2xl text-[#ccc]">+</text>
            <text class="mt-0.5 text-xs text-[#999]">{{ uploadingCover ? '上传中' : '添加' }}</text>
          </view>
        </view>
      </view>

      <!-- 活动起始时间 -->
      <view
        class="flex items-center justify-between rounded-2xl bg-white px-4 py-3 active:scale-[0.99]"
        @click="openPicker('start')"
      >
        <text class="text-sm text-[#666]">
          活动起始时间
        </text>
        <text class="text-base" :class="startTimeText ? 'text-[#333]' : 'text-[#bbb]'">
          {{ startTimeText || '请选择' }}
        </text>
      </view>

      <!-- 报名截止时间 -->
      <view
        class="flex items-center justify-between rounded-2xl bg-white px-4 py-3 active:scale-[0.99]"
        @click="openPicker('deadline')"
      >
        <text class="text-sm text-[#666]">
          报名截止时间
        </text>
        <text class="text-base" :class="deadlineText ? 'text-[#333]' : 'text-[#bbb]'">
          {{ deadlineText || '请选择' }}
        </text>
      </view>

      <!-- 联系人电话 -->
      <view class="rounded-2xl bg-white px-4 py-3">
        <text class="mb-2 block text-sm text-[#666]">
          联系人电话(选填)
        </text>
        <input
          v-model="contactPhone" class="h-10 text-base" maxlength="20" type="number"
          placeholder="如 13800138000" placeholder-class="text-[#bbb]"
        >
      </view>

      <!-- 操作 -->
      <view class="flex gap-3 pt-2">
        <button
          v-if="isEdit"
          class="flex-1 rounded-full bg-[#fdecec] py-3 text-base text-[#e54d42] active:scale-95"
          @click="handleCancel"
        >
          取消活动
        </button>
        <button
          class="flex-1 rounded-full bg-[#018d71] py-3 text-base text-white active:scale-95 disabled:opacity-50"
          :disabled="submitting" :loading="submitting" @click="handleSubmit"
        >
          {{ isEdit ? '保存' : '发布活动' }}
        </button>
      </view>
    </view>

    <!-- 时间选择器 -->
    <wd-datetime-picker
      :visible="pickerVisible" :model-value="pickerValue"
      type="datetime" title="选择时间" :min-date="Date.now() - 86400000 * 365 * 10"
      @confirm="handlePickerConfirm" @update:visible="pickerVisible = $event"
    />
  </view>
</template>
