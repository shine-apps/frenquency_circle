<script lang="ts" setup>
/**
 * UGC 内容举报弹窗(底部弹出)。
 *
 * 复用 wot-ui v2 的 wd-popup 承载自定义单选内容,避免与 App.vue 全局
 * `<wd-dialog root-portal />`(供 useDialog 使用)相互干扰。
 *
 * 提交调用 reportContent(后端后续实现,内部生成举报记录并通知运营)。
 * 后端未就绪时提交会失败并提示,属预期(待后端实现 /api/content/report)。
 */
import { computed, ref } from 'vue'
import { reportContent, type ReportTargetType } from '@/api/content-moderation'

const props = withDefaults(
  defineProps<{
    /** 是否显示(v-model) */
    modelValue: boolean
    /** 被举报内容类型 */
    targetType: ReportTargetType
    /** 被举报内容 id */
    targetId: string
  }>(),
  {
    modelValue: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [boolean]
  /** 举报成功提交后触发 */
  submitted: []
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v: boolean) => emit('update:modelValue', v),
})

/** 举报原因(后端可按需扩展,前端展示用) */
const REASONS = [
  '色情低俗',
  '政治敏感',
  '广告骚扰',
  '诈骗赌博',
  '侵权(抄袭/盗用)',
  '其他违规',
] as const

const selected = ref('')
const submitting = ref(false)

function handleSubmit() {
  if (!selected.value) {
    uni.showToast({ title: '请选择举报原因', icon: 'none' })
    return
  }
  submitting.value = true
  reportContent({
    targetType: props.targetType,
    targetId: props.targetId,
    reason: selected.value,
  })
    .then(() => {
      uni.showToast({ title: '举报已提交,感谢反馈', icon: 'success' })
      emit('submitted')
      visible.value = false
    })
    .catch((e: unknown) => {
      uni.showToast({ title: (e as Error)?.message || '举报失败,请重试', icon: 'none' })
    })
    .finally(() => {
      submitting.value = false
    })
}
</script>

<template>
  <wd-popup v-model="visible" position="bottom">
    <view class="rounded-t-2xl bg-white pb-safe">
      <view class="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-3">
        <text class="text-base text-[#333] font-medium">
          举报内容
        </text>
        <text class="i-carbon-close text-lg text-[#999]" @click="visible = false" />
      </view>

      <view class="px-4 py-2">
        <view
          v-for="r in REASONS"
          :key="r"
          class="flex items-center justify-between py-3"
          @click="selected = r"
        >
          <text class="text-sm" :class="selected === r ? 'text-[#018d71]' : 'text-[#333]'">
            {{ r }}
          </text>
          <view
            class="h-4 w-4 flex items-center justify-center rounded-full border"
            :class="selected === r ? 'border-[#018d71] bg-[#018d71]' : 'border-[#ccc]'"
          >
            <text v-if="selected === r" class="text-[10px] text-white">✓</text>
          </view>
        </view>
      </view>

      <view class="flex gap-3 border-t border-[#f0f0f0] px-4 py-3">
        <wd-button variant="plain" @click="visible = false">
          取消
        </wd-button>
        <view class="flex-1">
          <wd-button block :loading="submitting" @click="handleSubmit">
            提交举报
          </wd-button>
        </view>
      </view>
    </view>
  </wd-popup>
</template>

<style lang="scss" scoped>
//
</style>
