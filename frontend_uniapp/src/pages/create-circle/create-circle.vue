<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useUserStore } from '@/store/user'
import { useLocationStore } from '@/store/location'
import { shouldBlockForAppDeploying } from '@/composables/useAppDeployingGuard'
import { getMyProfile } from '@/api/auth'
import { createCircle, getCircle, updateCircle } from '@/api/circles'
import { uploadFileToCos } from '@/api/upload'
import { chooseImages } from '@/utils/chooseImage'
import { toLoginWithRedirect } from '@/utils/toLoginPage'
import TagSelectorPopup from '@/components/TagSelectorPopup/TagSelectorPopup.vue'
import type { CircleDetailDTO, UpdateCircleInput } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '创建圈子',
  },
  excludeLoginPath: false,
})

/** 标题最大长度 */
const TITLE_MAX = 50
/** 描述最大长度 */
const DESCRIPTION_MAX = 500
/** 标签最大数量 */
const TAGS_MAX = 5
/** 手机号校验(11 位) */
const PHONE_RE = /^1\d{10}$/
/** 轮播图片最大数量 */
const COVER_IMAGES_MAX = 9
/** 新建模式引导最后一步(表单)的索引 */
const WIZARD_FORM_STEP = 4

const userStore = useUserStore()
const locationStore = useLocationStore()

// 路由参数
const editId = ref<string>('')
const isEdit = computed(() => !!editId.value)
const loading = ref(false)

// 新建模式引导步骤(0-3 为逐步询问,4 为最终输入表单)
const wizardStep = ref(0)
/** 是否处于「逐步询问」阶段(仅新建模式且未到最后表单步) */
const isWizard = computed(() => !isEdit.value && wizardStep.value < WIZARD_FORM_STEP)

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
const submitting = ref(false)
const pickerVisible = ref(false)
const coverImages = ref<string[]>([])
const uploadingCover = ref(false)
const tagSelectorOpen = ref(false)
/** 生成描述模板中 */
const generatingDesc = ref(false)

/** 打开兴趣标签选择弹窗 */
function handleOpenTagSelector() {
  tagSelectorOpen.value = true
}

/** 弹窗确认:更新圈子标签 */
function handleTagConfirm(newTags: string[]) {
  tags.value = newTags
}

/**
 * 新建模式:用当前用户资料预填默认值。
 * - 兴趣标签默认取用户已绑定的兴趣标签;
 * - 活动地点默认取用户地址(经纬度优先用户位置,兜底本地缓存定位);
 * - 联系电话默认取用户手机号。
 */
function applyUserDefaults() {
  const info = userStore.userInfo
  if (tags.value.length === 0 && info.tags?.length)
    tags.value = [...info.tags].slice(0, TAGS_MAX)
  if (!address.value) {
    address.value = info.address || locationStore.address || ''
    latitude.value = info.location?.latitude ?? locationStore.latitude ?? null
    longitude.value = info.location?.longitude ?? locationStore.longitude ?? null
  }
  if (!contactPhone.value && info.phone)
    contactPhone.value = info.phone
}

/** 校验某个询问步骤,通过返回 true,否则提示并返回 false */
function validateWizardStep(step: number): boolean {
  if (step === 0 && tags.value.length === 0) {
    uni.showToast({ title: '请先选择兴趣标签', icon: 'none' })
    return false
  }
  if (step === 1 && (!address.value || latitude.value === null || longitude.value === null)) {
    uni.showToast({ title: '请选择活动地点', icon: 'none' })
    return false
  }
  if (step === 3) {
    const phone = contactPhone.value.trim()
    if (!phone) {
      uni.showToast({ title: '请输入联系电话', icon: 'none' })
      return false
    }
    if (!PHONE_RE.test(phone)) {
      uni.showToast({ title: '手机号格式不正确(11 位)', icon: 'none' })
      return false
    }
  }
  return true
}

/** 下一步:校验当前步骤后前进,最后一步进入表单 */
function handleWizardNext() {
  if (!validateWizardStep(wizardStep.value))
    return
  if (wizardStep.value < WIZARD_FORM_STEP)
    wizardStep.value += 1
}

/** 上一步:回退到上一个询问步骤 */
function handleWizardPrev() {
  if (wizardStep.value > 0)
    wizardStep.value -= 1
}

/**
 * 根据已填写的标题、标签、地点、活动时间,生成本地结构化描述模板。
 * 纯前端拼装,不依赖后端 AI 接口;用户可在此基础上继续编辑。
 */
function buildDescriptionTemplate(): string {
  const parts: string[] = []
  const t = trimmedTitle.value
  const tagText = tags.value.length ? tags.value.join('、') : ''

  // 开场:圈子定位
  if (t) {
    parts.push(`欢迎来到「${t}」!这里是一个专注于${tagText || '兴趣交流'}的线下圈子,旨在为大家提供一个持续成长、互相陪伴的交流空间。`)
  }
  else {
    parts.push('欢迎加入我们的圈子!这里是一个专注兴趣交流、持续成长的线下社群。')
  }

  // 我们做什么
  const what = tagText
    ? `我们围绕【${tagText}】开展丰富的活动,既有系统性的学习分享,也有轻松的线下交流,帮助每位成员在实践中提升、在陪伴中坚持。`
    : '我们定期开展主题分享、互动交流与线下活动,帮助成员在实践中提升、在陪伴中坚持。'
  parts.push(what)

  // 适合谁
  parts.push('无论你是刚刚入门的新手,还是希望找到同好、共同进步的老手,都能在这里找到属于自己的节奏。我们欢迎所有怀有热情、愿意分享的你。')

  // 时间地点
  const where = address.value || '具体活动地点将在群内通知'
  const when = activityTime.value.trim() || '活动时间请关注群内公告'
  parts.push(`📍 活动地点:${where}\n🕒 活动时间:${when}`)

  // 联系方式
  const contactBits: string[] = []
  if (contactPhone.value.trim())
    contactBits.push(`电话 ${contactPhone.value.trim()}`)
  if (wechat.value.trim())
    contactBits.push(`微信 ${wechat.value.trim()}`)
  if (contactBits.length)
    parts.push(`如需咨询或报名,可通过 ${contactBits.join(' / ')} 联系我们,期待与你相遇!`)

  return parts.join('\n\n')
}

/** 点击「生成模板」:填充描述文本框(受最大长度限制) */
function handleGenerateDescription() {
  if (generatingDesc.value)
    return
  generatingDesc.value = true
  try {
    const template = buildDescriptionTemplate()
    description.value = template.slice(0, DESCRIPTION_MAX)
    uni.showToast({ title: '已生成模板', icon: 'success' })
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '生成失败', icon: 'none' })
  }
  finally {
    generatingDesc.value = false
  }
}

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
    wechat.value = data.wechat || ''
    activityTime.value = data.activityTime || ''
    coverImages.value = data.coverImages || []
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '加载失败', icon: 'none' })
  }
  finally {
    loading.value = false
  }
}

onLoad(async (options) => {
  if (!userStore.isLoggedIn) {
    // 未登录:reLaunch 清空页面栈并携带 redirect,登录后回到本页
    toLoginWithRedirect()
    return
  }
  // 应用发布维护中(isAppDeploying 为 true)不允许进入,跳转首页
  if (await shouldBlockForAppDeploying()) {
    return
  }
  editId.value = (options as any)?.id || ''
  // 新建模式:仅 TEACHER / ADMIN 可创建圈子,其余角色先完成教师认证
  if (!isEdit.value && !['TEACHER', 'ADMIN'].includes(userStore.userInfo?.role ?? '')) {
    uni.showToast({ title: '请先完成教师认证', icon: 'none' })
    uni.redirectTo({ url: '/pages/teacher-certification/teacher-certification' })
    return
  }
  if (isEdit.value) {
    void fetchForEdit(editId.value)
  }
  else {
    // 新建模式:按步骤引导,先用用户资料预填默认值
    applyUserDefaults()
    // 用户资料可能尚未拉全,再用完整资料(含标签/地址)刷新一次
    try {
      const profile = await getMyProfile()
      userStore.setProfile(profile)
      applyUserDefaults()
    }
    catch {
      // 拉取失败不阻塞,沿用已有本地资料
    }
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
const canSubmit = computed(() =>
  titleValid.value && descriptionValid.value && tagsValid.value && locationValid.value
  && hasContact.value && phoneValid.value && !submitting.value)

const formErr = computed((): string => {
  if (!hasContact.value)
    return '请至少填写一种联系方式'
  if (!phoneValid.value)
    return '手机号格式不正确(11 位)'
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
    if (err?.errMsg && /cancel/i.test(err.errMsg))
      return
    uni.showToast({ title: err?.message || '定位失败', icon: 'none' })
  }
  // #endif
}

function handlePickerConfirm(loc: { latitude: number, longitude: number, address: string }) {
  latitude.value = loc.latitude
  longitude.value = loc.longitude
  address.value = loc.address
  pickerVisible.value = false
}

// 上传轮播图片
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
  if (!canSubmit.value)
    return
  submitting.value = true
  try {
    const lat = latitude.value as number
    const lng = longitude.value as number

    if (isEdit.value) {
      const patch: UpdateCircleInput = {
        title: trimmedTitle.value,
        tags: tags.value,
        description: description.value.trim(),
        contactPhone: contactPhone.value.trim() || undefined,
        wechat: wechat.value.trim() || undefined,
        activityTime: activityTime.value.trim() || undefined,
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
  <view class="flex flex-col pb-40">
    <view v-if="loading && isEdit" class="flex flex-col items-center pt-32">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <template v-else>
      <scroll-view scroll-y class="flex-1">
        <!-- 步骤条(仅新建模式) -->
        <view v-if="!isEdit" class="mx-4 mt-4 rounded-2xl bg-white px-2 py-5">
          <wd-steps :active="wizardStep" align-center>
            <wd-step title="兴趣" />
            <wd-step title="地点" />
            <wd-step title="时间" />
            <wd-step title="联系" />
            <wd-step title="完善" />
          </wd-steps>
        </view>

        <!-- 新建模式:逐步询问用户创建圈子的信息 -->
        <template v-if="isWizard">
          <!-- 步骤 1:兴趣标签 -->
          <view v-if="wizardStep === 0" class="mx-4 mt-3 rounded-2xl bg-white p-4">
            <text class="text-base text-[#333] font-medium">
              1. 你想创建什么样的兴趣圈子?
            </text>
            <text class="mt-1 block text-xs text-[#999]">
              默认使用你的兴趣标签,可点击调整(1-5 个)
            </text>
            <view class="mt-3 flex flex-wrap gap-2">
              <text v-if="tags.length === 0" class="text-sm text-[#bbb]">
                尚未选择兴趣标签
              </text>
              <text
                v-for="(tag, idx) in tags"
                :key="`w-tag-${tag}-${idx}`"
                class="rounded-full bg-[#e6f6f1] px-3 py-1 text-sm text-[#018d71]"
              >
                {{ tag }}
              </text>
            </view>
            <view class="mt-4">
              <wd-button type="primary" variant="plain" round size="small" @click="handleOpenTagSelector">
                选择兴趣标签
              </wd-button>
            </view>
          </view>

          <!-- 步骤 2:活动地点 -->
          <view v-else-if="wizardStep === 1" class="mx-4 mt-3 rounded-2xl bg-white p-4">
            <text class="text-base text-[#333] font-medium">
              2. 圈子在哪里活动?
            </text>
            <text class="mt-1 block text-xs text-[#999]">
              默认使用你的地址,如需调整点击选择
            </text>
            <view
              class="mt-3 flex items-center justify-between rounded-lg bg-[#f5f6f7] p-3"
              @click="handleChooseLocation"
            >
              <text :class="address ? 'text-sm text-[#333]' : 'text-sm text-[#bbb]'">
                {{ address || '点击选择活动地点' }}
              </text>
              <text class="text-sm text-[#018d71]">选择 ›</text>
            </view>
          </view>

          <!-- 步骤 3:活动时间 -->
          <view v-else-if="wizardStep === 2" class="mx-4 mt-3 rounded-2xl bg-white p-4">
            <text class="text-base text-[#333] font-medium">
              3. 圈子什么时间活动?
            </text>
            <text class="mt-1 block text-xs text-[#999]">
              纯文本描述即可,如:每天上午 8:00~12:00
            </text>
            <input
              v-model="activityTime"
              class="mt-3 h-10 w-full rounded-lg bg-[#f5f6f7] px-3 text-sm"
              placeholder="如:每天上午 8:00~12:00"
              placeholder-class="text-[#bbb]"
            >
          </view>

          <!-- 步骤 4:联系电话 -->
          <view v-else-if="wizardStep === 3" class="mx-4 mt-3 rounded-2xl bg-white p-4">
            <text class="text-base text-[#333] font-medium">
              4. 留下联系电话
            </text>
            <text class="mt-1 block text-xs text-[#999]">
              默认使用你的手机号,可修改
            </text>
            <input
              v-model="contactPhone"
              class="mt-3 h-10 w-full rounded-lg bg-[#f5f6f7] px-3 text-sm"
              type="number"
              :maxlength="11"
              placeholder="11 位手机号"
              placeholder-class="text-[#bbb]"
            >
          </view>
        </template>

        <!-- 表单:编辑模式 / 新建模式最后一步 -->
        <template v-else>
          <!-- 新建模式最后一步:提示填写标题 / 介绍 / 图片并滑到底部提交 -->
          <view v-if="!isEdit" class="mx-4 mt-3 rounded-2xl bg-[#e8f5f1] p-4">
            <text class="text-sm text-[#018d71] font-medium">
              最后一步:完善圈子信息
            </text>
            <text class="mt-1 block text-xs text-[#018d71]">
              请填写标题、圈子介绍,并上传圈子图片;填写完成后滑到最下面点击「创建圈子」提交保存。
            </text>
          </view>

          <!-- 1. 标题 -->
          <view class="mx-4 mt-4 rounded-2xl bg-white p-4">
            <view class="flex items-center justify-between">
              <text class="text-sm text-[#333] font-medium">
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
            >
          </view>

          <!-- 2. 兴趣标签 -->
          <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
            <view class="flex items-center justify-between">
              <text class="text-sm text-[#333] font-medium">
                兴趣标签 <text class="text-[#f53f3f]">*</text>
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

          <!-- 3. 描述 -->
          <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
            <view class="flex items-center justify-between">
              <text class="text-sm text-[#333] font-medium">
                圈子介绍 <text class="text-[#f53f3f]">*</text>
              </text>
              <view class="flex items-center gap-2">
                <text
                  class="text-xs text-[#018d71]"
                  @click="handleGenerateDescription"
                >
                  {{ generatingDesc ? '生成中…' : '生成模板' }}
                </text>
                <text class="text-xs text-[#999]">{{ descCount }}</text>
              </view>
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
              <text class="text-sm text-[#333] font-medium">轮播图片</text>
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

          <!-- 4. 活动地点 -->
          <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
            <text class="text-sm text-[#333] font-medium">
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
            <text class="text-sm text-[#333] font-medium">联系电话</text>
            <input
              v-model="contactPhone"
              class="mt-2 h-10 rounded-lg bg-[#f5f6f7] px-3 text-sm"
              type="number"
              :maxlength="11"
              placeholder="11 位手机号(与微信号至少填一个)"
              placeholder-class="text-[#bbb]"
            >
          </view>

          <!-- 6. 微信号 -->
          <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
            <text class="text-sm text-[#333] font-medium">微信号</text>
            <input
              v-model="wechat"
              class="mt-2 h-10 rounded-lg bg-[#f5f6f7] px-3 text-sm"
              placeholder="微信号(与联系电话至少填一个)"
              placeholder-class="text-[#bbb]"
            >
          </view>

          <!-- 7. 活动时间 -->
          <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
            <text class="text-sm text-[#333] font-medium">活动时间</text>
            <input
              v-model="activityTime"
              class="mt-2 h-10 rounded-lg bg-[#f5f6f7] px-3 text-sm"
              placeholder="如:每周六上午 9:00-11:00"
              placeholder-class="text-[#bbb]"
            >
          </view>

          <!-- 审核提示 -->
          <text v-if="!isEdit" class="mx-4 mt-3 block text-xs text-[#999]">
            提交后需管理员审核通过,圈子才能上线
          </text>
        </template>
      </scroll-view>

      <!-- 向导按钮(新建模式问答步骤) -->
      <view v-if="isWizard" class="flex gap-3 border-t border-[#f0f0f0] bg-white px-4 py-3 pb-safe">
        <wd-button v-if="wizardStep > 0" variant="plain" @click="handleWizardPrev">
          上一步
        </wd-button>
        <view class="flex-1">
          <wd-button block @click="handleWizardNext">
            {{ wizardStep === WIZARD_FORM_STEP - 1 ? '去填写圈子信息' : '下一步' }}
          </wd-button>
        </view>
      </view>

      <!-- 底部提交按钮 -->
      <view v-else class="border-t border-[#f0f0f0] bg-white px-4 py-3 pb-safe">
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
