<script lang="ts" setup>
import { onLoad } from '@dcloudio/uni-app'
import { ref } from 'vue'

const url = ref('')
const title = ref('')

onLoad((options) => {
  if (options?.url) {
    let targetUrl = decodeURIComponent(options.url)
    url.value = targetUrl
  }
  if (options?.title) {
    title.value = decodeURIComponent(options.title)
    uni.setNavigationBarTitle({
      title: title.value,
    })
  }
})

function onMessage(e: any) {
  console.log('webview message:', e.detail.data)
}
</script>

<template>
  <view class="h-screen w-full">
    <web-view :src="url" @message="onMessage" />
  </view>
</template>
