<script lang="ts" setup>
import { computed, ref } from 'vue'
import { useUserStore } from '@/store/user'
import { bindWechat, getMyProfile, getWechatBindStatus, unbindWechat, updateMyProfile, updateProfile, verifyPhoneBind } from '@/api/auth'
import { getWxCode, sendSmsCode } from '@/api/login'
import { uploadFileToCos } from '@/api/upload'
import { chooseImages } from '@/utils/chooseImage'
import { toLoginWithRedirect } from '@/utils/toLoginPage'
import { useToast } from '@wot-ui/ui/components/wd-toast'
import type { UserGender } from '@/types'

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

const avatarUrl = ref('')

// ===== 头像裁剪状态 =====
const cropVisible = ref(false)
const cropSrc = ref('')

// ===== 手机号修改弹层状态 =====
const phonePopupVisible = ref(false)
const newPhone = ref('')
const smsCode = ref('')
const countdown = ref(0)
const sendingCode = ref(false)
const bindingPhone = ref(false)
let countdownTimer: ReturnType<typeof setInterval> | null = null

// ===== 微信登录绑定状态 =====
// 注意与上方「微信号」(users.wechat,手填文本,对外联系方式)区分:
// 这里指微信授权登录绑定(后端 accounts 表 provider='wechat-miniprogram' + openid)。
/** 当前账号是否已绑定微信(以服务端为准) */
const wechatBound = ref(false)
/** 绑定/解绑请求进行中(防重复提交) */
const bindingWechat = ref(false)

/** 从 store 回填表单初值 */
function fillFromUser() {
  const u = user.value
  if (!u)
    return
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
    // 未登录:reLaunch 清空页面栈并携带 redirect,登录后回到本页
    toLoginWithRedirect()
    return
  }
  // 微信绑定状态与资料并行拉取(失败静默,不阻塞资料展示)
  refreshWechatBind()
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

/** 刷新微信登录绑定状态(失败静默,保持原值) */
function refreshWechatBind() {
  getWechatBindStatus()
    .then((state) => {
      wechatBound.value = state.bound
    })
    .catch(() => {})
}

// ===== 微信登录绑定(仅微信小程序可操作) =====
/** 绑定微信:wx.login 拿 code → 后端 code2Session 换 openid 并写入 accounts 绑定 */
async function handleBindWechat() {
  if (bindingWechat.value)
    return
  bindingWechat.value = true
  try {
    const code = await getWxCode()
    const state = await bindWechat(code.code)
    wechatBound.value = state.bound
    toast.show({ msg: '微信绑定成功', iconName: 'success' })
  }
  catch (e) {
    toast.show({ msg: (e as Error).message || '微信绑定失败,请重试', iconName: 'error' })
  }
  finally {
    bindingWechat.value = false
  }
}

/** 执行解绑:后端会校验账号仍有其它登录方式,否则返回可读错误 */
async function doUnbindWechat() {
  bindingWechat.value = true
  try {
    const state = await unbindWechat()
    wechatBound.value = state.bound
    toast.show({ msg: '已解绑微信', iconName: 'success' })
  }
  catch (e) {
    toast.show({ msg: (e as Error).message || '解绑失败,请重试', iconName: 'error' })
  }
  finally {
    bindingWechat.value = false
  }
}

/** 解绑微信:先二次确认,避免误触导致无法微信一键登录 */
function handleUnbindWechat() {
  if (bindingWechat.value)
    return
  uni.showModal({
    title: '解绑微信',
    content: '解绑后将无法使用微信一键登录,确定解绑吗?',
    confirmText: '解绑',
    cancelText: '取消',
    success: (res) => {
      if (res.confirm)
        doUnbindWechat()
    },
  })
}

// ===== 头像上传与裁剪 =====
/** 从 tempFilePath 推断文件名(裁剪后无扩展名时兜底) */
function deriveFilenameFromPath(p: string): string {
  if (!p)
    return 'avatar.jpg'
  const seg = p.split('/').pop() ?? 'avatar.jpg'
  return seg.includes('.') ? seg : `${seg}.jpg`
}

/**
 * 执行头像上传:上传 COS → 先持久化后端 → 成功后才更新本地预览。
 *
 * 注意不用 saveField:saveField 会吞掉 task 异常(内部 catch 不 rethrow),
 * 导致"上传成功但保存失败"时无法感知、预览与后端不一致。这里原子处理并回滚预览。
 */
async function doUpload(file: string | File, filename: string) {
  if (uploading.value || savingField.value === 'avatar')
    return
  uploading.value = true
  savingField.value = 'avatar'
  const prevUrl = avatarUrl.value
  try {
    const { url } = await uploadFileToCos({ file, name: filename, purpose: 'avatar' })
    // 先落库,成功后再更新预览;避免先改预览、落库失败时展示一张后端不存在的头像
    await updateMyProfile({ avatarUrl: url })
    avatarUrl.value = url
    const fresh = await getMyProfile()
    userStore.setProfile(fresh)
    toast.show({ msg: '头像已保存', iconName: 'success' })
  }
  catch (e) {
    avatarUrl.value = prevUrl
    console.error("上传头像失败", e)
    toast.show({ msg: '头像上传失败', iconName: 'error' })
  }
  finally {
    uploading.value = false
    savingField.value = null
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

// #ifdef MP-WEIXIN
/** 微信端:chooseAvatar 直接返回已裁剪的临时路径 → 上传 → 回填预览 → 保存 */
function handleChooseAvatar(e: { detail: { avatarUrl?: string } }) {
  if (uploading.value)
    return
  const path = e.detail.avatarUrl
  if (!path)
    return
  doUpload(path, deriveFilenameFromPath(path))
}
// #endif

/** 清除头像(空串由后端归一为 null);失败回滚预览,保持与后端一致 */
function handleClearAvatar() {
  // 上传/保存进行中禁止清除,避免与 doUpload 的保存链路竞态(否则已传文件成孤儿、toast 混乱)
  if (uploading.value || savingField.value === 'avatar')
    return
  const prevUrl = avatarUrl.value
  avatarUrl.value = ''
  savingField.value = 'avatar'
  updateMyProfile({ avatarUrl: '' })
    .then(() => getMyProfile().then(p => userStore.setProfile(p)))
    .then(() => toast.show({ msg: '头像已移除', iconName: 'success' }))
    .catch((e) => {
      avatarUrl.value = prevUrl
      toast.show({ msg: (e as Error).message || '移除失败,请重试', iconName: 'error' })
    })
    .finally(() => {
      savingField.value = null
    })
}

// ===== 查看模式展示 =====
const avatarFallback = computed(() => (user.value?.name ? user.value.name[0] : '游'))

const roleInfo = computed<{ text: string, type: 'warning' | 'primary' | 'danger' }>(() => {
  const role = user.value?.role
  if (role === 'TEACHER')
    return { text: '教师', type: 'warning' }
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

/** 微信号展示(未填写时提示) */
const displayWechat = computed(() => user.value?.wechat || '未填写')

// ===== 性别 / 生日 =====
/** 性别可选项(与后端枚举 male / female / other 对齐) */
const GENDER_OPTIONS: { label: string, value: UserGender }[] = [
  { label: '男', value: 'male' },
  { label: '女', value: 'female' },
  { label: '其他', value: 'other' },
]

/** 性别展示(未填写时提示) */
const displayGender = computed(
  () => GENDER_OPTIONS.find(o => o.value === user.value?.gender)?.label ?? '未填写',
)

/** 生日展示(未填写时提示) */
const displayBirthday = computed(() => user.value?.birthday || '未填写')

/** 生日可选范围:1900-01-01 ~ 今天 */
const BIRTHDAY_MIN_DATE = new Date(1900, 0, 1).getTime()
const now = new Date()
const BIRTHDAY_MAX_DATE = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()

/** 时间戳 → YYYY-MM-DD(本地时区) */
function tsToDateString(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
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
  },
) {
  if (field === 'avatar') {
    avatarUrl.value = fresh.avatarUrl ?? fresh.avatar ?? ''
  }
}

// ===== 昵称/邮箱编辑弹层 =====
const namePopupVisible = ref(false)
const editName = ref('')
const emailPopupVisible = ref(false)
const editEmail = ref('')
// ===== 微信号编辑弹层 =====
const wechatPopupVisible = ref(false)
const editWechat = ref('')

/** 打开微信号编辑弹层(预填当前值) */
function openWechatPopup() {
  editWechat.value = user.value?.wechat ?? ''
  wechatPopupVisible.value = true
}

/** 确认保存微信号:空值视为清除(后端空串归一 null),有变更则立即保存 */
function handleWechatSave() {
  const wechat = editWechat.value.trim()
  if (wechat.length > 50) {
    toast.show({ msg: '微信号最长 50 字符', iconName: 'error' })
    return
  }
  if (wechat === (user.value?.wechat ?? '')) {
    wechatPopupVisible.value = false
    return
  }
  saveField('wechat', '微信号', () => updateProfile({ wechat }))
  wechatPopupVisible.value = false
}

// ===== 性别编辑弹层 =====
const genderPopupVisible = ref(false)
const editGender = ref<UserGender | null>(null)

/** 打开性别编辑弹层(预填当前值) */
function openGenderPopup() {
  editGender.value = user.value?.gender ?? null
  genderPopupVisible.value = true
}

/** 选择性别:再次点击同一项视为取消选择(保存时清除) */
function handleGenderSelect(value: UserGender) {
  editGender.value = editGender.value === value ? null : value
}

/** 确认保存性别:未变更直接关闭;选中"清除"时传 null(后端归一为 null) */
function handleGenderSave() {
  const gender = editGender.value
  if (gender === (user.value?.gender ?? null)) {
    genderPopupVisible.value = false
    return
  }
  if (savingField.value === 'gender') {
    toast.show({ msg: '性别保存中,请稍候', iconName: 'info' })
    return
  }
  genderPopupVisible.value = false
  saveField('gender', '性别', () => updateMyProfile({ gender }))
}

// ===== 生日选择(选中即保存) =====
const birthdayPickerVisible = ref(false)

/** 生日选择器绑定的时间戳(已选则回填,否则定位到 30 岁) */
const birthdayTs = computed(() => {
  if (user.value?.birthday) {
    const ts = new Date(`${user.value.birthday}T00:00:00`).getTime()
    return Number.isNaN(ts) ? BIRTHDAY_MAX_DATE - 86400000 * 365 * 30 : ts
  }
  return BIRTHDAY_MAX_DATE - 86400000 * 365 * 30
})

/** 打开生日选择器 */
function openBirthdayPicker() {
  if (savingField.value === 'birthday') {
    toast.show({ msg: '生日保存中,请稍候', iconName: 'info' })
    return
  }
  birthdayPickerVisible.value = true
}

/** 生日确认:写回 YYYY-MM-DD 并立即保存(未变更则不请求) */
function handleBirthdayConfirm({ value }: { value: number | string }) {
  birthdayPickerVisible.value = false
  const ts = typeof value === 'number' ? value : Number(value)
  const birthday = tsToDateString(ts)
  if (birthday === (user.value?.birthday ?? ''))
    return
  saveField('birthday', '生日', () => updateMyProfile({ birthday }))
}

/** 清除生日(传 null,后端归一为 null) */
function handleClearBirthday() {
  if (!user.value?.birthday)
    return
  if (savingField.value === 'birthday') {
    toast.show({ msg: '生日保存中,请稍候', iconName: 'info' })
    return
  }
  saveField('birthday', '生日', () => updateMyProfile({ birthday: null }))
}

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
      <!-- ===== 头像区(点击选择/更换;微信端用原生 chooseAvatar,其他端选图后 1:1 裁剪) ===== -->
      <view class="flex flex-col items-center px-6 pb-6 pt-8">
        <!-- 微信小程序:原生 button + open-type="chooseAvatar"(返回已裁剪的临时路径) -->
        <!-- #ifdef MP-WEIXIN -->
        <button
          class="profile-avatar-btn relative m-0 h-24 w-24 flex items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#e8f5f1] p-0 leading-none shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-transform duration-200 active:scale-[0.96]"
          :disabled="uploading"
          open-type="chooseAvatar"
          @chooseavatar="handleChooseAvatar"
        >
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
        </button>
        <!-- #endif -->

        <!-- 其他端:点击选图后 1:1 裁剪 -->
        <!-- #ifndef MP-WEIXIN -->
        <view
          class="relative h-24 w-24 flex items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#e8f5f1] shadow-[0_8px_24px_rgba(0,0,0,0.12)] transition-transform duration-200 active:scale-[0.96]"
          @click="handlePickAvatar"
        >
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
        <!-- #endif -->

        <text class="mt-2 text-[12px] text-[#999]">
          点击头像{{ avatarUrl ? '更换照片' : '设置照片' }}
          <text v-if="avatarUrl" class="text-[#018d71] underline" @click.stop="handleClearAvatar">移除头像</text>
        </text>

        <!-- 姓名 + 角色徽标 -->
        <view class="mt-3 flex items-center gap-2">
          <text class="text-[20px] text-[#333] font-semibold leading-tight">
            {{ user?.name }}
          </text>
          <text class="rounded-full bg-[#e8f5f1] px-2 py-[3px] text-[11px] font-medium" :class="roleChipClass">
            {{ roleInfo.text }}
          </text>
        </view>
      </view>

      <!-- ===== 信息卡片:常驻行内编辑,失焦/确认即保存 ===== -->
      <view class="mx-4 mt-4 md:mx-6">
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

            <!-- 微信号行:点击弹层修改;人-人联系链路中唯一对外展示的联系方式 -->
            <view class="flex items-center gap-3.5 py-2">
              <view class="h-10 w-10 flex shrink-0 items-center justify-center rounded-xl bg-[#e8f5f1] text-[18px] text-[#018d71]">
                <text>微</text>
              </view>
              <view class="min-w-0 flex flex-1 flex-col gap-0.5">
                <text class="text-xs text-[#999]">微信号</text>
                <text class="break-all text-[15px] text-[#333] font-medium">{{ displayWechat }}</text>
              </view>
              <view class="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-[#018d71]" @click="openWechatPopup">
                <text class="text-sm leading-none">✎</text>
                <text>编辑</text>
              </view>
            </view>
            <view class="mx-3 h-px bg-[#f5f5f5]" />

            <!-- 性别行:点击弹层选择(男/女/其他,可清除) -->
            <view class="flex items-center gap-3.5 py-2">
              <view class="h-10 w-10 flex shrink-0 items-center justify-center rounded-xl bg-[#e8f5f1] text-[18px] text-[#018d71]">
                <text>性</text>
              </view>
              <view class="min-w-0 flex flex-1 flex-col gap-0.5">
                <text class="text-xs text-[#999]">性别</text>
                <text class="break-all text-[15px] text-[#333] font-medium">{{ displayGender }}</text>
              </view>
              <view class="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-[#018d71]" @click="openGenderPopup">
                <text class="text-sm leading-none">✎</text>
                <text>编辑</text>
              </view>
            </view>
            <view class="mx-3 h-px bg-[#f5f5f5]" />

            <!-- 生日行:点击用日期选择器,选中即保存 -->
            <view class="flex items-center gap-3.5 py-2">
              <view class="h-10 w-10 flex shrink-0 items-center justify-center rounded-xl bg-[#e8f5f1] text-[18px] text-[#018d71]">
                <text>生</text>
              </view>
              <view class="min-w-0 flex flex-1 flex-col gap-0.5">
                <text class="text-xs text-[#999]">生日</text>
                <text class="break-all text-[15px] text-[#333] font-medium">{{ displayBirthday }}</text>
              </view>
              <view class="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-[#018d71]">
                <text v-if="user?.birthday" @click.stop="handleClearBirthday">清除</text>
                <view class="flex items-center gap-1" @click="openBirthdayPicker">
                  <text class="text-sm leading-none">✎</text>
                  <text>编辑</text>
                </view>
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
            <view class="mx-3 h-px bg-[#f5f5f5]" />

            <!-- 微信登录绑定行:与上方「微信号」(手填对外联系方式)不同,这里是微信授权登录绑定 -->
            <view class="flex items-center gap-3.5 py-2">
              <view class="h-10 w-10 flex shrink-0 items-center justify-center rounded-xl bg-[#e8f5f1] text-[18px] text-[#018d71]">
                <text>登</text>
              </view>
              <view class="min-w-0 flex flex-1 flex-col gap-0.5">
                <text class="text-xs text-[#999]">微信登录绑定</text>
                <text class="break-all text-[15px] text-[#333] font-medium">{{ wechatBound ? '已绑定' : '未绑定' }}</text>
              </view>
              <!-- #ifdef MP-WEIXIN -->
              <text
                v-if="!wechatBound"
                class="cursor-pointer text-xs text-[#018d71]"
                :class="bindingWechat ? 'opacity-50' : ''"
                @click="handleBindWechat"
              >
                绑定微信
              </text>
              <text
                v-else
                class="cursor-pointer text-xs text-[#e68a00]"
                :class="bindingWechat ? 'opacity-50' : ''"
                @click="handleUnbindWechat"
              >
                解绑
              </text>
              <!-- #endif -->
              <!-- #ifndef MP-WEIXIN -->
              <text class="text-xs text-[#bbb]">仅微信小程序内可管理</text>
              <!-- #endif -->
            </view>

            <view class="pb-1 pt-2 text-xs text-[#999] leading-[1.6]">
              昵称、邮箱、性别、生日点击右侧编辑图标修改,保存后即时生效。
              微信号仅在你公开联系方式或同意联系请求后,才会被他人看到。
              微信登录绑定用于微信一键登录,可在微信小程序内绑定或解绑。
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

    <!-- 修改微信号弹层 -->
    <wd-popup
      v-model="wechatPopupVisible"
      position="center"
      round
      :modal="true"
      close-on-click-modal
    >
      <view class="w-[320px] px-5 pb-6 pt-5 md:w-[380px]">
        <text class="block text-center text-base text-[#333] font-semibold">修改微信号</text>
        <text class="mt-1 block text-center text-xs text-[#999]">
          仅在你公开联系方式或同意联系请求后,才会被他人看到
        </text>

        <view class="mt-5">
          <wd-input
            v-model="editWechat"
            :maxlength="50"
            placeholder="请输入微信号,留空则清除"
            clearable
          />
        </view>

        <view class="mt-6 flex gap-3">
          <wd-button
            class="flex-1 border border-[#e5e5e5]! bg-white! text-[#666]!"
            round
            size="medium"
            variant="plain"
            @click="wechatPopupVisible = false"
          >
            取消
          </wd-button>
          <wd-button
            class="flex-1 border-0 from-[#018d71] to-[#0aa07f] bg-gradient-to-br shadow-[0_6px_18px_rgba(1,141,113,0.28)] text-white!"
            round
            size="medium"
            @click="handleWechatSave"
          >
            保存
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
            type="nickname"
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

    <!-- 修改性别弹层 -->
    <wd-popup
      v-model="genderPopupVisible"
      position="center"
      round
      :modal="true"
      close-on-click-modal
    >
      <view class="w-[320px] px-5 pb-6 pt-5 md:w-[380px]">
        <text class="block text-center text-base text-[#333] font-semibold">选择性别</text>
        <text class="mt-1 block text-center text-xs text-[#999]">
          用于资料展示,可随时修改或清除
        </text>

        <view class="mt-5 flex gap-3">
          <view
            v-for="opt in GENDER_OPTIONS"
            :key="opt.value"
            class="h-10 flex flex-1 items-center justify-center rounded-lg border text-sm"
            :class="editGender === opt.value ? 'border-[#018d71] bg-[#e8f5f1] text-[#018d71]' : 'border-[#e8e8e8] bg-[#fafafa] text-[#666]'"
            @click="handleGenderSelect(opt.value)"
          >
            {{ opt.label }}
          </view>
        </view>

        <view class="mt-6 flex gap-3">
          <wd-button
            class="flex-1 border border-[#e5e5e5]! bg-white! text-[#666]!"
            round
            size="medium"
            variant="plain"
            @click="genderPopupVisible = false"
          >
            取消
          </wd-button>
          <wd-button
            class="flex-1 border-0 from-[#018d71] to-[#0aa07f] bg-gradient-to-br shadow-[0_6px_18px_rgba(1,141,113,0.28)] text-white!"
            round
            size="medium"
            @click="handleGenderSave"
          >
            保存
          </wd-button>
        </view>
      </view>
    </wd-popup>

    <!-- 生日选择器(type=date,1900-01-01 ~ 今天,确认后即时保存) -->
    <wd-datetime-picker
      :visible="birthdayPickerVisible"
      :model-value="birthdayTs"
      type="date"
      title="选择生日"
      :min-date="BIRTHDAY_MIN_DATE"
      :max-date="BIRTHDAY_MAX_DATE"
      @confirm="handleBirthdayConfirm"
      @update:visible="birthdayPickerVisible = $event"
    />

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

    <!-- 兴趣标签在"我的"页编辑;本页不再展示兴趣编辑 -->
  </view>
</template>

<style>
/* 微信小程序原生 button(open-type="chooseAvatar")默认样式重置:
   去掉按钮自带边框,避免与圆角头像边框重叠 */
.profile-avatar-btn::after {
  border: none;
}
</style>
