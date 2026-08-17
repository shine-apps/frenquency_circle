<script lang="ts" setup>
import { ref } from 'vue'
import { useTokenStore } from '@/store/token'
import { HOME_PAGE_PATH } from '@/router/config'

definePage({
  // 登录页无需登录
  excludeLoginPath: true,
  style: {
    navigationBarTitleText: '登录',
  },
})

/** 大陆手机号正则 */
const PHONE_RE = /^1[3-9]\d{9}$/
/** 短信验证码长度 */
const CODE_LEN = 6
/** 验证码倒计时秒数 */
const COUNTDOWN = 60

const tokenStore = useTokenStore()

// 短信登录表单
const activeTab = ref<'phone' | 'password'>('phone')
const phone = ref('')
const smsCode = ref('')
const countdown = ref(0)
const sendingCode = ref(false)
// 密码登录表单
const email = ref('')
const password = ref('')
// 公共状态
const agreed = ref(true)
const submitting = ref(false)

let timer: ReturnType<typeof setInterval> | null = null

/** 轻量提示,使用 uni 原生 showToast,跨端一致 */
function tip(msg: string) {
  uni.showToast({ title: msg, icon: 'none', duration: 2000 })
}

/** 页面卸载时清理倒计时 */
onUnload(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
})

// 已登录用户直接跳首页(避免重复登录)
onShow(() => {
  if (tokenStore.updateNowTime().hasLogin) {
    uni.reLaunch({ url: HOME_PAGE_PATH })
  }
})

/** 发送短信验证码 */
async function handleSendCode() {
  if (!PHONE_RE.test(phone.value)) {
    tip('请输入正确的手机号')
    return
  }
  if (!agreed.value) {
    tip('请先阅读并同意协议')
    return
  }
  sendingCode.value = true
  try {
    await tokenStore.sendSmsCode(phone.value)
    tip('验证码已发送')
    countdown.value = COUNTDOWN
    timer = setInterval(() => {
      countdown.value--
      if (countdown.value <= 0 && timer) {
        clearInterval(timer)
        timer = null
      }
    }, 1000)
  }
  catch (e) {
    tip((e as Error).message || '验证码发送失败')
  }
  finally {
    sendingCode.value = false
  }
}

/** 登录成功跳转到首页 */
function handleLoginSuccess() {
  uni.reLaunch({ url: HOME_PAGE_PATH })
}

/** 手机号 + 验证码登录 */
async function handlePhoneLogin() {
  if (!agreed.value) {
    tip('请先阅读并同意协议')
    return
  }
  if (!PHONE_RE.test(phone.value)) {
    tip('请输入正确的手机号')
    return
  }
  if (smsCode.value.length !== CODE_LEN) {
    tip(`请输入 ${CODE_LEN} 位验证码`)
    return
  }
  submitting.value = true
  try {
    await tokenStore.loginByPhone(phone.value, smsCode.value)
    handleLoginSuccess()
  }
  catch (e) {
    tip((e as Error).message || '登录失败')
  }
  finally {
    submitting.value = false
  }
}

/** 邮箱 + 密码登录 */
async function handlePasswordLogin() {
  if (!agreed.value) {
    tip('请先阅读并同意协议')
    return
  }
  if (!email.value || !password.value) {
    tip('请输入邮箱和密码')
    return
  }
  submitting.value = true
  try {
    await tokenStore.loginByCredentials(email.value, password.value)
    handleLoginSuccess()
  }
  catch (e) {
    tip((e as Error).message || '登录失败')
  }
  finally {
    submitting.value = false
  }
}

/** 微信一键登录(仅微信小程序) */
// #ifdef MP-WEIXIN
async function handleGetPhoneNumber(e: any) {
  if (e.detail.errMsg !== 'getPhoneNumber:ok' || !e.detail.code) {
    tip('取消微信登录')
    return
  }
  if (!agreed.value) {
    tip('请先阅读并同意协议')
    return
  }
  submitting.value = true
  try {
    await tokenStore.loginByWechat(e.detail.code)
    handleLoginSuccess()
  }
  catch (err) {
    tip((err as Error).message || '微信登录失败')
  }
  finally {
    submitting.value = false
  }
}
// #endif
</script>

<template>
  <view class="min-h-screen flex flex-col bg-[#f7f8fa]">
    <!-- 1. Logo 区 -->
    <view class="flex flex-col items-center py-5">
      <image src="/static/images/logo_256_circle.png" class="h-[200px] w-[200px]" />
      <view class="mt-4 text-2xl text-[#1a1a1a] font-semibold">
        趣邻圈
      </view>
      <view class="mt-2 text-sm text-[#999]">
        发现身边趣，找到同好邻
      </view>
    </view>

    <!-- 2. 微信快捷登录(仅微信小程序) -->
    <!-- #ifdef MP-WEIXIN -->
    <view class="mt-10 px-8">
      <wd-button
        block
        custom-class="bg-[#07c160]! border-transparent! text-white"
        open-type="getPhoneNumber"
        :loading="submitting"
        @getphonenumber="handleGetPhoneNumber"
      >
        微信一键登录
      </wd-button>
      <view class="my-6 flex items-center gap-3">
        <view class="h-px flex-1 bg-[#e5e5e5]" />
        <text class="text-xs text-[#999]">
          其他登录方式
        </text>
        <view class="h-px flex-1 bg-[#e5e5e5]" />
      </view>
    </view>
    <!-- #endif -->

    <!-- 3. Tabs: 手机验证码 / 账号密码 -->
    <view class="mx-6 rounded-2xl bg-white p-6 shadow-sm">
      <view class="flex rounded-xl bg-[#f5f6f7] p-1">
        <view
          class="flex-1 rounded-lg py-2 text-center text-sm font-medium transition-colors"
          :class="activeTab === 'phone' ? 'bg-white text-[#018d71] shadow-sm' : 'text-[#666]'"
          @click="activeTab = 'phone'"
        >
          手机验证码
        </view>
        <view
          class="flex-1 rounded-lg py-2 text-center text-sm font-medium transition-colors"
          :class="activeTab === 'password' ? 'bg-white text-[#018d71] shadow-sm' : 'text-[#666]'"
          @click="activeTab = 'password'"
        >
          账号密码
        </view>
      </view>

      <!-- 手机验证码登录 -->
      <view v-if="activeTab === 'phone'" class="mt-6 flex flex-col gap-4">
        <view class="h-12 flex items-center border border-[#e8e8e8] rounded-lg bg-[#fafafa] px-3">
          <input
            v-model="phone"
            class="flex-1 text-base"
            type="number"
            :maxlength="11"
            placeholder="请输入手机号"
            placeholder-class="text-[#bbb]"
          >
        </view>
        <view class="flex items-center gap-3">
          <view class="h-12 flex flex-1 items-center border border-[#e8e8e8] rounded-lg bg-[#fafafa] px-3">
            <input
              v-model="smsCode"
              class="flex-1 text-base"
              type="number"
              :maxlength="CODE_LEN"
              placeholder="请输入验证码"
              placeholder-class="text-[#bbb]"
            >
          </view>
          <wd-button
            type="primary"
            size="small"
            :round="false"
            :disabled="countdown > 0 || sendingCode"
            @click="handleSendCode"
          >
            {{ countdown > 0 ? `${countdown}s` : '获取验证码' }}
          </wd-button>
        </view>
        <wd-button
          block
          :loading="submitting"
          @click="handlePhoneLogin"
        >
          登录
        </wd-button>
      </view>

      <!-- 邮箱密码登录 -->
      <view v-else class="mt-6 flex flex-col gap-4">
        <view class="h-12 flex items-center border border-[#e8e8e8] rounded-lg bg-[#fafafa] px-3">
          <input
            v-model="email"
            class="flex-1 text-base"
            placeholder="邮箱 / 手机号"
            placeholder-class="text-[#bbb]"
          >
        </view>
        <view class="h-12 flex items-center border border-[#e8e8e8] rounded-lg bg-[#fafafa] px-3">
          <input
            v-model="password"
            class="flex-1 text-base"
            password
            placeholder="请输入密码"
            placeholder-class="text-[#bbb]"
          >
        </view>
        <wd-button
          block
          :loading="submitting"
          @click="handlePasswordLogin"
        >
          登录
        </wd-button>
      </view>

      <!-- 4. 协议勾选 -->
      <view class="mt-6 flex items-center justify-center gap-1">
        <view
          class="h-4 w-4 flex items-center justify-center rounded-sm border-inset"
          :class="agreed ? 'border-[#018d71] bg-[#018d71]' : 'border-[#eee] bg-white'"
          @click="agreed = !agreed"
        >
          <text v-if="agreed" class="text-xs text-white">
            ✓
          </text>
        </view>
        <text class="text-xs text-[#999]">
          已阅读并同意
        </text>
        <text class="text-xs text-[#018d71]">
          《用户协议》
        </text>
        <text class="text-xs text-[#018d71]">
          《隐私政策》
        </text>
      </view>
    </view>
  </view>
</template>
