<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useUserStore } from '@/store/user'
import { uploadFileToCos } from '@/api/upload'
import { chooseImages } from '@/utils/chooseImage'
import { getMyApplication, submitTeacherApplication } from '@/api/teacher-applications'
import { canCreateCircle } from '@/utils/role'
import type { CertificationFile, TeacherApplicationDTO } from '@/api/teacher-applications'
import { LOGIN_PAGE } from '@/router/config'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '教师认证',
  },
  excludeLoginPath: false,
})

/** 认证材料数量限制(与后端 1-5 个对齐) */
const CERT_FILES_MIN = 1
const CERT_FILES_MAX = 5

/** 申请状态标签映射 */
const STATUS_MAP: Record<string, { text: string, color: string }> = {
  pending: { text: '审核中', color: '#ff7d00' },
  approved: { text: '已通过', color: '#00b42a' },
  rejected: { text: '已驳回', color: '#f53f3f' },
}

const userStore = useUserStore()

// ====== 页面状态 ======
const application = ref<TeacherApplicationDTO | null>(null)
const loading = ref(true)
// 表单状态
const files = ref<CertificationFile[]>([])
const idCardFront = ref<CertificationFile | null>(null)
const idCardBack = ref<CertificationFile | null>(null)
const uploading = ref(false)
const submitting = ref(false)

/** 当前角色是否为 TEACHER 或 ADMIN(无需认证即可发布圈子) */
const isCertified = computed(() => canCreateCircle(userStore.userInfo?.role))

/** 提交按钮是否可用 */
const canSubmit = computed(() =>
  !!idCardFront.value
  && !!idCardBack.value
  && files.value.length >= CERT_FILES_MIN
  && files.value.length <= CERT_FILES_MAX
  && !submitting.value)

/** 查询当前用户最新认证申请(进入/提交后刷新) */
async function loadApplication() {
  loading.value = true
  try {
    application.value = await getMyApplication()
    // 已通过后刷新用户信息,使 role 同步为 TEACHER(创建圈子入口依赖该字段)
    if (application.value?.status === 'approved') {
      await userStore.fetchUserInfo().catch(() => {})
    }
  }
  catch {
    // 静默:token 失效由拦截器跳登录
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
  void loadApplication()
})

/** 选择认证材料(图片或视频),逐个上传 */
async function handlePickCert() {
  if (uploading.value)
    return
  const remaining = CERT_FILES_MAX - files.value.length
  if (remaining <= 0) {
    uni.showToast({ title: `最多 ${CERT_FILES_MAX} 个文件`, icon: 'none' })
    return
  }
  try {
    const chosen = await chooseImages(remaining, { prefix: 'cert', mediaType: ['image', 'video'] })
    if (chosen.length === 0)
      return
    uploading.value = true
    const uploaded: CertificationFile[] = []
    for (const { file, name } of chosen) {
      try {
        const result = await uploadFileToCos({ file, name, purpose: 'generic' })
        uploaded.push({
          url: result.url,
          key: result.key,
          size: result.size,
          mimeType: result.mimeType,
          originalName: result.originalName,
        })
      }
      catch (e) {
        console.warn('[teacher-cert] cert upload failed:', e)
      }
    }
    if (uploaded.length === 0) {
      uni.showToast({ title: '上传失败,请重试', icon: 'none' })
      return
    }
    files.value = [...files.value, ...uploaded].slice(0, CERT_FILES_MAX)
    uni.showToast({ title: `已上传 ${uploaded.length} 个文件`, icon: 'success' })
  }
  catch (e) {
    const err = e as Error & { errMsg?: string }
    uni.showToast({ title: err?.message || '选择文件失败', icon: 'none' })
  }
  finally {
    uploading.value = false
  }
}

/** 删除指定认证材料 */
function handleRemoveCert(idx: number) {
  files.value = files.value.filter((_, i) => i !== idx)
}

/** 选择身份证图片(仅图片,单张),side 区分正反面 */
async function handlePickIdCard(side: 'front' | 'back') {
  if (uploading.value)
    return
  try {
    const chosen = await chooseImages(1, { prefix: `idcard-${side}` })
    if (chosen.length === 0)
      return
    uploading.value = true
    const { file, name } = chosen[0]
    const result = await uploadFileToCos({ file, name, purpose: 'generic' })
    const cert: CertificationFile = {
      url: result.url,
      key: result.key,
      size: result.size,
      mimeType: result.mimeType,
      originalName: result.originalName,
    }
    if (side === 'front')
      idCardFront.value = cert
    else idCardBack.value = cert
    uni.showToast({ title: '上传成功', icon: 'success' })
  }
  catch (e) {
    const err = e as Error & { errMsg?: string }
    uni.showToast({ title: err?.message || '上传失败', icon: 'none' })
  }
  finally {
    uploading.value = false
  }
}

/** 移除身份证图片 */
function handleRemoveIdCard(side: 'front' | 'back') {
  if (side === 'front')
    idCardFront.value = null
  else idCardBack.value = null
}

/** 提交认证申请 */
async function handleSubmit() {
  if (files.value.length < CERT_FILES_MIN) {
    uni.showToast({ title: `请至少上传 ${CERT_FILES_MIN} 个认证材料`, icon: 'none' })
    return
  }
  if (!idCardFront.value || !idCardBack.value) {
    uni.showToast({ title: '请上传身份证正反面', icon: 'none' })
    return
  }
  if (submitting.value)
    return
  submitting.value = true
  try {
    await submitTeacherApplication(files.value, idCardFront.value, idCardBack.value)
    uni.showToast({ title: '提交成功,请等待审核', icon: 'success' })
    // 刷新申请状态并清空表单
    files.value = []
    idCardFront.value = null
    idCardBack.value = null
    await loadApplication()
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '提交失败', icon: 'none' })
  }
  finally {
    submitting.value = false
  }
}

/** 重新提交(驳回后) */
function handleRetry() {
  application.value = null
  files.value = []
  idCardFront.value = null
  idCardBack.value = null
}

/** 跳转创建圈子页(先刷新角色,避免创建页守卫误判) */
async function handleGoCreateCircle() {
  const role = userStore.userInfo?.role
  if (role !== 'TEACHER' && role !== 'ADMIN') {
    try {
      await userStore.fetchUserInfo()
    }
    catch {
      // 静默:刷新失败时仍前往,创建页守卫会兜底
    }
  }
  uni.navigateTo({ url: '/pages/create-circle/create-circle' })
}
</script>

<template>
  <view class="flex flex-col pb-40">
    <!-- ====== 标题区 ====== -->
    <view class="mx-4 mt-4 rounded-2xl bg-[#018d71] p-5">
      <text class="block text-lg text-white font-semibold">
        教师认证
      </text>
      <text class="mt-1 block text-xs text-white/80 leading-5">
        上传身份证与资质证书,通过审核后即可成为认证教师,创建自己的圈子
      </text>
    </view>

    <!-- ====== 加载中 ====== -->
    <view v-if="loading" class="flex flex-col items-center pt-24">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <!-- ====== 已是 TEACHER / ADMIN ====== -->
    <view v-else-if="isCertified" class="mx-4 mt-3 rounded-2xl bg-white p-5">
      <view class="flex items-center gap-2">
        <view class="h-2 w-2 rounded-full bg-[#00b42a]" />
        <text class="text-base text-[#00b42a] font-medium">
          已认证
        </text>
      </view>
      <text class="mt-2 block text-sm text-[#666] leading-6">
        您已是认证教师,可以创建和管理圈子
      </text>
      <wd-button
        block
        @click="handleGoCreateCircle"
      >
        去创建圈子
      </wd-button>
    </view>

    <!-- ====== 已有申请记录 ====== -->
    <view v-else-if="application" class="mx-4 mt-3 rounded-2xl bg-white p-5">
      <view class="flex items-center gap-2">
        <view
          class="h-2 w-2 rounded-full"
          :style="{ backgroundColor: STATUS_MAP[application.status]?.color ?? '#86909c' }"
        />
        <text
          class="text-base font-medium"
          :style="{ color: STATUS_MAP[application.status]?.color ?? '#86909c' }"
        >
          {{ STATUS_MAP[application.status]?.text ?? application.status }}
        </text>
      </view>

      <!-- 已通过 -->
      <template v-if="application.status === 'approved'">
        <text class="mt-2 block text-sm text-[#666] leading-6">
          恭喜!您的教师认证已通过,现在可以创建圈子了
        </text>
        <wd-button
          block
          @click="handleGoCreateCircle"
        >
          去创建圈子
        </wd-button>
      </template>

      <!-- 审核中 -->
      <text v-else-if="application.status === 'pending'" class="mt-2 block text-sm text-[#666] leading-6">
        您的认证申请正在审核中,请耐心等待管理员审核
      </text>

      <!-- 已驳回 -->
      <template v-else-if="application.status === 'rejected'">
        <text class="mt-2 block text-sm text-[#666] leading-6">
          您的认证申请已被驳回{{ application.reviewNote ? `:${application.reviewNote}` : ',请根据要求重新提交' }}
        </text>
        <wd-button
          block
          @click="handleRetry"
        >
          重新提交
        </wd-button>
      </template>

      <!-- 已提交材料展示 -->
      <view
        v-if="application.files?.length > 0 || application.idCardFront || application.idCardBack"
        class="mt-4 border-t border-[#f5f5f5] pt-4"
      >
        <text class="block text-sm text-[#333] font-medium">
          已提交材料
        </text>

        <!-- 身份证正反面 -->
        <view v-if="application.idCardFront || application.idCardBack" class="mt-3 flex gap-2">
          <image
            v-if="application.idCardFront"
            :src="application.idCardFront.url"
            class="h-20 w-20 rounded-lg"
            mode="aspectFill"
          />
          <image
            v-if="application.idCardBack"
            :src="application.idCardBack.url"
            class="h-20 w-20 rounded-lg"
            mode="aspectFill"
          />
        </view>

        <!-- 认证材料 -->
        <view v-if="application.files?.length > 0" class="mt-3 flex flex-wrap gap-2">
          <view
            v-for="f in application.files"
            :key="f.key"
            class="h-20 w-20 flex items-center justify-center overflow-hidden rounded-lg bg-[#f5f6f7]"
          >
            <image
              v-if="f.mimeType.startsWith('image/')"
              :src="f.url"
              class="h-full w-full"
              mode="aspectFill"
            />
            <text v-else class="text-lg">
              🎬
            </text>
          </view>
        </view>
      </view>
    </view>

    <!-- ====== 未申请:上传表单 ====== -->
    <template v-else>
      <!-- 身份证正反面(必填) -->
      <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
        <view class="flex items-center justify-between">
          <text class="text-sm text-[#333] font-medium">
            身份证正反面 <text class="text-[#f53f3f]">*</text>
          </text>
        </view>
        <text class="mt-1 block text-xs text-[#999]">
          请上传清晰的身份证照片(人像面 + 国徽面),仅支持图片
        </text>
        <view class="mt-3 flex gap-2">
          <!-- 人像面 -->
          <view v-if="idCardFront" class="relative h-20 w-20 overflow-hidden rounded-lg">
            <image :src="idCardFront.url" class="h-full w-full" mode="aspectFill" />
            <view
              class="absolute right-0 top-0 h-5 w-5 flex items-center justify-center rounded-bl-lg bg-black/50"
              @click="handleRemoveIdCard('front')"
            >
              <text class="text-xs text-white">×</text>
            </view>
          </view>
          <view
            v-else
            class="h-20 w-20 flex flex-col items-center justify-center border border-[#e0e0e0] rounded-lg border-dashed bg-[#fafafa]"
            @click="handlePickIdCard('front')"
          >
            <text class="text-2xl text-[#ccc]">＋</text>
            <text class="mt-0.5 text-xs text-[#999]">人像面</text>
          </view>
          <!-- 国徽面 -->
          <view v-if="idCardBack" class="relative h-20 w-20 overflow-hidden rounded-lg">
            <image :src="idCardBack.url" class="h-full w-full" mode="aspectFill" />
            <view
              class="absolute right-0 top-0 h-5 w-5 flex items-center justify-center rounded-bl-lg bg-black/50"
              @click="handleRemoveIdCard('back')"
            >
              <text class="text-xs text-white">×</text>
            </view>
          </view>
          <view
            v-else
            class="h-20 w-20 flex flex-col items-center justify-center border border-[#e0e0e0] rounded-lg border-dashed bg-[#fafafa]"
            @click="handlePickIdCard('back')"
          >
            <text class="text-2xl text-[#ccc]">＋</text>
            <text class="mt-0.5 text-xs text-[#999]">国徽面</text>
          </view>
        </view>
      </view>

      <!-- 认证材料 -->
      <view class="mx-4 mt-3 rounded-2xl bg-white p-4">
        <view class="flex items-center justify-between">
          <text class="text-sm text-[#333] font-medium">
            上传认证材料 <text class="text-[#f53f3f]">*</text>
          </text>
          <text class="text-xs text-[#999]">{{ files.length }}/{{ CERT_FILES_MAX }}</text>
        </view>
        <text class="mt-1 block text-xs text-[#999]">
          支持图片或视频,共 {{ CERT_FILES_MIN }}-{{ CERT_FILES_MAX }} 个文件
        </text>
        <view class="mt-3 flex flex-wrap gap-2">
          <view
            v-for="(f, idx) in files"
            :key="f.key"
            class="relative h-20 w-20 overflow-hidden rounded-lg"
          >
            <image
              v-if="f.mimeType.startsWith('image/')"
              :src="f.url"
              class="h-full w-full"
              mode="aspectFill"
            />
            <view v-else class="h-full w-full flex items-center justify-center bg-[#f5f6f7]">
              <text class="text-lg">🎬</text>
            </view>
            <view
              class="absolute right-0 top-0 h-5 w-5 flex items-center justify-center rounded-bl-lg bg-black/50"
              @click="handleRemoveCert(idx)"
            >
              <text class="text-xs text-white">×</text>
            </view>
          </view>
          <view
            v-if="files.length < CERT_FILES_MAX"
            class="h-20 w-20 flex flex-col items-center justify-center border border-[#e0e0e0] rounded-lg border-dashed bg-[#fafafa]"
            @click="handlePickCert"
          >
            <text class="text-2xl text-[#ccc]">+</text>
            <text class="mt-0.5 text-xs text-[#999]">{{ uploading ? '上传中' : '添加' }}</text>
          </view>
        </view>
      </view>
    </template>

    <!-- ====== 底部提交按钮(仅未申请状态) ====== -->
    <view v-if="!isCertified && !application" class="border-t border-[#f0f0f0] bg-white px-4 py-3 pb-safe">
      <wd-button
        block
        :loading="submitting"
        :disabled="!canSubmit"
        @click="handleSubmit"
      >
        提交认证
      </wd-button>
      <text v-if="!idCardFront || !idCardBack || files.length === 0" class="mt-2 block text-center text-xs text-[#999]">
        请上传身份证正反面及至少 {{ CERT_FILES_MIN }} 个认证材料
      </text>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
