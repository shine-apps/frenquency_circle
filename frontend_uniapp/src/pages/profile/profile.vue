<script lang="ts" setup>
import { computed, reactive, ref } from 'vue'
import { useUserStore } from '@/store/user'
import { getMyProfile, updateMyProfile, updateProfile, verifyPhoneBind } from '@/api/auth'
import { sendSmsCode } from '@/api/login'
import { uploadFileToCos } from '@/api/upload'
import { chooseImages } from '@/utils/chooseImage'
import { LOGIN_PAGE } from '@/router/config'
import { useToast } from '@wot-ui/ui/components/wd-toast'
import TagSelectorPopup from '@/components/TagSelectorPopup/TagSelectorPopup.vue'
// #ifdef H5
import H5LocationPicker from '@/components/H5LocationPicker/H5LocationPicker.vue'
// #endif

/** 标签展示最大数量(所有端通用,不应被包在 H5 条件编译内) */
const TAG_VISIBLE_LIMIT = 8

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '个人资料',
  },
  excludeLoginPath: false,
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
const uploading = ref(false)
/** 当前正在保存的字段名(同一字段防重复提交;不同字段允许并发) */
const savingField = ref<string | null>(null)

// ===== 表单状态(地址选择用;昵称/邮箱走独立弹层即时保存) =====
const form = reactive({
  address: '',
  latitude: null as number | null,
  longitude: null as number | null,
})
const avatarUrl = ref('')

// ===== 头像裁剪状态 =====
const cropVisible = ref(false)
const cropSrc = ref('')

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

/** 从 store 回填表单初值 */
function fillFromUser() {
  const u = user.value
  if (!u)
    return
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

/** 执行头像上传(裁剪后路径 → 后端 → 回填预览 → 立即保存) */
async function doUpload(file: string | File, filename: string) {
  uploading.value = true
  try {
    const { url } = await uploadFileToCos({ file, name: filename, purpose: 'avatar' })
    avatarUrl.value = url
    await saveField('avatar', '头像', () => updateMyProfile({ avatarUrl: url }))
  }
  catch (e) {
    toast.show({ msg: (e as Error).message || '头像上传失败', iconName: 'error' })
  }
  finally {
    uploading.value = false
  }
}

/** 选择图片 → 打开 1:1 裁剪弹层(H5/小程序均走 chooseImages 公共方法) */
async function handlePickAvatar() {
  if (uploading.value)
    return
  try {
    const chosen = await chooseImages(1, { prefix: 'avatar' })
    // H5 的 file 是 blob URL、小程序是 tempFilePath,均可直接作为裁剪源
    const src = chosen[0]?.file
    if (!src || typeof src !== 'string') {
      // 理论上 file 只会是字符串;若未来平台返回 File 对象,明确提示而非静默失败
      toast.show({ msg: '无法获取所选图片,请重试', iconName: 'error' })
      return
    }
    cropSrc.value = src
    cropVisible.value = true
  }
  catch (e) {
    const err = e as Error & { errMsg?: string }
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

/** 清除头像(空串由后端归一为 null,立即保存) */
function handleClearAvatar() {
  if (savingField.value === 'avatar')
    return
  avatarUrl.value = ''
  saveField('avatar', '头像', () => updateMyProfile({ avatarUrl: '' }))
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
  // 手机号登录用户 email 形如 13800138000@phonedomain.com。
  // 注意:必须用解构而不能写 m[1],否则 dcloudio uni-mp-compiler + unocss
  // 会把 `m[1]` 误识别为 arbitrary class 语法,编译产物里变成 m_a_1_a_ 而运行报错。
  const match = /^(\d{11})@/.exec(user.value?.email ?? '')
  const [, phone] = match ?? []
  return phone ?? '未绑定'
})

/** 我的兴趣展示(最多 8 个 + "+N") */
const myTags = computed(() => user.value?.tags || [])
const tagPreview = computed(() => myTags.value.slice(0, TAG_VISIBLE_LIMIT))
const tagRest = computed(() => Math.max(0, myTags.value.length - TAG_VISIBLE_LIMIT))

/** 兴趣标签选择弹窗显隐 */
const tagPopupVisible = ref(false)

/** 打开兴趣标签选择弹窗 */
function handleGoTags() {
  tagPopupVisible.value = true
}

// ===== 逐项即时保存 =====
/** 逐项保存通用封装:执行 task → 成功刷新 store 并回填本字段;失败 toast + 静默刷新 store */
async function saveField(field: string, label: string, task: () => Promise<unknown>) {
  if (savingField.value === field)
    return
  savingField.value = field
  try {
    await task()
    const fresh = await getMyProfile()
    userStore.setProfile(fresh)
    syncFieldFrom(field, fresh)
    toast.show({ msg: `${label}已保存`, iconName: 'success' })
  }
  catch (e) {
    toast.show({ msg: (e as Error).message || `${label}保存失败,请重试`, iconName: 'error' })
    // 失败只静默刷新 store,不覆盖用户正在编辑的表单值
    getMyProfile().then(p => userStore.setProfile(p)).catch(() => {})
  }
  finally {
    savingField.value = null
  }
}

/** 按字段将最新值回填到 form(只回填当前字段,避免覆盖其它正在编辑的输入) */
function syncFieldFrom(
  field: string,
  fresh: {
    name?: string
    email?: string
    avatarUrl?: string | null
    avatar?: string | null
    address?: string | null
    location?: { latitude: number, longitude: number } | null
  },
) {
  if (field === 'address') {
    form.address = fresh.address ?? ''
    form.latitude = fresh.location?.latitude ?? null
    form.longitude = fresh.location?.longitude ?? null
  }
  else if (field === 'avatar') {
    avatarUrl.value = fresh.avatarUrl ?? fresh.avatar ?? ''
  }
}

// ===== 昵称/邮箱编辑弹层 =====
const namePopupVisible = ref(false)
const editName = ref('')
const emailPopupVisible = ref(false)
const editEmail = ref('')

/** 打开昵称编辑弹层(预填当前值) */
function openNamePopup() {
  editName.value = user.value?.name ?? ''
  namePopupVisible.value = true
}

/** 确认保存昵称:校验 → 有变更则立即保存 */
function handleNameSave() {
  const name = editName.value.trim()
  if (!name) {
    toast.show({ msg: '昵称不能为空', iconName: 'error' })
    return
  }
  if (name.length > 20) {
    toast.show({ msg: '昵称最长 20 字符', iconName: 'error' })
    return
  }
  if (name === (user.value?.name ?? '')) {
    namePopupVisible.value = false
    return
  }
  if (savingField.value === 'name') {
    toast.show({ msg: '昵称保存中,请稍候', iconName: 'info' })
    return
  }
  namePopupVisible.value = false
  saveField('name', '昵称', () => updateMyProfile({ name }))
}

/** 打开邮箱编辑弹层(预填当前值) */
function openEmailPopup() {
  editEmail.value = user.value?.email ?? ''
  emailPopupVisible.value = true
}

/** 确认保存邮箱:校验 → 有变更则立即保存 */
function handleEmailSave() {
  const email = editEmail.value.trim()
  if (email && !EMAIL_RE.test(email)) {
    toast.show({ msg: '邮箱格式不正确', iconName: 'error' })
    return
  }
  if (email === (user.value?.email ?? '')) {
    emailPopupVisible.value = false
    return
  }
  if (savingField.value === 'email') {
    toast.show({ msg: '邮箱保存中,请稍候', iconName: 'info' })
    return
  }
  emailPopupVisible.value = false
  saveField('email', '邮箱', () => updateMyProfile({ email }))
}

/** 地址保存(选点确认 / 清除后调用,地址+经纬度一起提交) */
function saveAddress() {
  saveField('address', '地址', () =>
    updateProfile({
      address: form.address,
      latitude: form.latitude,
      longitude: form.longitude,
    }))
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
    saveAddress()
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
  saveAddress()
}

/** 清除地址(连同经纬度,立即保存) */
function handleClearAddress() {
  form.address = ''
  form.latitude = null
  form.longitude = null
  saveAddress()
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
  <view class="relative pb-20">
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
        <view class="relative mb-4 h-24 w-24 flex items-center justify-center overflow-hidden border-4 border-white rounded-full bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-transform duration-200 active:scale-[0.96]" @click="handlePickAvatar">
          <image v-if="avatarUrl" :src="avatarUrl" class="h-full w-full" mode="aspectFill" />
          <text v-else class="text-[40px] text-[#018d71] font-semibold leading-none">
            {{ avatarFallback }}
          </text>
          <view v-if="uploading" class="absolute inset-0 flex items-center justify-center rounded-full bg-black/30">
            <wd-loading color="#ffffff" size="20" />
          </view>
          <view class="absolute h-7 w-7 flex items-center justify-center rounded-full bg-white text-sm shadow-[0_2px_8px_rgba(0,0,0,0.15)] -bottom-[2px] -right-[2px]">
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
        <view class="mt-3 flex items-center gap-3 text-[12px] text-white/70">
          <text>点击头像更换照片</text>
          <text
            v-if="avatarUrl"
            class="cursor-pointer underline"
            @click="handleClearAvatar"
          >
            移除头像
          </text>
        </view>
      </view>

      <!-- ===== 我的兴趣卡片(浮在 Header 底部) ===== -->
      <view class="mx-4 mt-4 md:mx-6">
        <view class="rounded-[20px] bg-white p-5 shadow-[0_6px_24px_rgba(0,0,0,0.06)]">
          <view class="flex items-center justify-between">
            <text class="text-[13px] text-[#999] font-semibold tracking-[0.5px]">
              我的兴趣
            </text>
            <text class="cursor-pointer text-xs text-[#018d71]" @click="handleGoTags">
              {{ myTags.length > 0 ? '去编辑 ›' : '去选择 ›' }}
            </text>
          </view>
          <view v-if="myTags.length > 0" class="mt-3 flex flex-wrap gap-2">
            <text
              v-for="name in tagPreview"
              :key="name"
              class="rounded-full bg-[#e8f5f1] px-3 py-1 text-xs text-[#018d71]"
            >
              {{ name }}
            </text>
            <text v-if="tagRest > 0" class="rounded-full bg-[#f5f6f7] px-3 py-1 text-xs text-[#999]">
              +{{ tagRest }}
            </text>
          </view>
          <text v-else class="mt-3 block text-sm text-[#999] leading-6">
            未选择兴趣标签,完善后可自动匹配同趣
          </text>
        </view>
      </view>

      <!-- ===== 信息卡片:常驻行内编辑,失焦/确认即保存 ===== -->
      <view class="mx-4 mt-3 md:mx-6">
        <view class="rounded-[20px] bg-white shadow-[0_6px_24px_rgba(0,0,0,0.06)]">
          <view class="px-5 pb-3 pt-5">
            <text class="mb-3 text-[13px] text-[#999] font-semibold tracking-[0.5px]">基本信息</text>

            <!-- 昵称行:点击右侧编辑图标弹层修改 -->
            <view class="flex items-center gap-3.5 py-2">
              <view class="h-10 w-10 flex shrink-0 items-center justify-center rounded-xl bg-[#e8f5f1] text-[18px] text-[#018d71]">
                <text>昵</text>
              </view>
              <view class="min-w-0 flex flex-1 flex-col gap-0.5">
                <text class="text-xs text-[#999]">昵称</text>
                <text class="break-all text-[15px] text-[#333] font-medium">{{ user?.name }}</text>
              </view>
              <view class="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-[#018d71]" @click="openNamePopup">
                <text class="text-sm leading-none">✎</text>
                <text>编辑</text>
              </view>
            </view>
            <view class="mx-3 h-px bg-[#f5f5f5]" />

            <!-- 邮箱行:点击右侧编辑图标弹层修改 -->
            <view class="flex items-center gap-3.5 py-2">
              <view class="h-10 w-10 flex shrink-0 items-center justify-center rounded-xl bg-[#e8f5f1] text-[18px] text-[#018d71]">
                <text>✉</text>
              </view>
              <view class="min-w-0 flex flex-1 flex-col gap-0.5">
                <text class="text-xs text-[#999]">邮箱</text>
                <text class="break-all text-[15px] text-[#333] font-medium">{{ user?.email }}</text>
              </view>
              <view class="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-[#018d71]" @click="openEmailPopup">
                <text class="text-sm leading-none">✎</text>
                <text>编辑</text>
              </view>
            </view>
            <view class="mx-3 h-px bg-[#f5f5f5]" />

            <!-- 地址行:点击调起地图选点,确认即保存 -->
            <view class="flex items-center gap-3.5 py-2" @click="handleChooseLocation">
              <view class="h-10 w-10 flex shrink-0 items-center justify-center rounded-xl bg-[#e6f0ff] text-[18px] text-[#1677ff]">
                <text>◉</text>
              </view>
              <view class="min-w-0 flex flex-1 flex-col gap-0.5">
                <text class="text-xs text-[#999]">地址</text>
                <text class="line-clamp-2 break-all text-sm text-[#333] font-medium">
                  {{ form.address || '点击选择地址' }}
                </text>
              </view>
              <view class="flex shrink-0 items-center gap-2">
                <text v-if="form.address" class="cursor-pointer text-xs text-[#ff4d4f]" @click.stop="handleClearAddress">
                  清除
                </text>
                <text class="cursor-pointer text-xs text-[#018d71]">选择 ›</text>
              </view>
            </view>
            <view class="mx-3 h-px bg-[#f5f5f5]" />

            <!-- 手机号行:点击弹层经短信验证码绑定 -->
            <view class="flex items-center gap-3.5 py-2">
              <view class="h-10 w-10 flex shrink-0 items-center justify-center rounded-xl bg-[#fff7e6] text-[18px] text-[#e68a00]">
                <text>☎</text>
              </view>
              <view class="min-w-0 flex flex-1 flex-col gap-0.5">
                <text class="text-xs text-[#999]">手机号</text>
                <text class="break-all text-[15px] text-[#333] font-medium">{{ displayPhone }}</text>
              </view>
              <text class="cursor-pointer text-xs text-[#018d71]" @click="openPhonePopup">
                修改手机号
              </text>
            </view>

            <view class="pb-1 pt-2 text-xs text-[#999] leading-[1.6]">
              昵称、邮箱点击右侧编辑图标修改,保存后即时生效;地址点击地图选点,保存后同步定位。
            </view>
          </view>
        </view>
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

    <!-- 修改昵称弹层 -->
    <wd-popup
      v-model="namePopupVisible"
      position="center"
      round
      :modal="true"
      close-on-click-modal
    >
      <view class="w-[320px] px-5 pb-6 pt-5 md:w-[380px]">
        <text class="block text-center text-base text-[#333] font-semibold">修改昵称</text>
        <text class="mt-1 block text-center text-xs text-[#999]">
          昵称最长 20 字符,保存后即时生效
        </text>

        <view class="mt-5">
          <wd-input
            v-model="editName"
            :maxlength="20"
            placeholder="请输入昵称"
            clearable
          />
        </view>

        <view class="mt-6 flex gap-3">
          <wd-button
            class="flex-1 border border-[#e5e5e5]! bg-white! text-[#666]!"
            round
            size="medium"
            variant="plain"
            @click="namePopupVisible = false"
          >
            取消
          </wd-button>
          <wd-button
            class="flex-1 border-0 from-[#018d71] to-[#0aa07f] bg-gradient-to-br shadow-[0_6px_18px_rgba(1,141,113,0.28)] text-white!"
            round
            size="medium"
            @click="handleNameSave"
          >
            保存
          </wd-button>
        </view>
      </view>
    </wd-popup>

    <!-- 修改邮箱弹层 -->
    <wd-popup
      v-model="emailPopupVisible"
      position="center"
      round
      :modal="true"
      close-on-click-modal
    >
      <view class="w-[320px] px-5 pb-6 pt-5 md:w-[380px]">
        <text class="block text-center text-base text-[#333] font-semibold">修改邮箱</text>
        <text class="mt-1 block text-center text-xs text-[#999]">
          修改后再次登录将使用新邮箱
        </text>

        <view class="mt-5">
          <wd-input
            v-model="editEmail"
            inputmode="email"
            placeholder="请输入邮箱"
            clearable
          />
        </view>

        <view class="mt-6 flex gap-3">
          <wd-button
            class="flex-1 border border-[#e5e5e5]! bg-white! text-[#666]!"
            round
            size="medium"
            variant="plain"
            @click="emailPopupVisible = false"
          >
            取消
          </wd-button>
          <wd-button
            class="flex-1 border-0 from-[#018d71] to-[#0aa07f] bg-gradient-to-br shadow-[0_6px_18px_rgba(1,141,113,0.28)] text-white!"
            round
            size="medium"
            @click="handleEmailSave"
          >
            保存
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

    <!-- 兴趣标签选择弹窗(打开时预填当前用户的兴趣,完成时由组件内部自动提交到后台并同步 store) -->
    <TagSelectorPopup v-model="tagPopupVisible" :initial-tags="myTags" />
  </view>
</template>
