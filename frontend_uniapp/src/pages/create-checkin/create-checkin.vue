<script lang="ts" setup>
/**
 * 发布打卡。
 *
 * - 文字可选(≤1000 字);
 * - 媒体二选一:最多 9 张图片 或 1 个视频(选中一类会清空另一类);
 * - 兴趣标签默认带入「我的兴趣」全部标签,可逐条删除或通过弹窗增删(≤10);
 * - 可选关联一个「我关注的圈子」(不关联则只进打卡广场与我的打卡);
 * - 媒体在选择时即直传 COS,提交只落 URL。
 */
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { useUserStore } from '@/store/user'
import { getMyProfile } from '@/api/auth'
import { createCheckin } from '@/api/checkins'
import { getFollowedCircles } from '@/api/circles'
import { uploadFileToCos } from '@/api/upload'
import { chooseImages } from '@/utils/chooseImage'
import { chooseVideo } from '@/utils/chooseVideo'
import TagSelectorPopup from '@/components/TagSelectorPopup/TagSelectorPopup.vue'
import type { FollowedCircleDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '发布打卡',
  },
  excludeLoginPath: false,
})

/** 正文最大长度 */
const CONTENT_MAX = 1000
/** 图片最大数量 */
const IMAGES_MAX = 9
/** 兴趣标签最大数量(与后端一致) */
const TAGS_MAX = 10

const userStore = useUserStore()

const content = ref('')
/** 已上传的图片 URL 列表(0-9) */
const images = ref<string[]>([])
/** 已上传的视频 URL(与图片互斥) */
const videoUrl = ref('')
/** 兴趣标签(默认带入用户全部标签) */
const tags = ref<string[]>([])
/** 关联圈子 id(空字符串表示不关联) */
const circleId = ref('')
/** 我关注的圈子(可关联范围) */
const followedCircles = ref<FollowedCircleDTO[]>([])
const circlesLoading = ref(false)

const uploading = ref(false)
const submitting = ref(false)
const tagSelectorOpen = ref(false)

/** 媒体是否为空 */
const hasMedia = computed(() => images.value.length > 0 || !!videoUrl.value)
/** 正文是否已填 */
const hasContent = computed(() => content.value.trim().length > 0)
/** 是否可提交(文字与媒体至少一项) */
const canSubmit = computed(() => (hasContent.value || hasMedia.value) && !submitting.value && !uploading.value)
/** 字数统计文案 */
const contentCountText = computed(() => `${content.value.length}/${CONTENT_MAX}`)

/** 默认带入用户全部兴趣标签(最多 TAGS_MAX 个) */
function applyUserTags() {
  const info = userStore.userInfo
  if (info?.tags?.length)
    tags.value = [...info.tags].slice(0, TAGS_MAX)
}

/** 加载可关联的圈子(我关注的、非删除圈子) */
async function fetchFollowedCircles() {
  circlesLoading.value = true
  try {
    const res = await getFollowedCircles({ page: 1, pageSize: 50 })
    followedCircles.value = res.list
  }
  catch (e) {
    console.warn('[create-checkin] fetch followed circles failed:', e)
  }
  finally {
    circlesLoading.value = false
  }
}

onLoad(async (options) => {
  const presetCircleId = (options as { circleId?: string } | undefined)?.circleId ?? ''

  applyUserTags()
  await fetchFollowedCircles()

  // 仅当目标圈子在「我关注的圈子」内才预选(后端只允许打卡到已关注的圈子)
  if (presetCircleId && followedCircles.value.some(c => c.id === presetCircleId))
    circleId.value = presetCircleId

  // 用完整资料刷新一次标签(本地缓存可能不含最新兴趣)
  try {
    const profile = await getMyProfile()
    userStore.setProfile(profile)
    applyUserTags()
  }
  catch {
    // 拉取失败不阻塞,沿用本地资料
  }
})

/** 选择图片:与视频互斥,选完立即直传 COS */
async function handlePickImages() {
  if (uploading.value)
    return
  if (videoUrl.value) {
    uni.showToast({ title: '已选择视频,请先删除视频', icon: 'none' })
    return
  }
  const remaining = IMAGES_MAX - images.value.length
  if (remaining <= 0) {
    uni.showToast({ title: `最多 ${IMAGES_MAX} 张图片`, icon: 'none' })
    return
  }
  try {
    const chosen = await chooseImages(remaining, { prefix: 'checkin' })
    if (chosen.length === 0)
      return
    uploading.value = true
    uni.showLoading({ title: '上传中...', mask: true })
    const uploaded: string[] = []
    for (const { file, name } of chosen) {
      try {
        const result = await uploadFileToCos({ file, name, purpose: 'generic' })
        uploaded.push(result.url)
      }
      catch (e) {
        console.warn('[create-checkin] image upload failed:', e)
      }
    }
    if (uploaded.length === 0) {
      uni.showToast({ title: '图片上传失败', icon: 'none' })
      return
    }
    images.value = [...images.value, ...uploaded].slice(0, IMAGES_MAX)
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '选择图片失败', icon: 'none' })
  }
  finally {
    uni.hideLoading()
    uploading.value = false
  }
}

/** 选择视频:与图片互斥,选完立即直传 COS */
async function handlePickVideo() {
  if (uploading.value)
    return
  if (images.value.length > 0) {
    uni.showToast({ title: '已选择图片,请先清空图片', icon: 'none' })
    return
  }
  if (videoUrl.value) {
    uni.showToast({ title: '已选择 1 个视频,请先删除', icon: 'none' })
    return
  }
  try {
    const picked = await chooseVideo({ prefix: 'checkin' })
    if (!picked)
      return
    uploading.value = true
    uni.showLoading({ title: '上传中...', mask: true })
    const result = await uploadFileToCos({ file: picked.file, name: picked.name, purpose: 'generic' })
    videoUrl.value = result.url
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '视频上传失败', icon: 'none' })
  }
  finally {
    uni.hideLoading()
    uploading.value = false
  }
}

/** 移除某张图片 */
function handleRemoveImage(index: number) {
  images.value.splice(index, 1)
}

/** 移除视频 */
function handleRemoveVideo() {
  videoUrl.value = ''
}

/** 预览已选图片 */
function handlePreviewImage(index: number) {
  if (images.value.length === 0)
    return
  uni.previewImage({ urls: images.value, current: images.value[index] })
}

/** 移除某个兴趣标签 */
function handleRemoveTag(tag: string) {
  tags.value = tags.value.filter(t => t !== tag)
}

/** 兴趣弹窗确认 */
function handleTagsConfirm(newTags: string[]) {
  tags.value = newTags
}

/** 单选/取消选择关联圈子 */
function handleSelectCircle(id: string) {
  circleId.value = circleId.value === id ? '' : id
}

/** 提交发布 */
async function handleSubmit() {
  if (!canSubmit.value) {
    uni.showToast({ title: '请填写文字或上传图片/视频', icon: 'none' })
    return
  }
  submitting.value = true
  try {
    await createCheckin({
      content: content.value.trim() || undefined,
      circleId: circleId.value || undefined,
      tags: tags.value,
      images: images.value,
      videoUrl: videoUrl.value || undefined,
    })
    uni.showToast({ title: '发布成功', icon: 'success' })
    setTimeout(() => {
      uni.navigateBack({
        fail() {
          uni.reLaunch({ url: '/pages/checkin-plaza/checkin-plaza' })
        },
      })
    }, 600)
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '发布失败,请重试', icon: 'none' })
  }
  finally {
    submitting.value = false
  }
}
</script>

<template>
  <view class="min-h-screen bg-[#f7f8fa] pb-28">
    <!-- 1. 文字 -->
    <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
      <view class="flex items-center justify-between">
        <text class="text-sm text-[#333] font-medium">
          这一刻想说的话
        </text>
        <text class="text-xs text-[#999]">{{ contentCountText }}</text>
      </view>
      <textarea
        v-model="content"
        class="mt-2 h-32 w-full rounded-lg bg-[#f5f6f7] p-3 text-sm leading-6"
        :maxlength="CONTENT_MAX"
        placeholder="分享今天的练习心得、活动瞬间…（选填）"
        placeholder-class="text-[#bbb]"
      />
    </view>

    <!-- 2. 媒体 -->
    <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
      <view class="flex items-center justify-between">
        <text class="text-sm text-[#333] font-medium">
          图片 / 视频
        </text>
        <text class="text-xs text-[#999]">
          {{ videoUrl ? '视频 1/1' : `图片 ${images.length}/${IMAGES_MAX}` }}
        </text>
      </view>
      <text class="mt-1 block text-xs text-[#999]">
        最多 9 张图片 或 1 个视频,二者不能同时上传
      </text>

      <!-- 图片九宫格 -->
      <view v-if="images.length > 0" class="mt-3 flex flex-wrap gap-2">
        <view
          v-for="(url, index) in images"
          :key="`${url}-${index}`"
          class="relative h-20 w-20 overflow-hidden rounded-lg"
        >
          <image :src="url" class="h-full w-full" mode="aspectFill" @click="handlePreviewImage(index)" />
          <view
            class="absolute right-0 top-0 h-5 w-5 flex items-center justify-center rounded-bl-lg bg-black/50"
            @click="handleRemoveImage(index)"
          >
            <text class="text-xs text-white">×</text>
          </view>
        </view>
      </view>

      <!-- 视频预览 -->
      <view v-if="videoUrl" class="relative mt-3 h-40 w-40 overflow-hidden rounded-lg bg-black">
        <video :src="videoUrl" class="h-full w-full" object-fit="contain" :controls="true" />
        <view
          class="absolute right-0 top-0 h-5 w-5 flex items-center justify-center rounded-bl-lg bg-black/50"
          @click="handleRemoveVideo"
        >
          <text class="text-xs text-white">×</text>
        </view>
      </view>

      <!-- 选择入口 -->
      <view class="mt-3 flex gap-2">
        <view
          v-if="images.length < IMAGES_MAX"
          class="h-20 w-20 flex flex-col items-center justify-center border border-[#e0e0e0] rounded-lg border-dashed bg-[#fafafa]"
          :class="videoUrl ? 'opacity-40' : ''"
          @click="handlePickImages"
        >
          <text class="i-carbon-image text-xl text-[#bbb]" />
          <text class="mt-0.5 text-xs text-[#999]">图片</text>
        </view>
        <view
          v-if="!videoUrl"
          class="h-20 w-20 flex flex-col items-center justify-center border border-[#e0e0e0] rounded-lg border-dashed bg-[#fafafa]"
          :class="images.length > 0 ? 'opacity-40' : ''"
          @click="handlePickVideo"
        >
          <text class="i-carbon-video text-xl text-[#bbb]" />
          <text class="mt-0.5 text-xs text-[#999]">视频</text>
        </view>
        <view
          v-if="uploading"
          class="h-20 w-20 flex flex-col items-center justify-center rounded-lg bg-[#f5f6f7]"
        >
          <text class="text-xs text-[#999]">上传中...</text>
        </view>
      </view>
    </view>

    <!-- 3. 关联圈子 -->
    <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
      <view class="flex items-center justify-between">
        <text class="text-sm text-[#333] font-medium">
          关联圈子
        </text>
        <text class="text-xs text-[#999]">选填</text>
      </view>
      <text class="mt-1 block text-xs text-[#999]">
        仅可选择你关注的圈子,完成打卡后同步展示在圈子详情页
      </text>

      <scroll-view scroll-x class="mt-3 whitespace-nowrap">
        <view class="inline-flex gap-2">
          <text
            class="rounded-full px-3 py-1.5 text-xs"
            :class="circleId === '' ? 'bg-[#018d71] text-white' : 'bg-[#f5f5f5] text-[#666]'"
            @click="handleSelectCircle('')"
          >
            不关联圈子
          </text>
          <text
            v-for="c in followedCircles"
            :key="c.id"
            class="rounded-full px-3 py-1.5 text-xs"
            :class="circleId === c.id ? 'bg-[#018d71] text-white' : 'bg-[#f5f5f5] text-[#666]'"
            @click="handleSelectCircle(c.id)"
          >
            {{ c.title }}
          </text>
        </view>
      </scroll-view>
      <text v-if="!circlesLoading && followedCircles.length === 0" class="mt-2 block text-xs text-[#999]">
        还没有关注的圈子,可在圈子详情页点击「关注」
      </text>
    </view>

    <!-- 4. 兴趣标签 -->
    <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
      <view class="flex items-center justify-between">
        <text class="text-sm text-[#333] font-medium">
          兴趣标签
        </text>
        <text class="text-xs text-[#999]">{{ tags.length }}/{{ TAGS_MAX }}</text>
      </view>
      <text class="mt-1 block text-xs text-[#999]">
        已自动带入「我的兴趣」,可逐条删除或添加
      </text>

      <view class="mt-3 flex flex-wrap gap-2">
        <view
          v-for="tag in tags"
          :key="tag"
          class="flex items-center gap-1 rounded-full bg-[#e8f5f1] px-2.5 py-1"
        >
          <text class="text-xs text-[#018d71]">{{ tag }}</text>
          <text class="i-carbon-close text-xs text-[#018d71]" @click="handleRemoveTag(tag)" />
        </view>
        <text
          v-if="tags.length < TAGS_MAX"
          class="rounded-full bg-[#f5f5f5] px-3 py-1 text-xs text-[#666]"
          @click="tagSelectorOpen = true"
        >
          ＋ 添加
        </text>
      </view>
      <text v-if="tags.length === 0" class="mt-2 block text-xs text-[#999]">
        暂无兴趣标签,点击「＋ 添加」选择
      </text>
    </view>

    <!-- 底部提交栏 -->
    <view class="fixed bottom-0 left-0 right-0 border-t border-[#f0f0f0] bg-white px-4 py-3 pb-safe">
      <wd-button
        block
        :loading="submitting"
        :disabled="!canSubmit"
        @click="handleSubmit"
      >
        发布打卡
      </wd-button>
    </view>

    <!-- 兴趣标签选择弹窗(可增删,上限 10) -->
    <TagSelectorPopup
      v-model="tagSelectorOpen"
      :max="TAGS_MAX"
      :initial-tags="tags"
      @confirm="handleTagsConfirm"
    />
  </view>
</template>

<style lang="scss" scoped>
//
</style>
