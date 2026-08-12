<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useUserStore } from '@/store/user'
import { createCircle, getCircle, updateCircle } from '@/api/circles'
import { uploadFile } from '@/api/upload'
import { LOGIN_PAGE } from '@/router/config'
import TagSelectorPopup from '@/components/TagSelectorPopup/TagSelectorPopup.vue'
import type { CircleDetailDTO, UpdateCircleInput } from '@/types'

definePage({
  style: {
    navigationBarTitleText: '创建圈子',
  },
})

/** 标题最大长度 */
const TITLE_MAX = 50
/** 描述最大长度 */
const DESCRIPTION_MAX = 500
/** 标签最大数量 */
const TAGS_MAX = 5
/** 人数上限范围 */
const MAX_MEMBERS_MIN = 1
const MAX_MEMBERS_MAX = 999
/** 手机号校验(11 位) */
const PHONE_RE = /^1\d{10}$/
/** 轮播图片最大数量 */
const COVER_IMAGES_MAX = 9

const userStore = useUserStore()

// 路由参数
const editId = ref<string>('')
const isEdit = computed(() => !!editId.value)
const loading = ref(false)

// 表单状态
const title = ref('')
const tags = ref<string[]>([])
const description = ref('')
const address = ref('')
const latitude = ref<number | null>(null)
const longitude = ref<number | null>(null)
const contactPhone = ref('')
const wechat = ref('')
const activityTime = ref('')
const maxMembers = ref('')
const submitting = ref(false)
const pickerVisible = ref(false)
const coverImages = ref<string[]>([])
const uploadingCover = ref(false)
const tagSelectorOpen = ref(false)

/** 打开兴趣标签选择弹窗 */
function handleOpenTagSelector() {
  tagSelectorOpen.value = true
}

/** 弹窗确认:更新圈子标签 */
function handleTagConfirm(newTags: string[]) {
  tags.value = newTags
}

let hasFetched = false

/** 拉取圈子详情用于编辑预填 */
async function fetchForEdit(id: string) {
  loading.value = true
  try {
    const data: CircleDetailDTO = await getCircle(id)
    title.value = data.title || ''
    tags.value = data.tags || []
    description.value = data.description || ''
    address.value = data.address || ''
    latitude.value = data.latitude
    longitude.value = data.longitude
    contactPhone.value = data.contactPhone || ''
    wechat.value =data.wechat || ''
    activityTime.value = data.activityTime || ''
    maxMembers.value = data.maxMembers != null ? String(data.maxMembers) : ''
    coverImages.value = data.coverImages || []
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

onShow(() => {
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: LOGIN_PAGE })
    return
  }
  // 取路由参数
  const pages = getCurrentPages()
  const current = pages[pages.length - 1] as any
  editId.value = current?.options?.id || current?.$page?.options?.id || ''
  // 新建模式:仅 TEACHER / ADMIN 可创建圈子,其余角色先完成教师认证
  if (!isEdit.value && !['TEACHER', 'ADMIN'].includes(userStore.userInfo?.role ?? '')) {
    uni.showToast({ title: '请先完成教师认证', icon: 'none' })
    uni.navigateTo({ url: '/pages/teacher-certification/teacher-certification' })
    return
  }
  if (isEdit.value && !hasFetched) {
    hasFetched = true
    void fetchForEdit(editId.value)
  }
})

// 表单校验
const trimmedTitle = computed(() => title.value.trim())
const titleValid = computed(() => trimmedTitle.value.length >= 1 && trimmedTitle.value.length <= TITLE_MAX)
const tagsValid = computed(() => tags.value.length >= 1 && tags.value.length <= TAGS_MAX)
const locationValid = computed(() => !!address.value && latitude.value !== null && longitude.value !== null)
const descriptionValid = computed(() => description.value.trim().length >= 1 && description.value.trim().length <= DESCRIPTION_MAX)
const hasContact = computed(() => contactPhone.value.trim() !== '' || wechat.value.trim() !== '')
const phoneValid = computed(() => contactPhone.value.trim() === '' || PHONE_RE.test(contactPhone.value.trim()))
const maxMembersNum = computed(() => (maxMembers.value === '' ? null : Number(maxMembers.value)))
const maxMembersValid = computed(() =>
  maxMembers.value === ''
  || (!Number.isNaN(maxMembersNum.value as number)
    && (maxMembersNum.value as number) >= MAX_MEMBERS_MIN
    && (maxMembersNum.value as number) <= MAX_MEMBERS_MAX))
const canSubmit = computed(() =>
  titleValid.value && descriptionValid.value && tagsValid.value && locationValid.value
  && hasContact.value && phoneValid.value && maxMembersValid.value && !submitting.value)

const formErr = computed((): string => {
  if (!hasContact.value) return '请至少填写一种联系方式'
  if (!phoneValid.value) return '手机号格式不正确(11 位)'
  if (!maxMembersValid.value) return `人数上限范围 ${MAX_MEMBERS_MIN}-${MAX_MEMBERS_MAX}`
  return ''
})

// 选择地点
async function handleChooseLocation() {
  // #ifdef H5
  pickerVisible.value = true
  return
  // #endif
  // #ifndef H5
  try {
    const res = await uni.chooseLocation({})
    latitude.value = res.latitude
    longitude.value = res.longitude
    address.value = res.address || res.name || '已选择位置'
  }
  catch (e) {
    const err = e as Error & { errMsg?: string }
    if (err?.errMsg && /cancel/i.test(err.errMsg)) return
    uni.showToast({ title: err?.message || '定位失败', icon: 'none' })
  }
  // #endif
}

function handlePickerConfirm(loc: { latitude: number; longitude: number; address: string }) {
  latitude.value = loc.latitude
  longitude.value = loc.longitude
  address.value = loc.address
  pickerVisible.value = false
}

// 上传轮播图片
async function handlePickCover() {
  if (uploadingCover.value) return
  const remaining = COVER_IMAGES_MAX - coverImages.value.length
  if (remaining <= 0) {
    uni.showToast({ title: `最多 ${COVER_IMAGES_MAX} 张`, icon: 'none' })
    return
  }
  try {
    const res = await uni.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      maxDuration: 60,
      camera: 'back',
    })
    if (!(res as any)?.tempFiles?.length) return
    uploadingCover.value = true
    const uploaded: string[] = []
    for (const f of (res as any).tempFiles) {
      try {
        const file: string | File = f.originalFileObj ?? f.tempFilePath
        const name = (f.originalFileObj && f.originalFileObj.name)
          || f.tempFilePath
          || `cover-${Date.now()}`
        const result = await uploadFile({ file, name, purpose: 'generic' })
        uploaded.push(result.url)
      }
      catch (e) {
        console.warn('[create-circle] cover upload failed:', e)
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
    if (err?.errMsg && /cancel/i.test(err.errMsg)) return
    uni.showToast({ title: err?.message || '选择失败', icon: 'none' })
  }
  finally {
    uploadingCover.value = false
  }
}

function handleRemoveCover(idx: number) {
  coverImages.value = coverImages.value.filter((_, i) => i !== idx)
}

// 提交
async function handleSubmit() {
  if (!canSubmit.value) return
  submitting.value = true
  try {
    const lat = latitude.value as number
    const lng = longitude.value as number
    const finalMax = maxMembers.value === '' ? undefined : Number(maxMembers.value)

    if (isEdit.value) {
      const patch: UpdateCircleInput = {
        title: trimmedTitle.value,
        tags: tags.value,
        description: description.value.trim(),
        contactPhone: contactPhone.value.trim() || undefined,
        wechat: wechat.value.trim() || undefined,
        activityTime: activityTime.value.trim() || undefined,
        maxMembers: finalMax,
        coverImages: coverImages.value,
      }
      await updateCircle(editId.value, patch)
      uni.redirectTo({ url: `/pages/circle/circle?id=${editId.value}` })
    }
    else {
      const res = await createCircle({
        title: trimmedTitle.value,
        tags: tags.value,
        description: description.value.trim(),
        latitude: lat,
        longitude: lng,
        address: address.value || '已定位',
        contactPhone: contactPhone.value.trim() || undefined,
        wechat: wechat.value.trim() || undefined,
        activityTime: activityTime.value.trim() || undefined,
        maxMembers: finalMax,
        coverImages: coverImages.value,
      })
      uni.redirectTo({ url: `/pages/circle/circle?id=${res.circleId}` })
    }
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '提交失败', icon: 'none' })
  }
  finally {
    submitting.value = false
  }
}

const titleCount = computed(() => `${title.value.length}/${TITLE_MAX}`)
const descCount = computed(() => `${description.value.length}/${DESCRIPTION_MAX}`)
const tagsCountText = computed(() => `${tags.value.length}/${TAGS_MAX}`)
</script>

<template>
  <view class="flex min-h-screen flex-col bg-[#f7f8fa] pb-40">
    <view v-if="loading && isEdit" class="flex flex-col items-center pt-32">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <template v-else>
      <scroll-view scroll-y class="flex-1">
        <!-- 1. 标题 -->
        <view class="mx-4 mt-4 rounded-2xl bg-white p-4">
          <view class="flex items-center justify-between">
            <text class="text-sm font-medium text-[#333]">
              标题 <text class="text-[#f53f3f]">*</text>
            </text>
            <text class="text-xs text-[#999]">{{ titleCount }}</text>
          </view>
          <input
            v-model="title"
            class="mt-2 h-10 w-full rounded-lg bg-[#f5f6f7] px-3 text-sm"
            :maxlength="TITLE_MAX"
            placeholder="1-50 字符,如:陈氏太极拳晨练班"
            placeholder-class="text-[#bbb]"
          />
        </view>

        <!-- 2. 兴趣标签 -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
          <view class="flex items-center justify-between">
            <text class="text-sm font-medium text-[#333]">
              兴趣标签 <text class="text-[#f53f3f]">*</text>
            </text>
            <text class="text-xs text-[#999]">{{ tagsCountText }}</text>
          </view>
          <view
            class="mt-2 flex min-h-11 items-center justify-between rounded-lg bg-[#f5f6f7] p-3"
            @click="handleOpenTagSelector"
          >
            <text v-if="tags.length === 0" class="text-sm text-[#bbb]">
              点击选择兴趣标签
            </text>
            <view v-else class="flex flex-1 flex-wrap gap-1.5">
              <text
                v-for="(tag, idx) in tags"
                :key="`${tag}-${idx}`"
                class="rounded bg-[#e6f6f1] px-2 py-0.5 text-xs text-[#018d71]"
              >
                {{ tag }}
              </text>
            </view>
            <text class="ml-2 shrink-0 text-sm text-[#018d71]">编辑 ›</text>
          </view>
        </view>

        <!-- 3. 描述 -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
          <view class="flex items-center justify-between">
            <text class="text-sm font-medium text-[#333]">
              圈子介绍 <text class="text-[#f53f3f]">*</text>
            </text>
            <text class="text-xs text-[#999]">{{ descCount }}</text>
          </view>
          <textarea
            v-model="description"
            class="mt-2 h-32 rounded-lg bg-[#f5f6f7] p-3 text-sm leading-6"
            :maxlength="DESCRIPTION_MAX"
            placeholder="1-500 字符,介绍圈子内容、目标人群等"
            placeholder-class="text-[#bbb]"
          />
        </view>

        <!-- 3.5 轮播图片 -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
          <view class="flex items-center justify-between">
            <text class="text-sm font-medium text-[#333]">轮播图片</text>
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
                class="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-lg bg-black/50"
                @click="handleRemoveCover(idx)"
              >
                <text class="text-xs text-white">×</text>
              </view>
            </view>
            <view
              v-if="coverImages.length < COVER_IMAGES_MAX"
              class="flex h-20 w-20 flex-col items-center justify-center rounded-lg border border-dashed border-[#e0e0e0] bg-[#fafafa]"
              @click="handlePickCover"
            >
              <text class="text-2xl text-[#ccc]">+</text>
              <text class="mt-0.5 text-xs text-[#999]">{{ uploadingCover ? '上传中' : '添加' }}</text>
            </view>
          </view>
        </view>

        <!-- 4. 活动地点 -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
          <text class="text-sm font-medium text-[#333]">
            活动地点 <text class="text-[#f53f3f]">*</text>
          </text>
          <view class="mt-2 flex items-center justify-between rounded-lg bg-[#f5f6f7] p-3" @click="handleChooseLocation">
            <text :class="address ? 'text-sm text-[#333]' : 'text-sm text-[#bbb]'">
              {{ address || '点击选择活动地点' }}
            </text>
            <text class="text-sm text-[#018d71]">选择 ›</text>
          </view>
        </view>

        <!-- 5. 联系电话 -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
          <text class="text-sm font-medium text-[#333]">联系电话</text>
          <input
            v-model="contactPhone"
            class="mt-2 h-10 rounded-lg bg-[#f5f6f7] px-3 text-sm"
            type="number"
            :maxlength="11"
            placeholder="11 位手机号(与微信号至少填一个)"
            placeholder-class="text-[#bbb]"
          />
        </view>

        <!-- 6. 微信号 -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
          <text class="text-sm font-medium text-[#333]">微信号</text>
          <input
            v-model="wechat"
            class="mt-2 h-10 rounded-lg bg-[#f5f6f7] px-3 text-sm"
            placeholder="微信号(与联系电话至少填一个)"
            placeholder-class="text-[#bbb]"
          />
        </view>

        <!-- 7. 活动时间 -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
          <text class="text-sm font-medium text-[#333]">活动时间</text>
          <input
            v-model="activityTime"
            class="mt-2 h-10 rounded-lg bg-[#f5f6f7] px-3 text-sm"
            placeholder="如:每周六上午 9:00-11:00"
            placeholder-class="text-[#bbb]"
          />
        </view>

        <!-- 8. 人数上限 -->
        <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
          <text class="text-sm font-medium text-[#333]">人数上限</text>
          <input
            v-model="maxMembers"
            class="mt-2 h-10 rounded-lg bg-[#f5f6f7] px-3 text-sm"
            type="number"
            :placeholder="`可选,范围 ${MAX_MEMBERS_MIN}-${MAX_MEMBERS_MAX}`"
            placeholder-class="text-[#bbb]"
          />
        </view>

        <!-- 审核提示 -->
        <text v-if="!isEdit" class="mx-4 mt-3 block text-xs text-[#999]">
          提交后需管理员审核通过,圈子才能上线
        </text>
      </scroll-view>

      <!-- 底部提交按钮 -->
      <view class="border-t border-[#f0f0f0] bg-white px-4 py-3 pb-safe">
        <wd-button
          block
          :loading="submitting"
          :disabled="!canSubmit"
          @click="handleSubmit"
        >
          {{ isEdit ? '保存修改' : '创建圈子' }}
        </wd-button>
        <text v-if="formErr" class="mt-2 block text-center text-xs text-[#f53f3f]">
          {{ formErr }}
        </text>
      </view>

      <!-- H5 地图选点 -->
      <!-- #ifdef H5 -->
      <H5LocationPicker
        :visible="pickerVisible"
        :initial-lat="latitude"
        :initial-lng="longitude"
        @confirm="handlePickerConfirm"
        @close="pickerVisible = false"
      />
      <!-- #endif -->

      <!-- 兴趣标签选择弹窗(添加/移除均在此弹窗中完成) -->
      <TagSelectorPopup
        v-model="tagSelectorOpen"
        :max="TAGS_MAX"
        :initial-tags="tags"
        @confirm="handleTagConfirm"
      />
    </template>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
