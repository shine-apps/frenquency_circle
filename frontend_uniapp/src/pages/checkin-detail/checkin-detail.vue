<script lang="ts" setup>
/**
 * 打卡详情页(分享落地页)。
 *
 * - 大图/视频展示:多图用 swiper 轮播 + 点击大图预览,视频内联播放;
 * - 作者、时间、所属圈子(可跳圈子详情)、正文、兴趣标签完整展示(不截断);
 * - 分享:小程序走原生转发(onShareAppMessage / onShareTimeline),
 *   H5 走微信 JSSDK(useShare 内部处理 config 与分享卡片数据);
 * - 打卡被删除后统一进入「已不存在」态。
 */
import { computed, ref } from 'vue'
import { onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { getCheckin } from '@/api/checkins'
import { useShare } from '@/composables/useShare'
import { formatDateTime } from '@/utils/format'
import ReportContentDialog from '@/components/ReportContentDialog/ReportContentDialog.vue'
import type { CheckinDTO } from '@/types'

definePage({
  layout: 'default',
  style: {
    navigationBarTitleText: '打卡详情',
  },
  excludeLoginPath: false,
})

const checkinId = ref('')
const detail = ref<CheckinDTO | null>(null)
const loading = ref(true)
const notFound = ref(false)
/** 举报弹窗显隐 */
const reportVisible = ref(false)

/** 分享图:优先首张图片(视频打卡无法取封面,回退 useShare 默认图) */
const shareImage = computed(() => detail.value?.images?.[0] ?? '')

/** 分享标题:正文摘要,无正文时用「作者 + 打卡」 */
const shareTitle = computed(() => {
  const d = detail.value
  if (!d)
    return '趣邻圈 · 打卡'
  const text = d.content?.trim()
  if (text)
    return text.length > 40 ? `${text.slice(0, 40)}…` : text
  return `${d.author.name} 的打卡`
})

const { share, shareAppMessage, shareTimeline } = useShare({
  title: () => shareTitle.value,
  path: '/pages/checkin-detail/checkin-detail',
  query: () => (checkinId.value ? { id: checkinId.value } : {}),
  imageUrl: () => shareImage.value,
  desc: () => detail.value?.content?.slice(0, 80) ?? '',
})

// 分享钩子必须在页面顶层直接注册,编译器才能生成小程序 Page 配置
// #ifdef MP-WEIXIN || MP-TOUTIAO
onShareAppMessage(shareAppMessage)
onShareTimeline(shareTimeline)
// #endif

/** 拉取打卡详情 */
async function fetchDetail(id: string) {
  if (!id) {
    notFound.value = true
    loading.value = false
    return
  }
  loading.value = true
  try {
    detail.value = await getCheckin(id)
    notFound.value = false
  }
  catch (e) {
    // 404(不存在/已删除)与其他错误统一进入「已不存在」态
    notFound.value = true
    console.warn('[CheckinDetail] fetch error:', (e as Error)?.message)
  }
  finally {
    loading.value = false
  }
}

onLoad((options) => {
  const id = (options as { id?: string } | undefined)?.id ?? ''
  checkinId.value = id
  void fetchDetail(id)
})

/** 点击图片:大图预览 */
function handlePreviewImage(index: number) {
  const urls = detail.value?.images ?? []
  if (urls.length === 0)
    return
  uni.previewImage({ urls, current: urls[index] })
}

/** 跳作者主页 */
function handleAuthorTap() {
  const author = detail.value?.author
  if (!author)
    return
  uni.navigateTo({ url: `/pages/user-home/user-home?id=${author.id}` })
}

/** 跳圈子详情 */
function handleCircleTap() {
  const circleId = detail.value?.circleId
  if (!circleId)
    return
  uni.navigateTo({ url: `/pages/circle/circle?id=${circleId}` })
}

/** 返回上一页(无上一页时回打卡广场) */
function handleBack() {
  uni.navigateBack({
    fail() {
      uni.switchTab({ url: '/pages/checkin-plaza/checkin-plaza' })
    },
  })
}
</script>

<template>
  <view class="min-h-screen flex flex-col bg-[#f7f8fa]">
    <!-- 加载中 -->
    <view v-if="loading && !detail" class="flex flex-col items-center pt-32">
      <text class="text-sm text-[#999]">
        加载中...
      </text>
    </view>

    <!-- 边界态:打卡不存在 / 已删除 -->
    <view v-else-if="notFound || !detail" class="flex flex-col items-center pt-32">
      <text class="i-carbon-calendar-heat-map text-5xl text-[#d9d9d9]" />
      <text class="mt-4 text-base text-[#333] font-medium">
        该打卡已不存在
      </text>
      <text class="mt-2 text-xs text-[#999]">
        可能已被作者删除
      </text>
      <wd-button class="mt-4" round size="small" @click="handleBack">
        返回
      </wd-button>
    </view>

    <template v-else>
      <!-- ====== 媒体区:多图轮播 / 单图 / 视频 ====== -->
      <view v-if="detail.videoUrl" class="bg-black">
        <video
          :src="detail.videoUrl"
          class="h-[480rpx] w-full"
          object-fit="contain"
          :controls="true"
          :show-center-play-btn="true"
        />
      </view>

      <view v-else-if="detail.images.length === 1" class="bg-black">
        <image
          :src="detail.images[0]"
          class="h-[480rpx] w-full"
          mode="aspectFit"
          @click="handlePreviewImage(0)"
        />
      </view>

      <swiper
        v-else-if="detail.images.length > 1"
        class="h-[480rpx] w-full bg-black"
        :indicator-dots="true"
        indicator-color="rgba(255,255,255,0.4)"
        indicator-active-color="#ffffff"
        :circular="true"
      >
        <swiper-item v-for="(url, index) in detail.images" :key="`${url}-${index}`">
          <image
            :src="url"
            class="h-full w-full"
            mode="aspectFit"
            @click="handlePreviewImage(index)"
          />
        </swiper-item>
      </swiper>

      <!-- ====== 正文与信息 ====== -->
      <view class="mt-3 rounded-t-2xl bg-white px-4 py-4">
        <!-- 作者 -->
        <view class="flex items-center gap-3" @click="handleAuthorTap">
          <view class="h-11 w-11 flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#e8f5f1]">
            <image
              v-if="detail.author.avatarUrl"
              :src="detail.author.avatarUrl"
              class="h-full w-full"
              mode="aspectFill"
            />
            <text v-else class="text-lg text-[#018d71] font-medium">
              {{ detail.author.name ? detail.author.name[0] : '?' }}
            </text>
          </view>
          <view class="min-w-0 flex-1">
            <text class="block truncate text-sm text-[#333] font-medium">
              {{ detail.author.name }}
            </text>
            <text class="mt-0.5 block text-xs text-[#999]">
              {{ formatDateTime(detail.createdAt) }}
            </text>
          </view>
          <text class="shrink-0 text-sm text-[#ccc]">
            ›
          </text>
        </view>

        <!-- 正文 -->
        <text
          v-if="detail.content"
          class="mt-4 block text-[15px] text-[#333] leading-7"
        >
          {{ detail.content }}
        </text>

        <!-- 兴趣标签 -->
        <view v-if="detail.tags.length > 0" class="mt-4 flex flex-wrap gap-2">
          <text
            v-for="tag in detail.tags"
            :key="tag"
            class="rounded-full bg-[#e8f5f1] px-3 py-1 text-xs text-[#018d71]"
          >
            {{ tag }}
          </text>
        </view>

        <!-- 所属圈子 -->
        <view
          v-if="detail.circleTitle"
          class="mt-4 flex items-center justify-between border-t border-[#f5f5f5] pt-4"
          @click="handleCircleTap"
        >
          <view class="min-w-0 flex items-center gap-1.5">
            <text class="i-carbon-location-filled shrink-0 text-sm text-[#018d71]" />
            <text class="truncate text-sm text-[#018d71]">
              {{ detail.circleTitle }}
            </text>
          </view>
          <text class="shrink-0 text-sm text-[#ccc]">
            ›
          </text>
        </view>
      </view>

      <!-- 底部占位:避免被固定分享栏遮挡 -->
      <view class="h-24" />

      <!-- ====== 底部固定分享栏 ====== -->
      <view class="fixed bottom-0 left-0 right-0 border-t border-[#f0f0f0] bg-white px-4 py-3 pb-safe">
        <view class="flex items-center gap-3">
          <!-- 小程序:原生转发按钮(点按唤起微信转发面板) -->
          <!-- #ifndef H5 -->
          <wd-button plain class="flex-1" open-type="share">
            分享这条打卡
          </wd-button>
          <!-- #endif -->
          <!-- H5 微信浏览器:点击引导右上角分享 -->
          <!-- #ifdef H5 -->
          <wd-button plain class="flex-1" @click="share">
            分享这条打卡
          </wd-button>
          <!-- #endif -->
          <!-- 举报 -->
          <wd-button plain class="shrink-0" @click="reportVisible = true">
            举报
          </wd-button>
        </view>
      </view>

      <!-- 举报内容弹窗 -->
      <ReportContentDialog v-model="reportVisible" target-type="checkin" :target-id="checkinId" />
    </template>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
