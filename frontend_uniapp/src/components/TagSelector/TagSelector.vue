<script lang="ts" setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { searchTags, getCategories, createCustomTag } from '@/api/tags'
import type { CategoryNode, TagDTO } from '@/types'

/**
 * 兴趣标签选择器。
 *
 * 结构:顶部搜索框 + 联想列表 + 已选标签区 + 六大类分类骨架 + 自定义添加入口。
 *
 * - 后端 `GET /api/hobby-tags/search` 按标签名搜索,无"按 category 浏览"接口;
 *   六大类仅展示分类树作为视觉骨架,点击子类快速搜索。
 * - 已选值为标签名称数组(存 hobby_tags.name),直接透传给父组件。
 */

const props = withDefaults(defineProps<{
  /** 已选标签名称列表(存 hobby_tags.name) */
  selectedTags: string[]
  /** 最大可选数量,默认 10 */
  max?: number
}>(), {
  max: 10,
})

const emit = defineEmits<{
  (e: 'update:selectedTags', tags: string[]): void
}>()

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
const customSubmitting = ref(false)

// 防抖定时器引用
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// ====== 已选区展示数据 ======
// 已选值为名称数组,直接展示
const selectedTagList = computed<string[]>(() => props.selectedTags)

const reachedMax = computed(() => props.selectedTags.length >= props.max)

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
    const list = res.list || []
    suggestions.value = list
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
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    runSearch(val)
  }, DEBOUNCE_MS)
})

onBeforeUnmount(() => {
  if (debounceTimer) clearTimeout(debounceTimer)
})

// ====== 选择 / 取消选择 ======
function handleToggleTag(tag: TagDTO) {
  if (props.selectedTags.includes(tag.name)) {
    emit('update:selectedTags', props.selectedTags.filter(name => name !== tag.name))
    return
  }
  if (reachedMax.value) {
    uni.showToast({ title: `最多选 ${props.max} 个`, icon: 'none' })
    return
  }
  emit('update:selectedTags', [...props.selectedTags, tag.name])
}

function handleRemoveSelected(name: string) {
  emit('update:selectedTags', props.selectedTags.filter(x => x !== name))
}

/** 清空所有已选 */
function handleRemoveAll() {
  emit('update:selectedTags', [])
}

// ====== 分类展开/收起 ======
function handleToggleCategory(cat: string) {
  expandedCategory.value = expandedCategory.value === cat ? null : cat
}

// ====== 自定义添加 ======
function handleCustomNameChange(e: any) {
  customName.value = String(e.detail.value ?? '').slice(0, CUSTOM_NAME_MAX)
}

async function handleSubmitCustom() {
  const name = customName.value.trim()
  if (!name) {
    uni.showToast({ title: '请输入标签名', icon: 'none' })
    return
  }
  if (props.selectedTags.length >= props.max) {
    uni.showToast({ title: `最多选 ${props.max} 个`, icon: 'none' })
    return
  }
  customSubmitting.value = true
  try {
    const tag = await createCustomTag(name)
    emit('update:selectedTags', [...props.selectedTags, tag.name])
    customName.value = ''
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
  <view class="flex flex-1 flex-col">
    <!-- ====== 1. 搜索框 ====== -->
    <view class="flex items-center gap-2 px-4 pt-3">
      <view class="flex h-10 flex-1 items-center rounded-full bg-[#f5f6f7] px-4">
        <input
          v-model="query"
          class="flex-1 text-sm"
          placeholder="搜索兴趣/标签(支持拼音)"
          placeholder-class="text-[#bbb]"
        />
      </view>
      <text v-if="loading" class="shrink-0 text-xs text-[#999]">
        搜索中...
      </text>
    </view>

    <!-- ====== 2. 已选标签区(胶囊 + 大圆角) ====== -->
    <view v-if="selectedTagList.length > 0" class="mt-3 px-4">
      <view class="mb-2 flex items-center justify-between">
        <text class="text-xs text-[#999]">
          已选({{ selectedTagList.length }}/{{ max }})
        </text>
        <text v-if="selectedTagList.length > 0" class="text-xs text-[#018d71]" @click="handleRemoveAll">
          全部清除
        </text>
      </view>
      <scroll-view scroll-x class="whitespace-nowrap">
        <view class="inline-flex gap-2 pr-4">
          <view
            v-for="name in selectedTagList"
            :key="name"
            class="inline-flex items-center gap-1 rounded-full border border-[#cdeae2] bg-[#e8f5f1] py-1 pl-3 pr-1.5 active:scale-95"
          >
            <text class="text-xs text-[#018d71]">
              {{ name }}
            </text>
            <view
              class="flex h-4 w-4 items-center justify-center rounded-full bg-[#018d71]"
              @click="handleRemoveSelected(name)"
            >
              <text class="text-[10px] leading-none text-white">
                ✕
              </text>
            </view>
          </view>
        </view>
      </scroll-view>
    </view>

    <!-- ====== 3. 主体区:搜索非空展示联想列表,否则展示分类骨架 ====== -->
    <view v-if="query.trim()" class="flex-1 px-4 pt-3">
      <view v-if="suggestions.length === 0 && !loading" class="flex flex-col items-center pt-12">
        <text class="text-sm text-[#999]">
          未找到"{{ query.trim() }}"相关标签,试试自定义添加
        </text>
      </view>
      <view class="overflow-hidden rounded-2xl bg-white shadow-sm">
        <view
          v-for="(tag, idx) in suggestions"
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
    </view>

    <view v-else class="flex-1 px-4 pt-4">
      <view class="flex items-center justify-between">
        <text class="text-sm font-medium text-[#333]">
          六大类兴趣
        </text>
        <text class="text-xs text-[#999]">
          点击展开子类快速搜索
        </text>
      </view>
      <view v-if="categories.length === 0" class="flex flex-col items-center pt-12">
        <text class="text-sm text-[#999]">
          分类加载中...
        </text>
      </view>
      <view v-for="node in categories" :key="node.category" class="mt-3 overflow-hidden rounded-2xl bg-white shadow-sm">
        <view class="flex items-center justify-between px-4 py-3" @click="handleToggleCategory(node.category)">
          <text class="text-sm font-medium text-[#333]">
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
              class="rounded-full bg-[#f5f6f7] px-3 py-1 text-xs text-[#666] active:scale-95"
              @click="query = sub"
            >
              {{ sub }}
            </text>
          </view>
        </view>
      </view>
    </view>

    <!-- ====== 4. 自定义添加入口(底部固定) ====== -->
    <view class="mt-3 border-t border-[#f2f2f2] bg-white px-4 py-3 pb-safe">
      <view class="flex items-center justify-between" @click="customOpen = !customOpen">
        <text class="text-sm font-medium text-[#333]">
          {{ customOpen ? '收起自定义' : '自定义添加' }}
        </text>
        <text class="text-xs text-[#999]">
          没找到?创建一个新标签
        </text>
      </view>
      <view v-if="customOpen" class="mt-3 flex items-center gap-3">
        <view class="flex h-10 flex-1 items-center rounded-full bg-[#f5f6f7] px-4">
          <input
            :value="customName"
            class="flex-1 text-sm"
            :maxlength="CUSTOM_NAME_MAX"
            placeholder="输入标签名(1-30 字)"
            placeholder-class="text-[#bbb]"
            @input="handleCustomNameChange"
          />
        </view>
        <button
          class="rounded-full bg-[#018d71] px-4 py-2 text-sm text-white disabled:opacity-50 active:scale-95"
          :disabled="!customName.trim() || customSubmitting"
          :loading="customSubmitting"
          @click="handleSubmitCustom"
        >
          添加
        </button>
      </view>
    </view>
  </view>
</template>

<style lang="scss" scoped>
//
</style>
