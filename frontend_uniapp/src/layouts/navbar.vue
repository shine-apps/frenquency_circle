<script setup lang="ts">
import { computed, useSlots } from 'vue'
import { currRoute } from '@/utils'

/**
 * 自定义顶部导航条布局
 *
 * 通过 `vite-plugin-uni-layouts` 使用：
 * 在页面中 `definePage({ layout: 'navbar' })` 即可让该页面套用本布局。
 * 布局会在最上方渲染 `wd-navbar`，并将页面内容放入默认插槽（`<slot />`）。
 *
 * 导航条标题默认取当前页面在 pages.json 中配置的 `navigationBarTitleText`；
 * 若页面需要动态标题，可通过 `provide('navbarTitle', ref(...))` 覆盖。
 * 左侧返回箭头在非首页时自动显示，点击执行 `uni.navigateBack`。
 */

const props = withDefaults(
  defineProps<{
    /** 导航条标题，不传则取当前页面 meta 标题 */
    title?: string
    /** 是否显示左侧返回箭头，不传则按是否有上一页自动判断 */
    leftArrow?: boolean
    /** 左侧文案 */
    leftText?: string
    /** 右侧文案 */
    rightText?: string
    /** 是否显示下边框 */
    bordered?: boolean
    /** 是否固定到顶部 */
    fixed?: boolean
    /** 固定时是否生成等高占位元素 */
    placeholder?: boolean
    /** 是否开启顶部安全区适配 */
    safeAreaInsetTop?: boolean
    /** 是否默认在右侧胶囊位渲染 wd-navbar-capsule（微信小程序返回/首页胶囊） */
    capsule?: boolean
    /** 胶囊“返回首页”跳转的 tabBar 首页路径 */
    homePath?: string
  }>(),
  {
    title: '趣邻圈',
    leftArrow: undefined,
    leftText: '',
    rightText: '',
    bordered: false,
    fixed: false,
    placeholder: false,
    safeAreaInsetTop: true,
    capsule: true,
    homePath: '/pages/index/index',
  },
)

const emit = defineEmits<{
  (e: 'click-left'): void
  (e: 'click-right'): void
  (e: 'back'): void
  (e: 'back-home'): void
}>()

/** 当前是否有上一页 */
function hasHistory(): boolean {
  // #ifdef H5 || MP-WEIXIN || APP-PLUS
  return getCurrentPages().length > 1
  // #endif
  return false
}

/** 从当前页面栈读取 meta 标题 */
function getPageTitle(): string {
  console.log('getPageTitle', getCurrentPages())
  // #ifdef H5 || MP-WEIXIN || APP-PLUS
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]
  
  const title = (current as any)?.$holder?.navigationBarTitleText
  return typeof title === 'string' ? title : ''
  // #endif
  return ''
}

const pageTitle = computed(() => getPageTitle())

/** 是否显示返回箭头：未显式指定时，默认胶囊开启则隐藏箭头（用胶囊代替），否则按是否有上一页判断 */
const showLeftArrow = computed(() => {
  if (props.leftArrow !== undefined) return props.leftArrow
  return props.capsule ? false : hasHistory()
})

/** 是否默认渲染胶囊（用户未通过具名 capsule 插槽覆盖时） */
const slots = useSlots()
const showCapsule = computed(() => props.capsule && !slots.capsule)

function handleClickLeft() {
  emit('click-left')
  // 未阻止默认行为时，尝试返回上一页
  if (hasHistory()) {
    uni.navigateBack()
  }
}

function handleClickRight() {
  emit('click-right')
}

/** 胶囊：返回上一页 */
function handleCapsuleBack() {
  emit('back')
  if (hasHistory()) {
    uni.navigateBack()
  }
}

/** 胶囊：返回首页（tabBar 用 switchTab，否则 reLaunch） */
function handleCapsuleBackHome() {
  emit('back-home')
  uni.switchTab({ url: props.homePath, fail: () => uni.reLaunch({ url: props.homePath }) })
}
</script>

<template>
  <view class="navbar-layout">
    <wd-navbar
      :title="pageTitle"
      :left-arrow="showLeftArrow"
      :left-text="leftText"
      :right-text="rightText"
      :bordered="bordered"
      :fixed="fixed"
      :placeholder="placeholder"
      :safe-area-inset-top="safeAreaInsetTop"
      @click-left="handleClickLeft"
      @click-right="handleClickRight"
    >
      <template #capsule>
        <slot name="capsule">
          <wd-navbar-capsule
            v-if="showCapsule"
            @back="handleCapsuleBack"
            @back-home="handleCapsuleBackHome"
          />
        </slot>
      </template>
      <template v-if="$slots.left" #left>
        <slot name="left" />
      </template>
      <template v-if="$slots.title" #title>
        <slot name="title" />
      </template>
      <template v-if="$slots.right" #right>
        <slot name="right" />
      </template>
    </wd-navbar>

    <view class="navbar-layout__body">
      <slot />
    </view>
  </view>
</template>

<style lang="scss">
.navbar-layout {
  min-height: 100vh;
  box-sizing: border-box;

  // 主题色背景 + 白色前景（覆盖 wot-ui navbar 内部 CSS 变量）
  --wot-navbar-bg: #018d71;
  --wot-navbar-color: #ffffff;

  // fixed 模式下占位元素同步背景，避免露出下方内容
  :deep(.wd-navbar.is-fixed) {
    background: var(--wot-navbar-bg);
  }

  &__body {
    box-sizing: border-box;
  }
}
</style>
