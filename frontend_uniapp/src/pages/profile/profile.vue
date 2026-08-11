<script lang="ts" setup>
import { computed, reactive, ref } from 'vue'
import { useUserStore } from '@/store/user'
import { getMyProfile, updateMyProfile, updateProfile, verifyPhoneBind } from '@/api/auth'
import { sendSmsCode } from '@/api/login'
import { uploadFile } from '@/api/upload'
import { LOGIN_PAGE } from '@/router/config'
import { useToast } from '@wot-ui/ui/components/wd-toast'
import type { UpdateMyProfileInput, UpdateProfileInput } from '@/api/types/login'
import type { FormInstance, FormSchema } from '@wot-ui/ui/components/wd-form/types'

// #ifdef H5
import H5LocationPicker from '@/components/H5LocationPicker/H5LocationPicker.vue'
// #endif

definePage({
  style: {
    navigationBarTitleText: '个人资料',
  },
})

/** 邮箱基础校验(与服务端 zod email() 一致:有 @ 与 .) */
const EMAIL_RE = /^[^\s@]+@[^\s@][^\s.@]*\.[^\s@]+$/
/** 手机号校验(与服务端一致) */
const PHONE_RE = /^1[3-9]\d{9}$/
/** 短信验证码长度 */
const CODE_LEN = 6
/** 验证码倒计时秒数 */
const COUNTDOWN = 60

const userStore = useUserStore()
const user = computed(() => userStore.userInfo)
const toast = useToast()

// ===== 页面状态 =====
const loading = ref(true)
const editMode = ref(false)
const submitting = ref(false)
const uploading = ref(false)

// ===== 表单状态(编辑模式回填;手机号走独立弹层流程) =====
const form = reactive({
  name: '',
  email: '',
  address: '',
  latitude: null as number | null,
  longitude: null as number | null,
})
const avatarUrl = ref('')

// ===== 头像裁剪状态 =====
const cropVisible = ref(false)
const cropSrc = ref('')
const formRef = ref<FormInstance>()

// ===== 地址选择状态(H5 弹层 / 小程序原生) =====
const pickerVisible = ref(false)

// ===== 手机号修改弹层状态 =====
const phonePopupVisible = ref(false)
const newPhone = ref('')
const smsCode = ref('')
const countdown = ref(0)
const sendingCode = ref(false)
const bindingPhone = ref(false)
let countdownTimer: ReturnType<typeof setInterval> | null = null

/** wd-form 校验 schema(与后端 zod 规则对齐;手机号不在此表单内) */
const formSchema: FormSchema = {
  validate: (model) => {
    const issues: Array<{ path: Array<string | number>, message: string }> = []
    const name = String(model.name ?? '').trim()
    if (!name) {
      issues.push({ path: ['name'], message: '昵称不能为空' })
    }
    else if (name.length > 100) {
      issues.push({ path: ['name'], message: '昵称最长 100 字符' })
    }
    const email = String(model.email ?? '').trim()
    if (email && !EMAIL_RE.test(email)) {
      issues.push({ path: ['email'], message: '邮箱格式不正确' })
    }
    // 地址由地图选点组件回填,无需格式校验(选点返回的地址天然 <=200 字符)
    return issues
  },
  isRequired: path => path === 'name',
}

/** 从 store 回填表单初值 */
function fillFromUser() {
  const u = user.value
  if (!u)
    return
  form.name = u.name ?? ''
  form.email = u.email ?? ''
  form.address = u.address ?? ''
  form.latitude = u.location?.latitude ?? null
  form.longitude = u.location?.longitude ?? null
  avatarUrl.value = u.avatarUrl ?? u.avatar ?? ''
}

/** 页面卸载时清理验证码倒计时 */
onUnload(() => {
  if (countdownTimer) {
    clearInterval(countdownTimer)
    countdownTimer = null
  }
})

/** 未登录守卫 + 进入时刷新完整资料(含 phone / address) */
onShow(() => {
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: LOGIN_PAGE })
    return
  }
  getMyProfile()
    .then((profile) => {
      userStore.setProfile(profile)
      fillFromUser()
    })
    .catch(() => {
      // token 失效由拦截器处理;这里回退到 store 已有数据
      fillFromUser()
    })
    .finally(() => {
      loading.value = false
    })
})

// ===== 头像上传与裁剪 =====
/** 从 tempFilePath 推断文件名(裁剪后无扩展名时兜底) */
function deriveFilenameFromPath(p: string): string {
  if (!p)
    return 'avatar.jpg'
  const seg = p.split('/').pop() ?? 'avatar.jpg'
  return seg.includes('.') ? seg : `${seg}.jpg`
}

/** 执行头像上传(裁剪后路径 → 后端 → 回填预览) */
async function doUpload(file: string | File, filename: string) {
  uploading.value = true
  try {
    const { url } = await uploadFile({ file, name: filename, purpose: 'avatar' })
    avatarUrl.value = url
    toast.show({ msg: '头像已上传,保存后生效', iconName: 'success' })
  }
  catch (e) {
    toast.show({ msg: (e as Error).message || '头像上传失败', iconName: 'error' })
  }
  finally {
    uploading.value = false
  }
}

/** 选择图片 → 打开 1:1 裁剪弹层(小程序用 chooseMedia,H5 用 chooseImage) */
async function handlePickAvatar() {
  if (uploading.value)
    return
  try {
    let src = ''
    // #ifdef MP-WEIXIN
    const res = await uni.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      maxDuration: 30,
      camera: 'back',
    })
    const f = (res as any)?.tempFiles?.[0]
    src = f?.tempFilePath ?? ''
    // #endif
    // #ifdef H5
    const h5Res = await uni.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
    })
    const h5Path = (h5Res as any)?.tempFilePaths?.[0] ?? ''
    // H5 端 chooseImage 的 path 是 blob URL,可直接用于 image 与上传
    src = h5Path
    // #endif
    if (!src)
      return
    cropSrc.value = src
    cropVisible.value = true
  }
  catch (e) {
    // 用户取消选择时选择 API 会 reject,这里静默
    const err = e as Error & { errMsg?: string }
    if (err?.errMsg && /cancel/i.test(err.errMsg))
      return
    toast.show({ msg: `选择图片失败: ${err.message}`, iconName: 'error' })
  }
}

/** 裁剪确认:拿到裁剪产物 → 上传 → 回填预览 */
function handleCropConfirm(result: { tempFilePath: string, width: number, height: number }) {
  cropVisible.value = false
  const tempPath = result.tempFilePath
  if (!tempPath)
    return
  const filename = deriveFilenameFromPath(tempPath)
  doUpload(tempPath, filename)
}

/** 清除头像(空串在保存时由后端归一为 null) */
function handleClearAvatar() {
  avatarUrl.value = ''
}

// ===== 查看模式展示 =====
const avatarFallback = computed(() => (user.value?.name ? user.value.name[0] : '游'))

const roleInfo = computed<{ text: string, type: 'warning' | 'primary' | 'danger' }>(() => {
  const role = user.value?.role
  if (role === 'TEACHER')
    return { text: '传承人', type: 'warning' }
  if (role === 'ADMIN')
    return { text: '管理员', type: 'danger' }
  return { text: '爱好者', type: 'primary' }
})

const roleChipClass = computed(() => {
  if (roleInfo.value.type === 'warning')
    return 'text-[#e68a00]'
  if (roleInfo.value.type === 'danger')
    return 'text-[#ff4d4f]'
  return 'text-[#018d71]'
})

const displayPhone = computed(() => {
  if (user.value?.phone)
    return user.value.phone
  // 手机号登录用户 email 形如 13800138000@phonedomain.com
  const m = /^(\d{11})@/.exec(user.value?.email ?? '')
  return m ? m[1] : '未绑定'
})

const displayAddress = computed(() => user.value?.address || '未设置')

// ===== 编辑模式 =====
function enterEdit() {
  fillFromUser()
  editMode.value = true
}

function cancelEdit() {
  formRef.value?.reset()
  fillFromUser()
  editMode.value = false
}

/** 是否有未保存变更(无变更时禁用保存按钮;手机号走独立弹层即时保存) */
const isDirty = computed(() => {
  const u = user.value
  if (!u)
    return false
  return (
    form.name.trim() !== (u.name ?? '')
    || form.email.trim() !== (u.email ?? '')
    || form.address.trim() !== (u.address ?? '')
    || avatarUrl.value !== (u.avatarUrl ?? u.avatar ?? '')
  )
})

/** 提交保存:表单校验 → 按字段分流 → 并行请求 → 同步 store */
async function handleSave() {
  if (submitting.value)
    return

  // 1. 表单校验(失败时 toast 首个错误 + 行内错误提示)
  const result = formRef.value ? await formRef.value.validate() : { valid: true, errors: [] as Array<{ prop: string, message: string }> }
  if (!result.valid) {
    toast.show({ msg: result.errors[0]?.message ?? '请检查表单内容', iconName: 'error' })
    return
  }

  // 2. 按字段分组:name/email/avatarUrl → PATCH /api/auth/me;address → PATCH /api/users/me/profile
  const trimmedName = form.name.trim()
  const trimmedEmail = form.email.trim()
  const trimmedAddress = form.address.trim()

  const authPatch: UpdateMyProfileInput = {}
  if (trimmedName !== (user.value?.name ?? ''))
    authPatch.name = trimmedName
  if (trimmedEmail !== (user.value?.email ?? ''))
    authPatch.email = trimmedEmail
  if (avatarUrl.value !== (user.value?.avatarUrl ?? user.value?.avatar ?? '')) {
    authPatch.avatarUrl = avatarUrl.value
  }

  const profilePatch: UpdateProfileInput = {}
  if (trimmedAddress !== (user.value?.address ?? '')) {
    profilePatch.address = trimmedAddress
    // 地址变更时同步经纬度;地址被清空则一并清空坐标
    profilePatch.latitude = form.latitude
    profilePatch.longitude = form.longitude
  }

  if (Object.keys(authPatch).length === 0 && Object.keys(profilePatch).length === 0) {
    toast.show({ msg: '未做修改', iconName: 'info' })
    return
  }

  // 3. 并行提交两个独立请求
  submitting.value = true
  try {
    const tasks: Array<Promise<unknown>> = []
    if (Object.keys(authPatch).length > 0)
      tasks.push(updateMyProfile(authPatch))
    if (Object.keys(profilePatch).length > 0)
      tasks.push(updateProfile(profilePatch))
    await Promise.all(tasks)

    // 4. 用后端最新资料同步 store(避免两端不一致),并回填表单
    const fresh = await getMyProfile()
    userStore.setProfile(fresh)
    fillFromUser()
    toast.show({ msg: '保存成功', iconName: 'success' })
    editMode.value = false
  }
  catch (e) {
    toast.show({ msg: (e as Error).message || '保存失败,请重试', iconName: 'error' })
    // 任一失败即刷新,避免表单与 store 数据不一致
    getMyProfile()
      .then((p) => {
        userStore.setProfile(p)
        fillFromUser()
      })
      .catch(() => {})
  }
  finally {
    submitting.value = false
  }
}

// ===== 地址选择(H5 用地图选点弹层,小程序用原生 chooseLocation) =====
/** 打开地址选择器 */
async function handleChooseLocation() {
  // #ifdef H5
  pickerVisible.value = true
  // #endif
  // #ifndef H5
  try {
    const res = await uni.chooseLocation({})
    form.address = res.address || res.name || '已选择位置'
    form.latitude = res.latitude
    form.longitude = res.longitude
  }
  catch (e) {
    const err = e as Error & { errMsg?: string }
    // 用户取消选点静默
    if (err?.errMsg && /cancel/i.test(err.errMsg))
      return
    toast.show({ msg: err?.message || '选择位置失败,请检查授权', iconName: 'error' })
  }
  // #endif
}

/** H5 地图选点弹层确认回调 */
function handlePickerConfirm(loc: { latitude: number, longitude: number, address: string }) {
  form.address = loc.address
  form.latitude = loc.latitude
  form.longitude = loc.longitude
  pickerVisible.value = false
}

/** 清除地址(连同经纬度) */
function handleClearAddress() {
  form.address = ''
  form.latitude = null
  form.longitude = null
}

// ===== 手机号修改弹层 =====
/** 打开修改手机号弹层 */
function openPhonePopup() {
  newPhone.value = user.value?.phone ?? ''
  smsCode.value = ''
  phonePopupVisible.value = true
}

/** 关闭修改手机号弹层(不中断倒计时,允许再次进入时续用) */
function closePhonePopup() {
  phonePopupVisible.value = false
}

/** 发送验证码到新手机号(先校验格式 → 请求 → 启动 60s 倒计时) */
async function handleSendCode() {
  const phone = newPhone.value.trim()
  if (!PHONE_RE.test(phone)) {
    toast.show({ msg: '请输入正确的手机号', iconName: 'error' })
    return
  }
  if (sendingCode.value || countdown.value > 0)
    return

  sendingCode.value = true
  try {
    await sendSmsCode(phone)
    toast.show({ msg: '验证码已发送', iconName: 'success' })
    countdown.value = COUNTDOWN
    if (countdownTimer)
      clearInterval(countdownTimer)
    countdownTimer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0 && countdownTimer) {
        clearInterval(countdownTimer)
        countdownTimer = null
      }
    }, 1000)
  }
  catch (e) {
    toast.show({ msg: (e as Error).message || '验证码发送失败', iconName: 'error' })
  }
  finally {
    sendingCode.value = false
  }
}

/** 确认绑定:校验验证码 → 调接口 → 同步 store → 关闭弹层 */
async function handleBindPhone() {
  const phone = newPhone.value.trim()
  const code = smsCode.value.trim()

  if (!PHONE_RE.test(phone)) {
    toast.show({ msg: '请输入正确的手机号', iconName: 'error' })
    return
  }
  if (code.length !== CODE_LEN) {
    toast.show({ msg: `请输入 ${CODE_LEN} 位验证码`, iconName: 'error' })
    return
  }
  if (bindingPhone.value)
    return

  bindingPhone.value = true
  try {
    const profile = await verifyPhoneBind(phone, code)
    userStore.setProfile(profile)
    fillFromUser()
    toast.show({ msg: '手机号绑定成功', iconName: 'success' })
    phonePopupVisible.value = false
  }
  catch (e) {
    toast.show({ msg: (e as Error).message || '绑定失败,请重试', iconName: 'error' })
  }
  finally {
    bindingPhone.value = false
  }
}
</script>

<template>
  <view class="relative min-h-screen bg-[#f7f8fa] pb-20">
    <wd-toast />

    <!-- 加载骨架屏 -->
    <wd-skeleton
      v-if="loading"
      :row-col="[1, 1, 1, 2]"
      animation="gradient"
      custom-class="rounded-2xl"
    />

    <template v-else>
      <!-- ===== 沉浸式 Header(青绿渐变 + 装饰圆 + 大头像) ===== -->
      <view class="relative flex flex-col items-center overflow-hidden rounded-b-[32px] from-[#018d71] via-[#0aa07f] to-[#34c19a] bg-gradient-to-br px-6 pb-[72px] pt-14 shadow-[0_8px_24px_rgba(1,141,113,0.18)]">
        <!-- 装饰圆 -->
        <view class="pointer-events-none absolute size-[220px] rounded-full bg-white/10 -right-[60px] -top-20" />
        <view class="pointer-events-none absolute size-[160px] rounded-full bg-white/[0.06] -bottom-[50px] -left-10" />

        <!-- 头像 -->
        <view class="relative mb-4 h-24 w-24 flex items-center justify-center overflow-hidden border-4 border-white rounded-full bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-transform duration-200 active:scale-[0.96]">
          <image v-if="avatarUrl" :src="avatarUrl" class="h-full w-full" mode="aspectFill" />
          <text v-else class="text-[40px] text-[#018d71] font-semibold leading-none">
            {{ avatarFallback }}
          </text>
          <view v-if="uploading" class="absolute inset-0 flex items-center justify-center rounded-full bg-black/30">
            <wd-loading color="#ffffff" size="20" />
          </view>
          <view v-if="editMode" class="absolute h-7 w-7 flex items-center justify-center rounded-full bg-white text-sm shadow-[0_2px_8px_rgba(0,0,0,0.15)] -bottom-[2px] -right-[2px]">
            <text>📷</text>
          </view>
        </view>

        <!-- 姓名 + 角色徽标 -->
        <view class="mb-1.5 flex items-center gap-2">
          <text class="text-[22px] text-white font-semibold leading-tight">
            {{ user?.name }}
          </text>
          <text class="rounded-full bg-white/90 px-2 py-[3px] text-[11px] font-medium" :class="roleChipClass">
            {{ roleInfo.text }}
          </text>
        </view>

        <text class="mt-0.5 text-[13px] text-white/85">
          {{ user?.email }}
        </text>

        <!-- 提示语 -->
        <view v-if="editMode" class="mt-3 flex items-center gap-3 text-[12px] text-white/70">
          <text>点击头像更换照片</text>
          <text
            v-if="avatarUrl"
            class="cursor-pointer underline"
            @click="handleClearAvatar"
          >
            移除头像
          </text>
        </view>
        <text v-else class="mt-3 text-[12px] text-white/70">点击头像更换照片</text>
      </view>

      <!-- ===== 信息卡片(浮在 Header 底部,负 margin) ===== -->
      <view class="mx-4 mt-4 md:mx-6">
        <view class="rounded-[20px] bg-white shadow-[0_6px_24px_rgba(0,0,0,0.06)]">
          <!-- 查看模式 -->
          <view v-if="!editMode" class="px-5 pb-3 pt-5">
            <text class="mb-3 text-[13px] text-[#999] font-semibold tracking-[0.5px]">基本信息</text>

            <view class="flex items-center gap-3.5 py-3">
              <view class="h-10 w-10 flex shrink-0 items-center justify-center rounded-xl bg-[#e8f5f1] text-[18px] text-[#018d71]">
                <text>✉</text>
              </view>
              <view class="min-w-0 flex flex-1 flex-col gap-0.5">
                <text class="text-xs text-[#999]">邮箱</text>
                <text class="break-all text-[15px] text-[#333] font-medium">{{ user?.email }}</text>
              </view>
            </view>
            <view class="mx-3 h-px bg-[#f5f5f5]" />

            <view class="flex items-center gap-3.5 py-3">
              <view class="h-10 w-10 flex shrink-0 items-center justify-center rounded-xl bg-[#fff7e6] text-[18px] text-[#e68a00]">
                <text>☎</text>
              </view>
              <view class="min-w-0 flex flex-1 flex-col gap-0.5">
                <text class="text-xs text-[#999]">手机号</text>
                <text class="break-all text-[15px] text-[#333] font-medium">{{ displayPhone }}</text>
              </view>
            </view>
            <view class="mx-3 h-px bg-[#f5f5f5]" />

            <view class="flex items-center gap-3.5 py-3">
              <view class="h-10 w-10 flex shrink-0 items-center justify-center rounded-xl bg-[#e6f0ff] text-[18px] text-[#1677ff]">
                <text>◉</text>
              </view>
              <view class="min-w-0 flex flex-1 flex-col gap-0.5">
                <text class="text-xs text-[#999]">地址</text>
                <text class="break-all text-[15px] text-[#333] font-medium">{{ displayAddress }}</text>
              </view>
            </view>
          </view>

          <!-- 编辑模式:表单卡片 -->
          <view v-else class="px-5 pb-3 pt-5">
            <text class="mb-3 text-[13px] text-[#999] font-semibold tracking-[0.5px]">编辑资料</text>
            <wd-form ref="formRef" :model="form" :schema="formSchema" error-type="message">
              <wd-form-item prop="name" title="昵称" required>
                <wd-input v-model="form.name" placeholder="请输入昵称" :maxlength="100" clearable compact />
              </wd-form-item>
              <wd-form-item prop="email" title="邮箱">
                <wd-input v-model="form.email" placeholder="请输入邮箱" inputmode="email" clearable compact />
              </wd-form-item>
            </wd-form>

            <!-- 地址独立区块:点击打开地图选点组件(非手动输入) -->
            <view class="my-2 border-t border-[#f5f5f5] pt-2">
              <view class="flex items-center justify-between py-2" @click="handleChooseLocation">
                <view class="flex items-center gap-2">
                  <view class="h-8 w-8 flex shrink-0 items-center justify-center rounded-lg bg-[#e6f0ff] text-sm text-[#1677ff]">
                    <text>◉</text>
                  </view>
                  <view class="min-w-0 flex flex-1 flex-col gap-0.5">
                    <text class="text-xs text-[#999]">地址</text>
                    <text class="line-clamp-2 break-all text-sm text-[#333] font-medium">
                      {{ form.address || '点击选择地址' }}
                    </text>
                  </view>
                </view>
                <view class="flex shrink-0 items-center gap-2">
                  <text v-if="form.address" class="cursor-pointer text-xs text-[#ff4d4f]" @click.stop="handleClearAddress">
                    清除
                  </text>
                  <text class="cursor-pointer text-xs text-[#018d71]">选择 ›</text>
                </view>
              </view>
            </view>

            <!-- 手机号独立区块:点击弹层经短信验证码绑定 -->
            <view class="my-2 border-t border-[#f5f5f5] pt-2">
              <view class="flex items-center justify-between py-2">
                <view class="flex items-center gap-2">
                  <view class="h-8 w-8 flex shrink-0 items-center justify-center rounded-lg bg-[#fff7e6] text-sm text-[#e68a00]">
                    <text>☎</text>
                  </view>
                  <view class="flex flex-col">
                    <text class="text-xs text-[#999]">手机号</text>
                    <text class="text-sm text-[#333] font-medium">{{ displayPhone }}</text>
                  </view>
                </view>
                <text class="cursor-pointer text-xs text-[#018d71]" @click="openPhonePopup">
                  修改手机号
                </text>
              </view>
            </view>

            <view class="pb-1 pt-1 text-xs text-[#999] leading-[1.6]">
              修改邮箱后再次登录将使用新邮箱;昵称最长 100 字符;地址点击地图选点,保存后同步定位。
            </view>
          </view>
        </view>
      </view>

      <!-- ===== 底部操作区 ===== -->
      <view class="flex gap-3 px-4 pt-6 md:px-6">
        <wd-button
          v-if="!editMode"

          round block
          size="large"
          class="border-0 from-[#018d71] to-[#0aa07f] bg-gradient-to-br shadow-[0_6px_18px_rgba(1,141,113,0.28)] transition-(transform,box-shadow) duration-200 active:translate-y-px text-white! active:shadow-[0_2px_8px_rgba(1,141,113,0.32)]"
          @click="enterEdit"
        >
          编辑资料
        </wd-button>
        <template v-else>
          <wd-button
            class="flex-1 border border-[#e5e5e5]! bg-white! text-[#666]!"
            round
            size="large"
            variant="plain"
            @click="cancelEdit"
          >
            取消
          </wd-button>
          <wd-button

            round block
            size="large"
            class="flex-1 border-0 from-[#018d71] to-[#0aa07f] bg-gradient-to-br shadow-[0_6px_18px_rgba(1,141,113,0.28)] transition-(transform,box-shadow) duration-200 active:translate-y-px text-white! disabled:opacity-50 active:shadow-[0_2px_8px_rgba(1,141,113,0.32)]"
            :loading="submitting"
            :disabled="!isDirty"
            @click="handleSave"
          >
            保存
          </wd-button>
        </template>
      </view>
    </template>

    <!-- 头像裁剪弹层(1:1) -->
    <wd-img-cropper
      v-model="cropVisible"
      :img-src="cropSrc"
      aspect-ratio="1:1"
      file-type="jpg"
      :quality="0.9"
      :export-scale="2"
      @confirm="handleCropConfirm"
    />

    <!-- 修改手机号弹层 -->
    <wd-popup
      v-model="phonePopupVisible"
      position="center"
      round
      :modal="true"
      close-on-click-modal
      @update:model-value="closePhonePopup"
    >
      <view class="w-[320px] px-5 pb-6 pt-5 md:w-[380px]">
        <text class="block text-center text-base text-[#333] font-semibold">修改手机号</text>
        <text class="mt-1 block text-center text-xs text-[#999]">
          验证码将发送至新手机号,验证通过后完成绑定
        </text>

        <!-- 新手机号 -->
        <view class="mt-5">
          <view class="flex items-center gap-2">
            <wd-input
              v-model="newPhone"
              type="tel"
              :maxlength="11"
              placeholder="请输入新手机号"
              clearable
              :disabled="bindingPhone"
            />
            <wd-button
              size="small"
              :disabled="countdown > 0 || sendingCode"
              :loading="sendingCode"
              @click="handleSendCode"
            >
              {{ countdown > 0 ? `${countdown}s后重发` : '获取验证码' }}
            </wd-button>
          </view>
        </view>

        <!-- 验证码 -->
        <view class="mt-3">
          <wd-input
            v-model="smsCode"
            type="tel"
            :maxlength="6"
            placeholder="请输入 6 位验证码"
            clearable
            :disabled="bindingPhone"
          />
        </view>

        <!-- 操作按钮 -->
        <view class="mt-6 flex gap-3">
          <wd-button
            class="flex-1 border border-[#e5e5e5]! bg-white! text-[#666]!"
            round
            size="medium"
            variant="plain"
            @click="closePhonePopup"
          >
            取消
          </wd-button>
          <wd-button
            class="flex-1 border-0 from-[#018d71] to-[#0aa07f] bg-gradient-to-br shadow-[0_6px_18px_rgba(1,141,113,0.28)] text-white!"
            round
            size="medium"
            :loading="bindingPhone"
            @click="handleBindPhone"
          >
            确认绑定
          </wd-button>
        </view>
      </view>
    </wd-popup>

    <!-- H5 端地图选点弹层 -->
    <!-- #ifdef H5 -->
    <H5LocationPicker
      :visible="pickerVisible"
      :initial-lat="form.latitude"
      :initial-lng="form.longitude"
      @confirm="handlePickerConfirm"
      @close="pickerVisible = false"
    />
    <!-- #endif -->
  </view>
</template>
