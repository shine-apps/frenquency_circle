<script lang="ts" setup>
/**
 * 富文本编辑器(活动介绍)。
 *
 * - 微信小程序 / H5:使用 uni-app 原生 `<editor>` 组件(所见即所得,输出 HTML)。
 * - 抖音小程序(MP-TOUTIAO):`<editor>` 不支持,降级为纯 `<textarea>`(用户可写简单文本,
 *   提交时包一层 `<p>` 当作 HTML 存储)。
 *
 * v-model 双向绑定 HTML 字符串;提交侧后端会做白名单净化,展示侧 `<rich-text>` 不执行脚本。
 */
import { ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 富文本 HTML */
    modelValue: string
    /** 占位提示(降级 textarea 用) */
    placeholder?: string
  }>(),
  {
    placeholder: '请输入活动介绍',
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', html: string): void
}>()

// 抖音小程序不支持 editor 组件,走 textarea 降级分支
// #ifndef MP-TOUTIAO
let TEXTAREA_FALLBACK = false
// #endif
// #ifdef MP-TOUTIAO
// @ts-expect-error 条件编译分支,仅抖音编译
TEXTAREA_FALLBACK = true
// #endif

const editorId = `rich-editor-${Math.random().toString(36).slice(2, 8)}`

// ====== 原生 editor 分支 ======
let editorCtx: WechatMiniprogram.EditorContext | null = null

function onEditorReady() {
  // #ifndef MP-TOUTIAO
  uni
    .createSelectorQuery()
    .select(`#${editorId}`)
    .context((res: any) => {
      editorCtx = res?.context ?? null
      if (props.modelValue && editorCtx) {
        editorCtx.setContents({ html: props.modelValue })
      }
    })
    .exec()
  // #endif
}

/** 读取当前 HTML 并向上 emit */
function syncHtml() {
  if (!editorCtx)
    return
  editorCtx.getContents({
    success: (res: { html: string }) => emit('update:modelValue', res.html || ''),
  })
}

// 工具栏:加粗 / 斜体 / 标题 / 无序列表 / 清除
function formatBold() {
  editorCtx?.format('bold')
}
function formatItalic() {
  editorCtx?.format('italic')
}
function formatHeader() {
  editorCtx?.format('header', 'H2')
}
function formatList() {
  editorCtx?.format('list', 'unordered')
}
function formatClear() {
  editorCtx?.removeFormat()
}

// ====== textarea 降级分支 ======
const textareaValue = ref(props.modelValue.replace(/<[^>]+>/g, ''))
watch(
  () => props.modelValue,
  (v) => {
    if (!TEXTAREA_FALLBACK)
      return
    textareaValue.value = v.replace(/<[^>]+>/g, '')
  },
)
function onTextareaInput(e: any) {
  const text = e?.detail?.value ?? ''
  textareaValue.value = text
  emit('update:modelValue', text ? `<p>${text}</p>` : '')
}
</script>

<template>
  <!-- 抖音小程序:textarea 降级 -->
  <view v-if="TEXTAREA_FALLBACK" class="rich-text-editor">
    <textarea
      :value="textareaValue" class="fallback-textarea" :placeholder="placeholder"
      :maxlength="-1" auto-height @input="onTextareaInput"
    />
  </view>

  <!-- 微信 / H5:原生 editor -->
  <view v-else class="rich-text-editor">
    <view class="toolbar flex items-center gap-1 border-b border-[#eee] px-2 py-1.5">
      <text class="tool-btn" @click="formatBold">
        <b>B</b>
      </text>
      <text class="tool-btn font-italic" @click="formatItalic">
        I
      </text>
      <text class="tool-btn" @click="formatHeader">
        H
      </text>
      <text class="tool-btn" @click="formatList">
        •
      </text>
      <text class="tool-btn" @click="formatClear">
        ⌫
      </text>
    </view>
    <editor
      :id="editorId" class="editor-body min-h-[160px] px-3 py-2" :placeholder="placeholder"
      @ready="onEditorReady" @input="syncHtml" @blur="syncHtml"
    />
  </view>
</template>

<style scoped>
.rich-text-editor {
  border: 1px solid #e5e5e5;
  border-radius: 12rpx;
  background: #fff;
}
.tool-btn {
  width: 56rpx;
  height: 56rpx;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 8rpx;
  color: #333;
  font-size: 30rpx;
  background: #f5f6f7;
}
.tool-btn:active {
  background: #e8f5f1;
}
.font-italic {
  font-style: italic;
}
.fallback-textarea {
  width: 100%;
  min-height: 160px;
  padding: 12rpx;
  font-size: 28rpx;
  line-height: 1.5;
  box-sizing: border-box;
}
</style>
