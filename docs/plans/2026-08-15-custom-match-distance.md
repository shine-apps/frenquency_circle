# 首页匹配范围：自定义距离 实施计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将首页匹配过滤栏（`MatchFilterBar`）中固定的 `30km` 范围选项移除，改为支持用户手动输入自定义距离（公里）进行匹配。

**Architecture:** 范围选择区仍保留预设 Tab（1km / 5km / 10km），在其末尾追加一个「自定义」入口，点击后展开一个数字输入框，用户输入公里数并确认后通过既有 `change-range` 事件回传给父页面 `index.vue`，父页面维持原有的 `loadAll` 匹配逻辑不变。组件依旧保持「纯输入/输出、无副作用」的既有约束。

**Tech Stack:** Vue 3 `<script setup>`、uni-app、wot-ui（`wd-input`）、Tailwind（UnoCSS）原子类、Vitest + `@vue/test-utils`。

**范围说明：**
- 只改 `frontend_uniapp/src/components/MatchFilterBar/MatchFilterBar.vue` 与 `frontend_uniapp/src/pages/index/index.vue`。
- 不改动 `frontend_uniapp/src/pages/match/match.vue`（该页的 `RANGE_FILTERS` 是其独立的「全部/≤1km/≤5km/≤10km」筛选语义，不在本次需求内）。如需扩展可后续单独处理。

---

## 设计决策

1. **预设选项**：保留 `1km`、`5km`、`10km`，移除 `30km`。新增一个独立的「自定义」Tab（`label: '自定义'`, `value: null` 或专用哨兵值，用于区分预设与自定义状态）。
2. **自定义状态**：新增本地 ref `customInput`（字符串，绑定输入框）与 `showCustomInput`（布尔，控制输入框显隐）。当用户选中「自定义」Tab 时显示输入框。
3. **确认交互**：输入框旁提供「确定」按钮；确认时校验输入为 `> 0` 且 `<= 200` 的正数，非法则 toast 提示并阻止 emit；合法则 `emit('change-range', parsedValue)`。
4. **高亮驱动**：依旧完全由父级 `rangeKm` prop 驱动。`rangeKm` 在预设选项里则高亮预设 Tab；否则高亮「自定义」Tab。
5. **无副作用约束**：`MatchFilterBar` 不访问 store / 不调用 api / 不 import useDialog。校验提示用 `uni.showToast`（纯展示副作用，与父页面一致，可接受）。

---

### Task 1: 修改 `MatchFilterBar` 范围选项与自定义输入 UI

**Files:**
- Modify: `frontend_uniapp/src/components/MatchFilterBar/MatchFilterBar.vue`

**Step 1: 调整范围选项定义**

将 `RANGE_OPTIONS` 中 `{ label: '30km', value: 30 }` 移除，保留预设三项，并新增自定义选项：

```ts
/** 预设范围 Tab 选项 */
const PRESET_RANGES: Array<{ label: string, value: number }> = [
  { label: '1km', value: 1 },
  { label: '5km', value: 5 },
  { label: '10km', value: 10 },
]
```

`RANGE_OPTIONS` 引用处改为 `PRESET_RANGES`。

**Step 2: 新增自定义距离状态与处理逻辑**

在 `<script setup>` 中新增：

```ts
/** 自定义距离输入(字符串,便于输入框清空) */
const customInput = ref<string>('')
/** 是否展示自定义距离输入框 */
const showCustomInput = ref(false)
/** 自定义距离输入的最大值(km) */
const MAX_CUSTOM_KM = 200

/** 点击「自定义」Tab:展开输入框 */
function handleCustomTab(): void {
  showCustomInput.value = true
  customInput.value = ''
}

/** 确认自定义距离:校验通过 emit change-range,否则提示 */
function handleConfirmCustom(): void {
  const value = Number(customInput.value)
  if (!Number.isFinite(value) || value <= 0 || value > MAX_CUSTOM_KM) {
    uni.showToast({ title: `请输入 1~${MAX_CUSTOM_KM} 的公里数`, icon: 'none' })
    return
  }
  const km = Math.round(value * 10) / 10 // 保留 1 位小数
  showCustomInput.value = false
  emit('change-range', km)
}
```

**Step 3: 更新模板的范围 Tab 区**

在 `v-for` 预设选项后追加「自定义」Tab，并在其下方按条件渲染输入行：

```html
<!-- ====== 范围 Tab ====== -->
<view v-if="ready" class="mt-3">
  <scroll-view scroll-x class="whitespace-nowrap">
    <view class="flex gap-2 px-4">
      <view
        v-for="opt in PRESET_RANGES"
        :key="opt.value"
        class="h-9 min-w-10 flex items-center justify-center rounded-full px-4"
        :class="rangeKm === opt.value ? 'bg-[#018d71]' : 'bg-white'"
        @click="emit('change-range', opt.value)"
      >
        <text :class="rangeKm === opt.value ? 'text-sm font-medium text-white' : 'text-sm text-[#666]'">
          {{ opt.label }}
        </text>
      </view>
      <!-- 自定义 Tab -->
      <view
        class="h-9 flex items-center justify-center rounded-full px-4"
        :class="rangeKm !== null && !PRESET_RANGES.some(o => o.value === rangeKm) ? 'bg-[#018d71]' : 'bg-white'"
        @click="handleCustomTab"
      >
        <text :class="rangeKm !== null && !PRESET_RANGES.some(o => o.value === rangeKm) ? 'text-sm font-medium text-white' : 'text-sm text-[#666]'">
          自定义
        </text>
      </view>
    </view>
  </scroll-view>

  <!-- 自定义距离输入行 -->
  <view v-if="showCustomInput" class="mt-2 flex items-center gap-2 px-4">
    <wd-input
      v-model="customInput"
      type="digit"
      :maxlength="4"
      placeholder="输入公里数"
      class="flex-1"
    />
    <text class="text-sm text-[#666]">km</text>
    <wd-button size="small" type="primary" @click="handleConfirmCustom">
      确定
    </wd-button>
  </view>
</view>
```

**注意：** `PRESET_RANGES.some(...)` 在模板中重复出现可读性差，建议在 `<script setup>` 中新增一个 computed：

```ts
/** 当前是否为预设范围之一 */
const isPresetActive = computed(() => props.rangeKm !== null && PRESET_RANGES.some(o => o.value === props.rangeKm))
```

模板中「自定义」Tab 的高亮类改为基于 `!isPresetActive`。

**Step 4: 提交**

```bash
git add frontend_uniapp/src/components/MatchFilterBar/MatchFilterBar.vue
git commit -m "feat(match-filter): 移除30km并支持自定义匹配距离"
```

---

### Task 2: 更新 `MatchFilterBar` 测试覆盖自定义距离

**Files:**
- Modify: `frontend_uniapp/src/components/MatchFilterBar/MatchFilterBar.test.ts`

**Step 1: 新增/调整测试用例**

在测试文件的 `wd-button` stub 之外，`handleConfirmCustom` 依赖的「确定」按钮同样使用 `wd-button`，已具备 stub，可直接触发。追加用例：

```ts
it('移除 30km 选项:不再渲染 30km', () => {
  const wrapper = mountBar({})
  expect(wrapper.text()).not.toContain('30km')
})

it('点击自定义 Tab 展开输入框,合法输入 emit change-range', async () => {
  const wrapper = mountBar({})
  const customTab = wrapper.findAll('view').find(v => v.text() === '自定义')
  expect(customTab).toBeTruthy()
  await customTab!.trigger('click')
  // 输入框出现
  expect(wrapper.findComponent({ name: 'WdInput' }).exists()).toBe(true)
  await wrapper.findComponent({ name: 'WdInput' }).setValue('20')
  await wrapper.findAll('button').find(b => b.text() === '确定')!.trigger('click')
  expect(wrapper.emitted('change-range')?.[0]).toEqual([20])
})

it('非法自定义距离(0 或超限)不 emit change-range', async () => {
  const wrapper = mountBar({})
  await wrapper.findAll('view').find(v => v.text() === '自定义')!.trigger('click')
  await wrapper.findComponent({ name: 'WdInput' }).setValue('0')
  await wrapper.findAll('button').find(b => b.text() === '确定')!.trigger('click')
  expect(wrapper.emitted('change-range')).toBeUndefined()
})
```

若测试环境未注册 `wd-input`，需在 `global.stubs` 中补充 `WdInputStub`（`name: 'WdInput'`，props `modelValue`，emits `update:modelValue`，支持 `setValue` 调用）。

**Step 2: 运行测试确认通过**

Run: `cd frontend_uniapp && npx vitest run src/components/MatchFilterBar/MatchFilterBar.test.ts`
Expected: PASS（含原有用例与新增用例）。

**Step 3: 提交**

```bash
git add frontend_uniapp/src/components/MatchFilterBar/MatchFilterBar.test.ts
git commit -m "test(match-filter): 覆盖自定义距离交互"
```

---

### Task 3: 更新 `index.vue` 默认范围与说明文案

**Files:**
- Modify: `frontend_uniapp/src/pages/index/index.vue`

**Step 1: 复核默认范围**

首页 `rangeKm` 默认值 `5` 已与 `MatchFilterBar` 的默认 `rangeKm: 5` 一致，无需修改。确认 `handleRangeChange` 已能处理任意数值（自定义距离会落入该函数，逻辑不变）。

**Step 2: 复核空结果文案**

空结果文案「附近暂无同趣,试试扩大范围或调整兴趣」已暗示用户可通过自定义距离扩大范围，无需修改。

**Step 3: 提交**

无需代码改动，若上两步均确认无误可直接跳过提交；若想固化可运行：

```bash
git add frontend_uniapp/src/pages/index/index.vue
git commit -m "chore(index): 确认自定义匹配距离生效"
```

（若 `index.vue` 无实际改动，则跳过此提交。）

---

## 收尾与验证

**手动验证路径（H5 / 微信小程序）：**
1. 进入首页，范围栏应显示 `1km / 5km / 10km / 自定义`，不再有 `30km`。
2. 点击「自定义」，出现数字输入框与「确定」按钮。
3. 输入 `0` 或 `300`，点确定 → toast 提示 `请输入 1~200 的公里数`，不触发匹配。
4. 输入 `20`，点确定 → 触发匹配刷新，范围高亮切到「自定义」，结果列表按 20km 内展示。
5. 再次点击其他预设 Tab，可正常切换回预设范围。

**运行测试：**
```bash
cd frontend_uniapp && npx vitest run src/components/MatchFilterBar/MatchFilterBar.test.ts
```

**提交建议：** 每个 Task 独立 commit，遵循「小步提交」。

---

## 参考文档
- wot-ui `wd-input` / `wd-button` 用法见 `frontend_uniapp/src/pages/profile/profile.vue`。
- 范围选择既有实现见 `MatchFilterBar.vue:55-61` 与 `index.vue:204-212`。
- 匹配范围经 `index.vue:117-125` 写入 `matchStore.setMatchResult`。
