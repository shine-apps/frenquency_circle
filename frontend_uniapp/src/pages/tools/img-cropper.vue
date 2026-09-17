<script lang="ts" setup>
import { onLoad } from '@dcloudio/uni-app'
import { ref } from 'vue'

definePage({
  style: {
    navigationBarTitleText: '裁剪图片',
  },
})

// 图片地址
const imgSrc = ref('')
// 裁剪后的图片
const croppedImg = ref('')
// 裁剪器是否可见
const showCropper = ref(false)
// 裁剪比例 (字符串格式，如 "16:9", "1:1", "4:3")
const aspectRatio = ref<string>('1:1')

onLoad((options) => {
  // 解析比例参数
  if (options && options['aspect-ratio']) {
    aspectRatio.value = options['aspect-ratio']
  }

  if (options && options.src) {
    imgSrc.value = decodeURIComponent(options.src)
    console.log(options.src, imgSrc.value)
    showCropper.value = true
  }
  else {
    // 没有选择图片，先选择图片
    chooseImage()
  }
})

// 选择图片
function chooseImage() {
  // #ifdef MP-WEIXIN
  uni.chooseMedia({
    count: 1,
    mediaType: ['image'],
    success: (res: any) => {
      imgSrc.value = res.tempFiles[0].tempFilePath
      showCropper.value = true
    },
    fail: (err: any) => {
      console.error('选择图片失败:', err)
      uni.navigateBack()
    },
  })
  // #endif

  // #ifndef MP-WEIXIN
  uni.chooseImage({
    count: 1,
    success: (res: any) => {
      imgSrc.value = res.tempFilePaths[0]
      showCropper.value = true
    },
    fail: (err: any) => {
      console.error('选择图片失败:', err)
      uni.navigateBack()
    },
  })
  // #endif
}

// 裁剪确认
function onConfirm({ tempFilePath }) {
  croppedImg.value = tempFilePath

  // 返回裁剪后的图片路径给上一页
  uni.$emit('imgCropperConfirm', { url: tempFilePath })
  uni.navigateBack()
}

// 裁剪取消
function onCancel() {
  uni.navigateBack()
}
</script>

<template>
  <view class="h-screen w-full">
    <wd-img-cropper
      v-model="showCropper"
      :img-src="imgSrc"
      :aspect-ratio="aspectRatio"
      :max-scale="2"
      :min-scale="0.5"
      @confirm="onConfirm"
      @cancel="onCancel"
    />
  </view>
</template>
