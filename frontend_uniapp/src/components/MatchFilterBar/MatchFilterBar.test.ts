import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MatchFilterBar from './MatchFilterBar.vue'

// 阻断真实子组件模块加载(vitest 会自动 hoist vi.mock, 不影响顺序):
// - LocationSetter 内部 #ifdef H5 会引入 H5LocationPicker → @/utils/amap → @/utils → @/pages.json
//   (pages.json 含 uni 条件编译注释, vitest 的 vite:json 无法解析)
// - TagSelectorPopup 依赖 api/store/dialog 等, 测试只关心透传行为
vi.mock('@/components/LocationSetter/LocationSetter.vue', () => ({
  default: {
    name: 'LocationSetter',
    props: ['latitude', 'longitude', 'address', 'title'],
    emits: ['update:location'],
    template: '<view class="location-setter-stub" @click="$emit(\'update:location\', { latitude: 1, longitude: 2, address: \'测试地址\' })" />',
  },
}))

vi.mock('@/components/TagSelectorPopup/TagSelectorPopup.vue', () => ({
  default: {
    name: 'TagSelectorPopup',
    props: ['modelValue', 'initialTags'],
    emits: ['confirm', 'cancel', 'update:modelValue'],
    template: '<view class="tag-selector-popup-stub" />',
  },
}))

const WdButtonStub = {
  name: 'WdButton',
  emits: ['click'],
  template: '<button type="button" class="wd-button-stub" @click="$emit(\'click\')"><slot /></button>',
}

// wot-ui 输入框,jsdom 未注册,stub 为受控输入以支持 v-model 与 setValue
const WdInputStub = {
  name: 'WdInput',
  props: ['modelValue'],
  emits: ['update:modelValue'],
  template: '<input class="wd-input-stub" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
}

// uni-app 内置组件,jsdom 未注册,stub 为普通容器消除警告
const ScrollViewStub = {
  name: 'ScrollView',
  template: '<view class="scroll-view-stub"><slot /></view>',
}

function mountBar(props: Record<string, unknown> = {}) {
  return mount(MatchFilterBar, {
    props: {
      userTags: [],
      latitude: null,
      longitude: null,
      address: '',
      rangeKm: 5,
      ready: true,
      ...props,
    },
    global: {
      stubs: {
        'wd-button': WdButtonStub,
        'wd-input': WdInputStub,
        'scroll-view': ScrollViewStub,
      },
    },
  })
}

describe('匹配过滤栏组件', () => {
  it('已选兴趣时展示数量徽标与标签列表', () => {
    const wrapper = mountBar({ userTags: ['跑步', '阅读'] })
    expect(wrapper.text()).toContain('我的兴趣')
    expect(wrapper.text()).toContain('2 个')
    expect(wrapper.text()).toContain('跑步')
    expect(wrapper.text()).toContain('阅读')
  })

  it('未选择兴趣时展示"未选择"与引导文案', () => {
    const wrapper = mountBar({ userTags: [] })
    expect(wrapper.text()).toContain('未选择')
    expect(wrapper.text()).toContain('选择兴趣可获得更精准推荐')
  })

  it('点击兴趣编辑按钮 emit edit-tags 并打开内嵌弹窗', async () => {
    const wrapper = mountBar({ userTags: ['跑步'] })
    await wrapper.find('.wd-button-stub').trigger('click')
    expect(wrapper.emitted('edit-tags')).toHaveLength(1)
    // 弹窗显隐由组件自管:点击后 modelValue 置为 true
    expect(wrapper.findComponent({ name: 'TagSelectorPopup' }).props('modelValue')).toBe(true)
  })

  it('内嵌 TagSelectorPopup confirm 时透传 confirm-tags', async () => {
    const wrapper = mountBar({ userTags: ['跑步'] })
    const popup = wrapper.findComponent({ name: 'TagSelectorPopup' })
    await popup.vm.$emit('confirm', ['跑步', '摄影'])
    expect(wrapper.emitted('confirm-tags')?.[0]).toEqual([['跑步', '摄影']])
  })

  it('位置组件选点结果原样透传为 update:location', async () => {
    const wrapper = mountBar({})
    await wrapper.find('.location-setter-stub').trigger('click')
    expect(wrapper.emitted('update:location')?.[0]).toEqual([{ latitude: 1, longitude: 2, address: '测试地址' }])
  })

  it('点击范围 Tab emit change-range 并携带对应 value', async () => {
    const wrapper = mountBar({ rangeKm: 5 })
    const option = wrapper.findAll('view').find(v => v.text() === '10km')
    expect(option).toBeTruthy()
    await option!.trigger('click')
    expect(wrapper.emitted('change-range')?.[0]).toEqual([10])
  })

  it('rangeKm 由 props 受控:当前项高亮且组件不修改传入值', () => {
    const wrapper = mountBar({ rangeKm: 10 })
    expect(wrapper.html()).toContain('bg-[#018d71]')
    expect(wrapper.emitted('change-range')).toBeUndefined()
  })

  it('移除 30km 选项:不再渲染 30km', () => {
    const wrapper = mountBar({})
    expect(wrapper.text()).not.toContain('30km')
    expect(wrapper.text()).toContain('自定义')
  })

  it('点击自定义 Tab 展开输入框,合法输入 emit change-range', async () => {
    const wrapper = mountBar({})
    const customTab = wrapper.findAll('view').find(v => v.text() === '自定义')
    expect(customTab).toBeTruthy()
    await customTab!.trigger('click')
    expect(wrapper.findComponent({ name: 'WdInput' }).exists()).toBe(true)
    await wrapper.findComponent({ name: 'WdInput' }).setValue('20')
    const confirmBtn = wrapper.findAll('button').find(b => b.text() === '确定')
    expect(confirmBtn).toBeTruthy()
    await confirmBtn!.trigger('click')
    expect(wrapper.emitted('change-range')?.[0]).toEqual([20])
  })

  it('非法自定义距离(0 或超限)不 emit change-range', async () => {
    const wrapper = mountBar({})
    await wrapper.findAll('view').find(v => v.text() === '自定义')!.trigger('click')
    await wrapper.findComponent({ name: 'WdInput' }).setValue('0')
    const confirmBtn = wrapper.findAll('button').find(b => b.text() === '确定')
    await confirmBtn!.trigger('click')
    expect(wrapper.emitted('change-range')).toBeUndefined()
  })

  it('点击预设 Tab 后收起自定义输入框并 emit change-range', async () => {
    const wrapper = mountBar({})
    // 展开自定义输入框
    await wrapper.findAll('view').find(v => v.text() === '自定义')!.trigger('click')
    expect(wrapper.findComponent({ name: 'WdInput' }).exists()).toBe(true)
    // 点击预设 5km
    const preset = wrapper.findAll('view').find(v => v.text() === '5km')
    expect(preset).toBeTruthy()
    await preset!.trigger('click')
    expect(wrapper.emitted('change-range')?.[0]).toEqual([5])
    expect(wrapper.findComponent({ name: 'WdInput' }).exists()).toBe(false)
  })
})
