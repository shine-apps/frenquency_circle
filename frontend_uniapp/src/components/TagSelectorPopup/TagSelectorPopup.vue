<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { createCustomTag, getCategories, searchTags } from '@/api/tags'
import type { CategoryNode, TagDTO } from '@/types'

/**
 * 兴趣标签选择弹窗(wd-popup 封装),已合并原 `TagSelector` 组件内容。
 *
 * 由原 `pages/search/search` 页面迁移而来:
 * - 使用 wot-ui `wd-popup` 从底部弹出,自带圆角、遮罩与滑入/滑出动画;
 * - 内部三段式布局(顶部固定 / 中部滚动 / 底部固定),统一滚动行为;
 * - 打开时通过 `initialTags` 预填,不读写用户 store,不参与用户标签持久化;
 * - 确认:仅把选择结果通过 `confirm` 交回父组件;取消/点遮罩关闭:不保存。
 *
 * 滚动行为设计(避免多层滚动不协调):
 * - 弹窗总高度 `h-screen`(100vh) + flex 纵向排列,配合 `:z-index="2000"` 覆盖底部自定义 tabbar(z-index:1000);
 *   `safe-area-inset-bottom` 仍会为底部安全区留白,不影响覆盖;
 * - 顶部固定区(shrink-0):品牌渐变头 + 操作栏 + 搜索框 + 已选胶囊区(限高内部滚动,不撑高);
 * - 中部滚动区(flex-1 min-h-0):搜索联想 / 分类骨架 / 自定义添加表单共用同一滚动容器,自适应剩余高度;
 * - 底部固定区(shrink-0):仅一行"自定义添加"开关,表单展开并入滚动区,不再挤压中部空间。
 */
const props = withDefaults(defineProps<{
  /** 弹窗显隐 */
  modelValue: boolean
  /** 最大可选数量,默认 10 */
  max?: number
  /** 打开时预填的标签 */
  initialTags?: string[]
}>(), {
  max: 10,
  initialTags: () => [],
})

const emit = defineEmits<{
  (e: 'update:modelValue', visible: boolean): void
  (e: 'confirm', tags: string[]): void
  (e: 'cancel'): void
}>()

/** 已选标签名称列表(打开时用 initialTags 预填,存 hobby_tags.name) */
const selectedTags = ref<string[]>([])

// 打开弹窗时用 initialTags 预填,不读写用户 store
watch(
  () => props.modelValue,
  (visible) => {
    if (visible) {
      selectedTags.value = props.initialTags?.length ? [...props.initialTags] : []
    }
  },
)

const count = computed(() => selectedTags.value.length)
const reachedMax = computed(() => selectedTags.value.length >= props.max)

/** 完成:仅把选择结果交回父组件并关闭弹窗(不持久化) */
function handleComplete() {
  if (count.value === 0) {
    uni.showToast({ title: '请至少选择 1 个兴趣', icon: 'none' })
    return
  }
  emit('confirm', selectedTags.value)
  emit('update:modelValue', false)
}

/** 取消:直接关闭,不保存 */
function handleCancel() {
  emit('cancel')
  emit('update:modelValue', false)
}

/** wd-popup 内部发起的显隐变化(如点遮罩关闭)统一走取消逻辑 */
function handleVisibleChange(v: boolean) {
  if (v) {
    emit('update:modelValue', true)
    return
  }
  handleCancel()
}

// ====== 搜索 / 分类 / 自定义添加(原 TagSelector 内容) ======

/** 搜索防抖时长(ms) */
const DEBOUNCE_MS = 300
/** 自定义标签名长度上限(与后端一致) */
const CUSTOM_NAME_MAX = 30

// 搜索相关状态
const query = ref('')
const suggestions = ref<TagDTO[]>([])
const loading = ref(false)
// 六大类分类树
const categories = ref<CategoryNode[]>([])
// 当前展开的分类名(空表示全部收起)
const expandedCategory = ref<string | null>(null)

// 自定义添加相关状态
const customOpen = ref(false)
const customName = ref('')
const customCategory = ref('')
const customSubmitting = ref(false)

/** 自定义分类下拉选项:六大类一级分类 + "其他"兜底 */
const customCategoryOptions = computed<string[]>(() => [
  ...categories.value.map(c => c.category),
  '其他',
])

// 防抖定时器引用
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// ====== 拉取分类树(仅 mount 一次) ======
getCategories()
  .then((res) => {
    categories.value = res.categories || []
  })
  .catch(() => {
    // 拉取失败不阻塞,分类区静默不展示
  })

// ====== 防抖搜索 ======
async function runSearch(q: string) {
  loading.value = true
  try {
    const res = await searchTags(q, 20)
    suggestions.value = res.list || []
  }
  catch (e) {
    // 搜索失败静默处理,不弹 toast 避免干扰输入
    suggestions.value = []
  }
  finally {
    loading.value = false
  }
}

watch(query, (val) => {
  if (debounceTimer)
    clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    runSearch(val)
  }, DEBOUNCE_MS)
})

onBeforeUnmount(() => {
  if (debounceTimer)
    clearTimeout(debounceTimer)
})

// ====== 选择 / 取消选择 ======
function handleToggleTag(tag: TagDTO) {
  if (selectedTags.value.includes(tag.name)) {
    selectedTags.value = selectedTags.value.filter(name => name !== tag.name)
    return
  }
  if (reachedMax.value) {
    uni.showToast({ title: `最多选 ${props.max} 个`, icon: 'none' })
    return
  }
  selectedTags.value = [...selectedTags.value, tag.name]
}

function handleRemoveSelected(name: string) {
  selectedTags.value = selectedTags.value.filter(x => x !== name)
}

/** 清空所有已选 */
function handleRemoveAll() {
  selectedTags.value = []
}

// ====== 分类展开/收起 ======
function handleToggleCategory(cat: string) {
  expandedCategory.value = expandedCategory.value === cat ? null : cat
}

/** 点击二级分类:直接加入/移除兴趣标签,无需确认步骤 */
function handleToggleSub(sub: string) {
  if (selectedTags.value.includes(sub)) {
    selectedTags.value = selectedTags.value.filter(name => name !== sub)
    return
  }
  if (reachedMax.value) {
    uni.showToast({ title: `最多选 ${props.max} 个`, icon: 'none' })
    return
  }
  selectedTags.value = [...selectedTags.value, sub]
}

// ====== 自定义添加 ======
function handleCategoryChange(e: any) {
  customCategory.value = customCategoryOptions.value[e.detail.value]
}

function handleCustomNameChange(e: any) {
  customName.value = String(e.detail.value ?? '').slice(0, CUSTOM_NAME_MAX)
}

async function handleSubmitCustom() {
  const name = customName.value.trim()
  if (!customCategory.value) {
    uni.showToast({ title: '请选择分类', icon: 'none' })
    return
  }
  if (!name) {
    uni.showToast({ title: '请输入标签名', icon: 'none' })
    return
  }
  if (selectedTags.value.length >= props.max) {
    uni.showToast({ title: `最多选 ${props.max} 个`, icon: 'none' })
    return
  }
  customSubmitting.value = true
  try {
    const tag = await createCustomTag(name, customCategory.value)
    selectedTags.value = [...selectedTags.value, tag.name]
    // 列表刷新:将新标签并入对应分类的二级分类,立即可见
    // 若所选分类(如"其他")不在六大类骨架中,按需注入占位节点
    let target = categories.value.find(c => c.category === tag.category)
    if (!target) {
      target = { category: tag.category, subCategories: [] }
      categories.value = [...categories.value, target]
    }
    if (!target.subCategories.includes(tag.name))
      target.subCategories = [...target.subCategories, tag.name]
    // 若处于搜索态,也并入联想列表
    if (query.value.trim() && !suggestions.value.some(s => s.id === tag.id))
      suggestions.value = [...suggestions.value, tag]
    customName.value = ''
    customCategory.value = ''
    customOpen.value = false
    uni.showToast({ title: '已添加', icon: 'success' })
  }
  catch (e) {
    uni.showToast({ title: (e as Error).message || '创建失败', icon: 'none' })
  }
  finally {
    customSubmitting.value = false
  }
}
</script>

<template>
  <wd-popup :model-value="modelValue" position="bottom" round :duration="300" :safe-area-inset-bottom="true"
    :close-on-click-modal="true" :lazy-render="false" :z-index="2000" @update:model-value="handleVisibleChange"
    custom-class="tag-popup">
    <view class="h-[85vh] flex flex-col bg-[#f7f8fa]">
      <!-- ====== 顶部固定区:品牌头 + 操作栏 + 搜索 + 已选胶囊 ====== -->
      <view class="shrink-0 bg-white">
        <!-- 品牌渐变头:取消(左) + 标题 + 完成(右) -->
        <view class="from-[#018d71] to-[#0aa07f] bg-gradient-to-b px-4 pb-4 pt-5">
          <view class="flex items-center justify-between">
            <!-- 取消:顶部左侧 -->
            <wd-button @click="handleCancel" type="info" round variant="subtle">取消</wd-button>
            <!-- 标题 -->
            <text class="text-lg text-white font-semibold">
              选择你的兴趣
            </text>
            <!-- 完成:顶部右侧 -->
            <wd-button round @click="handleComplete" type="primary" variant="subtle">完成{{ count > 0 ? `(${count})` : ''
              }}</wd-button>
          </view>
        </view>

        <!-- 操作栏:已选数量 + 全部清除(原 TagSelector 内部重复文案已合并去重) -->
        <view class="flex items-center justify-between px-4 py-3">
          <text class="text-sm text-[#999]">
            已选 {{ count }}/{{ max }}
          </text>
          <text v-if="count > 0" class="text-xs text-[#018d71]" @click="handleRemoveAll">
            全部清除
          </text>
        </view>

        <!-- 搜索框 -->
        <view class="flex items-center gap-2 px-4 pb-1">
          <view class="h-10 flex flex-1 items-center rounded-full bg-[#f5f6f7] px-4 b-solid b-[#e5e5e5]">
            <input
              v-model="query"
              class="flex-1 text-sm"
              placeholder="搜索兴趣/标签"
              placeholder-class="text-[#bbb]"
            >
          </view>
          <text v-if="loading" class="shrink-0 text-xs text-[#999]">
            搜索中...
          </text>
        </view>

        <!-- 已选胶囊区(限高约 2 行,超出内部滚动,不撑高挤压中部滚动区) -->
        <scroll-view v-if="selectedTags.length > 0" scroll-y class="max-h-[104px] px-4 pb-3 box-border">
          <view class="flex flex-wrap gap-2">
            <view
              v-for="name in selectedTags"
              :key="name"
              class="inline-flex items-center gap-1 border border-[#cdeae2] rounded-full bg-[#e8f5f1] py-1 pl-3 pr-1.5 active:scale-95"
            >
              <text class="text-xs text-[#018d71]">
                {{ name }}
              </text>
              <view
                class="h-4 w-4 flex items-center justify-center rounded-full bg-[#018d71]"
                @click="handleRemoveSelected(name)"
              >
                <text class="text-[10px] text-white leading-none">
                  ✕
                </text>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>

      <!-- ====== 中部滚动区:搜索联想 / 分类骨架 / 自定义表单共用同一滚动容器 ====== -->
      <scroll-view scroll-y class="min-h-0 flex-1 px-4 pt-3 box-border">
        <!-- 搜索态:联想列表 -->
        <template v-if="query.trim()">
          <view v-if="suggestions.length === 0 && !loading" class="flex flex-col items-center pt-12">
            <text class="text-sm text-[#999]">
              未找到"{{ query.trim() }}"相关标签,试试自定义添加
            </text>
          </view>
          <view v-else class="overflow-hidden rounded-2xl bg-white shadow-sm">
            <view
              v-for="tag in suggestions"
              :key="tag.id"
              class="flex items-center justify-between border-b border-[#f2f2f2] px-4 py-3 last:border-b-0"
              :class="selectedTags.includes(tag.name) ? 'bg-[#e8f5f1]' : ''"
              @click="handleToggleTag(tag)"
            >
              <view class="flex flex-col">
                <text class="text-sm text-[#333]">
                  {{ tag.name }}
                </text>
                <text v-if="tag.category" class="mt-0.5 text-xs text-[#999]">
                  {{ tag.category }}
                </text>
              </view>
              <text
                class="text-xs"
                :class="selectedTags.includes(tag.name) ? 'text-[#018d71]' : reachedMax ? 'text-[#999]' : 'text-[#018d71]'"
              >
                {{ selectedTags.includes(tag.name) ? '✓ 已选' : reachedMax ? `上限${max}` : '+ 选择' }}
              </text>
            </view>
          </view>
        </template>

        <!-- 分类态:六大类骨架 -->
        <template v-else>
          <view class="flex items-center justify-between">
            <text class="text-sm text-[#333] font-medium">
              六大类兴趣
            </text>
            <text class="text-xs text-[#999]">
              点击子类直接添加为兴趣标签
            </text>
          </view>
          <view v-if="categories.length === 0" class="flex flex-col items-center pt-12">
            <text class="text-sm text-[#999]">
              分类加载中...
            </text>
          </view>
          <view v-for="node in categories" :key="node.category" class="mt-3 rounded-2xl bg-white shadow-sm">
            <view class="flex items-center justify-between px-4 py-3" @click="handleToggleCategory(node.category)">
              <text class="text-sm text-[#333] font-medium">
                {{ node.category }}
              </text>
              <text class="text-xs text-[#999]">
                {{ expandedCategory === node.category ? '收起' : '展开' }}
              </text>
            </view>
            <view v-if="expandedCategory === node.category && node.subCategories.length > 0" class="border-t border-[#f5f6f7] px-4 py-3">
              <view class="flex flex-wrap gap-2">
                <text
                  v-for="sub in node.subCategories"
                  :key="sub"
                  class="rounded-full px-3 py-1 text-xs active:scale-95"
                  :class="selectedTags.includes(sub) ? 'bg-[#e8f5f1] text-[#018d71]' : 'bg-[#f5f6f7] text-[#666]'"
                  @click="handleToggleSub(sub)"
                >
                  {{ selectedTags.includes(sub) ? `✓ ${sub}` : sub }}
                </text>
              </view>
            </view>
          </view>
        </template>

        <!-- 自定义添加表单(展开后并入滚动区,搜索态/分类态均可用) -->
        <view v-if="customOpen" class="mt-3 mb-3 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm">
          <text class="text-sm text-[#333] font-medium">
            创建新标签
          </text>
          <picker
            mode="selector"
            :range="customCategoryOptions"
            @change="handleCategoryChange"
          >
            <view class="h-10 flex items-center justify-between rounded-full bg-[#f5f6f7] px-4">
              <text class="text-sm" :class="customCategory ? 'text-[#333]' : 'text-[#bbb]'">
                {{ customCategory || '请选择分类' }}
              </text>
              <text class="text-xs text-[#999]">
                ▾
              </text>
            </view>
          </picker>
          <view class="flex items-center gap-3">
            <view class="h-10 flex flex-1 items-center rounded-full bg-[#f5f6f7] px-4">
              <input
                :value="customName"
                class="flex-1 text-sm"
                :maxlength="CUSTOM_NAME_MAX"
                placeholder="输入标签名(1-30 字)"
                placeholder-class="text-[#bbb]"
                @input="handleCustomNameChange"
              >
            </view>
            <button
              class="rounded-full bg-[#018d71] px-4 py-2 text-sm text-white active:scale-95 disabled:opacity-50"
              :disabled="!customName.trim() || customSubmitting"
              :loading="customSubmitting"
              @click="handleSubmitCustom"
            >
              添加
            </button>
          </view>
        </view>
      </scroll-view>

      <!-- ====== 底部固定区:自定义添加开关(始终可见,仅一行,不占滚动空间) ====== -->
      <view class="shrink-0 border-t border-[#f2f2f2] bg-white px-4 py-3">
        <view class="flex items-center justify-between" @click="customOpen = !customOpen">
          <text class="text-sm text-[#333] font-medium">
            {{ customOpen ? '收起自定义' : '自定义添加' }}
          </text>
          <text class="text-xs text-[#999]">
            没找到?创建一个新标签
          </text>
        </view>
      </view>
    </view>
  </wd-popup>
</template>

<style scoped>
/* wd-popup 提升到最高层级(tabbar 为 z-index:1000,此处与 :z-index prop 双保险) */
:global(.tag-popup) {
  z-index: 2000 !important;
}
</style>
