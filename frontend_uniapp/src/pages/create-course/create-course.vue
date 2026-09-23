<script lang="ts" setup>
/**
 * 发布视频课程页(任意登录用户可用,提交后 status=pending 待管理员审核)。
 *
 * - 课程:标题 / 简介 / 封面图(0-9 张)/ 兴趣标签(0-5 个);
 * - 课时:可增删与上下移,每个课时含标题、简介与 1 个视频(0-30 个,允许先建课后补课时);
 * - 视频与封面在客户端直传 COS(scope=uploads/<userId>/*),提交接口只传 URL;
 * - 限额与后端 `lib/form-limits.ts` 保持一致,前端先校验避免无效请求。
 */
import { computed, ref } from 'vue'
import { useUserStore } from '@/store/user'
import { shouldBlockForAppDeploying } from '@/composables/useAppDeployingGuard'
import { createCourse } from '@/api/courses'
import { uploadFileToCos } from '@/api/upload'
import { chooseImages } from '@/utils/chooseImage'
import { chooseVideo } from '@/utils/chooseVideo'
import { toLoginWithRedirect } from '@/utils/toLoginPage'
import { ensureTextSafe, showModerationFailureToast } from '@/utils/content-moderation'
import TagSelectorPopup from '@/components/TagSelectorPopup/TagSelectorPopup.vue'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '发布视频课程',
  },
  excludeLoginPath: false,
})

// ====== 限额(与后端 backend/lib/form-limits.ts 对齐) ======
const TITLE_MIN = 2
const TITLE_MAX = 100
const DESCRIPTION_MIN = 10
const DESCRIPTION_MAX = 5000
const TAGS_MAX = 5
const COVER_IMAGES_MAX = 9
const LESSONS_MAX = 30
const LESSON_TITLE_MAX = 100
const LESSON_DESCRIPTION_MAX = 500
/** 单个课时视频体积上限(MB),本地预校验避免超大文件白传 */
const VIDEO_MAX_MB = 500
/** 内容审核单次送审的最大字符数(后端上限 5000,留余量) */
const MODERATION_CHUNK_MAX = 4500

/** 课时草稿(提交前仅存在于本页状态) */
interface LessonDraft {
  key: number
  title: string
  description: string
  /** COS 公网 URL,空串表示尚未上传 */
  videoUrl: string
  durationSeconds: number | null
  uploading: boolean
}

const userStore = useUserStore()

const title = ref('')
const description = ref('')
const coverImages = ref<string[]>([])
const tags = ref<string[]>([])
const lessons = ref<LessonDraft[]>([])
const uploadingCover = ref(false)
const submitting = ref(false)
const tagSelectorOpen = ref(false)

/**
 * 当前展开预览的课时 key(同一时刻只渲染 1 个 video 实例)。
 *
 * 小程序对同时存在的 `<video>` 有数量上限(约 16 个),而课时最多 30 个,
 * 全部同时渲染既可能超限又会拖慢滚动,故未展开的课时只渲染封面占位,
 * 点击占位才创建 video 实例。
 */
const activeVideoKey = ref<number | null>(null)

let lessonSeq = 0

/** 新建课时草稿(序号用于 v-for key,与业务顺序解耦,移序时不重渲染) */
function createLessonDraft(): LessonDraft {
  lessonSeq += 1
  return {
    key: lessonSeq,
    title: '',
    description: '',
    videoUrl: '',
    durationSeconds: null,
    uploading: false,
  }
}

// ====== 表单校验 ======
const titleCount = computed(() => `${title.value.trim().length}/${TITLE_MAX}`)
const descCount = computed(() => `${description.value.trim().length}/${DESCRIPTION_MAX}`)
const tagsCountText = computed(() => `${tags.value.length}/${TAGS_MAX}`)
const titleValid = computed(() => {
  const len = title.value.trim().length
  return len >= TITLE_MIN && len <= TITLE_MAX
})
const descriptionValid = computed(() => {
  const len = description.value.trim().length
  return len >= DESCRIPTION_MIN && len <= DESCRIPTION_MAX
})
const hasUploadingLesson = computed(() => lessons.value.some(l => l.uploading))
const canSubmit = computed(() =>
  titleValid.value && descriptionValid.value && !hasUploadingLesson.value && !submitting.value)

/** 不可提交原因(内联提示,避免用户反复点击无反馈) */
const formErr = computed((): string => {
  if (!titleValid.value)
    return `课程标题需 ${TITLE_MIN}-${TITLE_MAX} 字`
  if (!descriptionValid.value)
    return `课程简介至少 ${DESCRIPTION_MIN} 字(上限 ${DESCRIPTION_MAX} 字)`
  if (hasUploadingLesson.value)
    return '课时视频上传中,请稍候'
  return ''
})

// ====== 兴趣标签 ======
function handleOpenTagSelector() {
  tagSelectorOpen.value = true
}

function handleTagConfirm(newTags: string[]) {
  tags.value = newTags
}

// ====== 课时增删与排序 ======
function handleAddLesson() {
  if (lessons.value.length >= LESSONS_MAX) {
    uni.showToast({ title: `最多 ${LESSONS_MAX} 个课时`, icon: 'none' })
    return
  }
  lessons.value.push(createLessonDraft())
}

function handleRemoveLesson(index: number) {
  // 被删除的课时若正在预览,先收起,避免 activeVideoKey 指向已移除的课时
  if (lessons.value[index]?.key === activeVideoKey.value)
    activeVideoKey.value = null
  lessons.value.splice(index, 1)
}

/** 展开指定课时的视频预览(其它课时自动回到封面占位,保证同时只有 1 个 video) */
function handlePreviewVideo(key: number) {
  activeVideoKey.value = key
}

/** 收起当前预览(销毁 video 实例) */
function handleCollapseVideo() {
  activeVideoKey.value = null
}

/** 上移 / 下移(offset = -1 / 1),越界不处理 */
function handleMoveLesson(index: number, offset: number) {
  const target = index + offset
  if (target < 0 || target >= lessons.value.length)
    return
  const moved = lessons.value.splice(index, 1)[0]
  lessons.value.splice(target, 0, moved)
}

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
    const chosen = await chooseImages(remaining, { prefix: 'course-cover' })
    if (chosen.length === 0)
      return
    uploadingCover.value = true
    for (const { file, name } of chosen) {
      const uploaded = await uploadFileToCos({ file, name, purpose: 'generic' })
      coverImages.value.push(uploaded.url)
    }
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '封面上传失败', icon: 'none' })
  }
  finally {
    uploadingCover.value = false
  }
}

function handleRemoveCover(index: number) {
  coverImages.value.splice(index, 1)
}

// ====== 课时视频:选择 → 体积预校验 → COS 直传 ======
async function handlePickVideo(index: number) {
  const lesson = lessons.value[index]
  if (!lesson || lesson.uploading)
    return
  try {
    const picked = await chooseVideo({ prefix: `course-lesson-${index + 1}`, maxDuration: 60 * 30 })
    if (!picked)
      return
    if (picked.size > VIDEO_MAX_MB * 1024 * 1024) {
      uni.showToast({ title: `单个视频不能超过 ${VIDEO_MAX_MB}MB`, icon: 'none' })
      return
    }
    lesson.uploading = true
    const uploaded = await uploadFileToCos({ file: picked.file, name: picked.name, purpose: 'generic' })
    lesson.videoUrl = uploaded.url
    // 时长未知(部分平台不返回)时存 null,后端与详情页按「时长待补充」展示
    lesson.durationSeconds = picked.duration > 0 ? Math.round(picked.duration) : null
    // 上传/替换完成后直接展开该课时预览,便于用户确认
    activeVideoKey.value = lesson.key
    uni.showToast({ title: '视频上传完成', icon: 'success' })
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '视频上传失败', icon: 'none' })
  }
  finally {
    lesson.uploading = false
  }
}

/** 视频时长展示(mm:ss,未知显示占位) */
function formatDuration(seconds: number | null): string {
  if (!seconds || seconds <= 0)
    return '时长未知'
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${String(rest).padStart(2, '0')}`
}

// ====== 提交 ======
/** 课时本地校验:返回第一个问题的提示文案,全部通过返回空串 */
function findLessonError(): string {
  for (let i = 0; i < lessons.value.length; i += 1) {
    const lesson = lessons.value[i]
    if (!lesson.title.trim())
      return `请填写第 ${i + 1} 个课时的标题`
    if (!lesson.videoUrl)
      return `请为第 ${i + 1} 个课时上传视频`
  }
  return ''
}

/**
 * 文本先审后发门禁(仅微信小程序端生效,开关由后端系统设置控制)。
 * 课程文案与课时文案拼接后按上限分段送审,保证超长文案全量覆盖不漏审。
 */
async function passesTextModeration(): Promise<boolean> {
  const text = [
    title.value,
    description.value,
    ...lessons.value.map(l => `${l.title}\n${l.description}`),
  ].join('\n')
  for (let i = 0; i < text.length; i += MODERATION_CHUNK_MAX) {
    const result = await ensureTextSafe(text.slice(i, i + MODERATION_CHUNK_MAX), 'activity')
    if (result !== 'pass') {
      showModerationFailureToast(result)
      return false
    }
  }
  return true
}

async function handleSubmit() {
  if (!canSubmit.value) {
    if (formErr.value)
      uni.showToast({ title: formErr.value, icon: 'none' })
    return
  }
  const lessonErr = findLessonError()
  if (lessonErr) {
    uni.showToast({ title: lessonErr, icon: 'none' })
    return
  }

  submitting.value = true
  try {
    if (!(await passesTextModeration()))
      return
    await createCourse({
      title: title.value.trim(),
      description: description.value.trim(),
      coverImages: coverImages.value,
      tags: tags.value,
      lessons: lessons.value.map(lesson => ({
        title: lesson.title.trim(),
        description: lesson.description.trim(),
        videoUrl: lesson.videoUrl,
        durationSeconds: lesson.durationSeconds,
      })),
    })
    uni.showToast({ title: '已提交,等待管理员审核', icon: 'none' })
    setTimeout(() => uni.navigateBack(), 1200)
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '发布失败', icon: 'none' })
  }
  finally {
    submitting.value = false
  }
}

onLoad(async () => {
  if (!userStore.isLoggedIn) {
    // 未登录:reLaunch 清空页面栈并携带 redirect,登录后回到本页
    toLoginWithRedirect()
    return
  }
  // 应用发布维护中(isAppDeploying 为 true)不允许进入,跳转首页
  if (await shouldBlockForAppDeploying()) {
    return
  }
  // 默认带入用户兴趣标签(上限 TAGS_MAX 个)
  if (userStore.userInfo.tags?.length)
    tags.value = [...userStore.userInfo.tags].slice(0, TAGS_MAX)
})
</script>

<template>
  <view class="flex flex-col bg-[#f5f6f7] pb-32">
    <!-- ====== 顶部说明 ====== -->
    <view class="mx-4 mt-4 rounded-2xl bg-[#018d71] p-5">
      <text class="block text-lg text-white font-semibold">
        发布视频课程
      </text>
      <text class="mt-1 block text-xs text-white/80 leading-5">
        上传课时视频并完善课程信息,提交后由管理员审核通过即可上线
      </text>
    </view>

    <!-- ====== 1. 课程标题 ====== -->
    <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
      <view class="flex items-center justify-between">
        <text class="text-sm text-[#333] font-medium">
          课程标题 <text class="text-[#f53f3f]">*</text>
        </text>
        <text class="text-xs text-[#999]">{{ titleCount }}</text>
      </view>
      <input
        v-model="title"
        class="mt-2 h-10 w-full rounded-lg bg-[#f5f6f7] px-3 text-sm"
        :maxlength="TITLE_MAX"
        placeholder="2-100 字符,如:零基础太极拳入门 12 讲"
        placeholder-class="text-[#bbb]"
      >
    </view>

    <!-- ====== 2. 课程简介 ====== -->
    <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
      <view class="flex items-center justify-between">
        <text class="text-sm text-[#333] font-medium">
          课程简介 <text class="text-[#f53f3f]">*</text>
        </text>
        <text class="text-xs text-[#999]">{{ descCount }}</text>
      </view>
      <textarea
        v-model="description"
        class="mt-2 h-32 rounded-lg bg-[#f5f6f7] p-3 text-sm leading-6"
        :maxlength="DESCRIPTION_MAX"
        placeholder="10-5000 字符,介绍课程内容、适合人群与学习收获"
        placeholder-class="text-[#bbb]"
      />
      <text v-if="description.trim().length > 0 && !descriptionValid" class="mt-2 block text-xs text-[#f53f3f]">
        课程简介至少 {{ DESCRIPTION_MIN }} 字
      </text>
    </view>

    <!-- ====== 3. 封面图 ====== -->
    <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
      <view class="flex items-center justify-between">
        <text class="text-sm text-[#333] font-medium">
          课程封面
        </text>
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
          <text class="i-carbon-add text-xl text-[#ccc]" />
          <text class="mt-0.5 text-xs text-[#999]">{{ uploadingCover ? '上传中' : '添加' }}</text>
        </view>
      </view>
    </view>

    <!-- ====== 4. 兴趣标签 ====== -->
    <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
      <view class="flex items-center justify-between">
        <text class="text-sm text-[#333] font-medium">
          兴趣标签
        </text>
        <text class="text-xs text-[#999]">{{ tagsCountText }}</text>
      </view>
      <view
        class="mt-2 min-h-11 flex items-center justify-between rounded-lg bg-[#f5f6f7] p-3"
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

    <!-- ====== 5. 课时列表 ====== -->
    <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
      <view class="flex items-center justify-between">
        <text class="text-sm text-[#333] font-medium">
          课时
        </text>
        <text class="text-xs text-[#999]">{{ lessons.length }}/{{ LESSONS_MAX }}</text>
      </view>
      <text class="mt-1 block text-xs text-[#999]">
        每个课时上传 1 个视频,提交顺序即展示顺序
      </text>

      <view v-if="lessons.length === 0" class="mt-3 flex flex-col items-center rounded-lg bg-[#f7f9f8] py-6">
        <text class="text-xs text-[#999]">
          还没有课时,可先提交课程后续再补充
        </text>
      </view>

      <view
        v-for="(lesson, idx) in lessons"
        :key="lesson.key"
        class="mt-3 rounded-xl bg-[#f7f9f8] p-3"
      >
        <view class="flex items-center justify-between">
          <text class="text-xs text-[#018d71] font-medium">
            第 {{ idx + 1 }} 课时
          </text>
          <view class="flex items-center gap-3">
            <text
              class="i-carbon-arrow-up text-base"
              :class="idx === 0 ? 'text-[#ddd]' : 'text-[#666]'"
              @click="handleMoveLesson(idx, -1)"
            />
            <text
              class="i-carbon-arrow-down text-base"
              :class="idx === lessons.length - 1 ? 'text-[#ddd]' : 'text-[#666]'"
              @click="handleMoveLesson(idx, 1)"
            />
            <text class="i-carbon-trash-can text-base text-[#f53f3f]" @click="handleRemoveLesson(idx)" />
          </view>
        </view>

        <input
          v-model="lesson.title"
          class="mt-2 h-10 w-full rounded-lg bg-white px-3 text-sm"
          :maxlength="LESSON_TITLE_MAX"
          placeholder="课时标题,如:第 1 讲 起势与站桩"
          placeholder-class="text-[#bbb]"
        >
        <textarea
          v-model="lesson.description"
          class="mt-2 h-16 w-full rounded-lg bg-white p-3 text-sm leading-6"
          :maxlength="LESSON_DESCRIPTION_MAX"
          placeholder="课时简介(选填)"
          placeholder-class="text-[#bbb]"
        />

        <!-- 视频:未上传 → 虚线选择框;上传中 → 加载态 -->
        <view
          v-if="!lesson.videoUrl"
          class="mt-2 flex items-center justify-center border border-[#e0e0e0] rounded-lg border-dashed bg-white py-5"
          @click="handlePickVideo(idx)"
        >
          <text class="i-carbon-video text-xl text-[#bbb]" />
          <text class="ml-2 text-xs text-[#999]">
            {{ lesson.uploading ? '上传中…' : '上传课时视频' }}
          </text>
        </view>

        <!-- 已展开预览:同一时刻仅渲染 1 个 video 实例(小程序 video 数量受限) -->
        <view v-else-if="activeVideoKey === lesson.key" class="mt-2 overflow-hidden rounded-lg bg-black">
          <video :src="lesson.videoUrl" class="h-40 w-full" :controls="true" object-fit="contain" />
          <view class="flex items-center justify-between px-3 py-2">
            <text class="text-xs text-white/70">{{ formatDuration(lesson.durationSeconds) }}</text>
            <view class="flex items-center gap-4">
              <text class="text-xs text-[#3ddcae]" @click="handlePickVideo(idx)">
                重新上传
              </text>
              <text class="text-xs text-white/70" @click="handleCollapseVideo">
                收起
              </text>
            </view>
          </view>
        </view>

        <!-- 未展开预览:课程封面占位,点击才创建 video 实例 -->
        <view
          v-else
          class="relative mt-2 h-40 w-full overflow-hidden rounded-lg bg-[#e8f5f1]"
          @click="handlePreviewVideo(lesson.key)"
        >
          <image
            v-if="coverImages.length > 0"
            :src="coverImages[0]"
            class="h-full w-full"
            mode="aspectFill"
          />
          <view v-else class="h-full w-full flex items-center justify-center">
            <text class="i-carbon-video text-4xl text-[#018d71]/30" />
          </view>

          <!-- 有封面时叠加播放按钮,表达可点击预览 -->
          <view
            v-if="coverImages.length > 0"
            class="absolute inset-0 flex items-center justify-center"
          >
            <view class="h-10 w-10 flex items-center justify-center rounded-full bg-black/35">
              <text class="i-carbon-play-filled text-xl text-white" />
            </view>
          </view>

          <view class="absolute left-2 top-2 rounded-full bg-black/45 px-2 py-0.5">
            <text class="text-[10px] text-white">{{ formatDuration(lesson.durationSeconds) }}</text>
          </view>
          <text
            class="absolute right-2 top-2 rounded-full bg-black/45 px-2 py-0.5 text-[10px] text-[#3ddcae]"
            @click.stop="handlePickVideo(idx)"
          >
            重新上传
          </text>
        </view>
      </view>

      <view
        v-if="lessons.length < LESSONS_MAX"
        class="mt-3 flex items-center justify-center border border-[#e0e0e0] rounded-lg border-dashed bg-white py-3"
        @click="handleAddLesson"
      >
        <text class="i-carbon-add text-base text-[#018d71]" />
        <text class="ml-1 text-xs text-[#018d71]">
          添加课时(最多 {{ LESSONS_MAX }} 个)
        </text>
      </view>
    </view>

    <text class="mx-4 mt-3 block text-xs text-[#999]">
      提交后需管理员审核通过,课程才能上线
    </text>

    <!-- ====== 底部提交按钮 ====== -->
    <view class="fixed bottom-0 left-0 right-0 border-t border-[#f0f0f0] bg-white px-4 py-3 pb-safe">
      <wd-button
        block
        :loading="submitting"
        :disabled="!canSubmit"
        @click="handleSubmit"
      >
        发布视频课程
      </wd-button>
      <text v-if="formErr" class="mt-2 block text-center text-xs text-[#f53f3f]">
        {{ formErr }}
      </text>
    </view>

    <!-- 兴趣标签选择弹窗 -->
    <TagSelectorPopup
      v-model="tagSelectorOpen"
      :max="TAGS_MAX"
      :initial-tags="tags"
      @confirm="handleTagConfirm"
    />
  </view>
</template>

<style lang="scss" scoped>
//
</style>
