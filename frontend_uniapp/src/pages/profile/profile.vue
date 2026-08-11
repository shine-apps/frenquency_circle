<script lang="ts" setup>
import { computed, ref, watch } from 'vue'
import { useUserStore } from '@/store/user'
import { updateMyProfile, fromUserDTO } from '@/api/auth'
import { uploadFile } from '@/api/upload'
import { LOGIN_PAGE } from '@/router/config'
import type { UpdateMyProfileInput } from '@/api/types/login'

definePage({
  style: {
    navigationBarTitleText: '个人资料',
  },
})

/** 邮箱基础校验(与服务端 zod email() 一致:有 @ 与 .) */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const userStore = useUserStore()
const user = computed(() => userStore.userInfo)

// 表单状态(初值在 watch 里从 store 取)
const name = ref('')
const email = ref('')
const avatarUrl = ref('')
const submitting = ref(false)
const uploading = ref(false)

// 未登录守卫:进入页面时若未登录,reLaunch 回登录页
onShow(() => {
  if (!userStore.isLoggedIn) {
    uni.reLaunch({ url: LOGIN_PAGE })
  }
})

// 挂载时从 store 取初值,避免与后端往返
// 依赖 [user.value.id] 而非 [user],避免编辑表单时被静默重置
watch(
  () => user.value?.id,
  (id) => {
    if (id && user.value) {
      name.value = user.value.name ?? ''
      email.value = user.value.email ?? ''
      avatarUrl.value = user.value.avatarUrl ?? ''
    }
  },
  { immediate: true },
)

/** 轻量提示 */
function tip(msg: string) {
  uni.showToast({ title: msg, icon: 'none', duration: 2000 })
}

/** 从 tempFilePath 推断文件名(小程序端 File.name 拿不到) */
function deriveFilenameFromPath(p: string): string {
  if (!p) return 'avatar.jpg'
  const seg = p.split('/').pop() ?? 'avatar.jpg'
  return seg.includes('.') ? seg : `${seg}.jpg`
}

/** 实际执行上传 */
async function doUpload(file: string | File, filename: string) {
  uploading.value = true
  try {
    const { url } = await uploadFile({ file, name: filename, purpose: 'avatar' })
    avatarUrl.value = url
    tip('头像已上传')
  }
  catch (e) {
    tip((e as Error).message)
  }
  finally {
    uploading.value = false
  }
}

/** 选择图片 → 调 uploadFile → 自动回填 URL */
async function handlePickAvatar() {
  try {
    const res = await uni.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      maxDuration: 30,
      camera: 'back',
    })
    const f = (res as any)?.tempFiles?.[0]
    if (!f) return
    // H5 端优先用 originalFileObj(File 对象),小程序端用 tempFilePath(字符串)
    const file: string | File = f.originalFileObj ?? f.tempFilePath
    const filename = (f.originalFileObj && f.originalFileObj.name)
      || deriveFilenameFromPath(f.tempFilePath)
      || 'avatar.jpg'
    await doUpload(file, filename)
  }
  catch (e) {
    // 用户取消选择时 chooseMedia 会 reject,这里静默
    const err = e as Error & { errMsg?: string }
    if (err?.errMsg && /cancel/i.test(err.errMsg)) return
    tip(`选择图片失败: ${err.message}`)
  }
}

/** 清除头像(空串在保存时由后端归一为 null) */
function handleClearAvatar() {
  avatarUrl.value = ''
}

/** 提交保存 */
async function handleSave() {
  // 1. 客户端校验
  const trimmedName = name.value.trim()
  if (!trimmedName) {
    tip('昵称不能为空')
    return
  }
  if (trimmedName.length > 100) {
    tip('昵称过长(最多 100 字符)')
    return
  }
  if (email.value && !EMAIL_RE.test(email.value)) {
    tip('邮箱格式不正确')
    return
  }

  // 2. 只传变更字段
  const patch: UpdateMyProfileInput = {}
  if (trimmedName !== user.value?.name) patch.name = trimmedName
  if (email.value !== user.value?.email) patch.email = email.value
  if ((avatarUrl.value ?? '') !== (user.value?.avatarUrl ?? user.value?.avatar ?? '')) {
    patch.avatarUrl = avatarUrl.value ?? ''
  }
  if (Object.keys(patch).length === 0) {
    tip('未做修改')
    return
  }

  submitting.value = true
  try {
    const dto = await updateMyProfile(patch)
    // 3. 同步本地 store(avatar/avatarUrl 都更新)
    userStore.updateUser(fromUserDTO(dto))
    tip('保存成功')
    setTimeout(() => uni.navigateBack(), 600)
  }
  catch (e) {
    tip((e as Error).message)
  }
  finally {
    submitting.value = false
  }
}

// 头像 fallback:已登录显示昵称首字
const avatarFallback = computed(() => (user.value?.name ? user.value.name[0] : '游'))
</script>

<template>
  <view class="flex min-h-screen flex-col bg-[#f7f8fa]">
    <!-- 1. 顶部头像预览 + 选择/清除按钮 -->
    <view class="m-4 flex flex-col items-center rounded-2xl bg-white p-6">
      <view class="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1]">
        <image v-if="avatarUrl" :src="avatarUrl" class="h-full w-full" mode="aspectFill" />
        <text v-else class="text-3xl font-medium text-[#018d71]">
          {{ avatarFallback }}
        </text>
      </view>
      <view class="mt-4 flex items-center gap-3">
        <view
          class="rounded-full border border-[#e0e0e0] px-4 py-2"
          :class="uploading ? 'opacity-60' : ''"
          @click="!uploading && handlePickAvatar()"
        >
          <text class="text-sm text-[#666]">
            {{ uploading ? '上传中...' : avatarUrl ? '更换头像' : '选择图片' }}
          </text>
        </view>
        <view
          v-if="avatarUrl && !uploading"
          class="rounded-full border border-[#e0e0e0] px-4 py-2"
          @click="handleClearAvatar"
        >
          <text class="text-sm text-[#666]">
            清除
          </text>
        </view>
      </view>
    </view>

    <!-- 2. 表单 -->
    <view class="mx-4 rounded-2xl bg-white px-4 py-2">
      <view class="flex items-center border-b border-[#f5f5f5] py-4">
        <text class="w-20 shrink-0 text-sm text-[#666]">
          昵称
        </text>
        <input
          v-model="name"
          class="flex-1 text-sm"
          :maxlength="100"
          placeholder="请输入昵称"
          placeholder-class="text-[#bbb]"
        >
      </view>
      <view class="flex items-center border-b border-[#f5f5f5] py-4">
        <text class="w-20 shrink-0 text-sm text-[#666]">
          邮箱
        </text>
        <input
          v-model="email"
          class="flex-1 text-sm"
          placeholder="请输入邮箱"
          placeholder-class="text-[#bbb]"
        >
      </view>
      <view class="py-3">
        <text class="text-xs text-[#999]">
          修改邮箱后再次登录将使用新邮箱;昵称最长 100 字符。
        </text>
      </view>
    </view>

    <!-- 3. 底部固定保存按钮 -->
    <view class="px-4 pt-4">
      <wd-button
        block
        :loading="submitting"
        @click="handleSave"
      >
        保存
      </button>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
