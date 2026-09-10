import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import LocationSetter from './LocationSetter.vue'

// 阻断真实子组件模块加载:
// LocationSetter 内 `// #ifdef H5` 的 import 在 vitest 中会被真实执行,
// H5LocationPicker → @/utils/amap → @/utils → @/pages.json(含 uni 条件编译注释,
// vite:json 无法解析)。测试只关心定位能力,故整体 stub。
vi.mock('@/components/H5LocationPicker/H5LocationPicker.vue', () => ({
  default: {
    name: 'H5LocationPicker',
    props: ['visible', 'initialLat', 'initialLng', 'title'],
    emits: ['confirm', 'close'],
    template: '<view class="h5-location-picker-stub" />',
  },
}))

// vi.mock 会被提升到 import 之前,用 vi.hoisted 保证 mock 函数先于工厂可用
const mocks = vi.hoisted(() => ({
  getCurrentLocation: vi.fn(),
  reverseGeocode: vi.fn(),
}))

vi.mock('@/utils/location', () => ({
  getCurrentLocation: mocks.getCurrentLocation,
}))
vi.mock('@/utils/geo', () => ({
  reverseGeocode: mocks.reverseGeocode,
}))

// wot-ui 按钮,jsdom 未注册,stub 为受控按钮以支持 loading/disabled 断言与点击
const WdButtonStub = {
  name: 'WdButton',
  props: ['type', 'variant', 'size', 'loading', 'disabled'],
  emits: ['click'],
  template:
    '<button type="button" class="wd-button-stub" :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
}

function mountSetter(props: Record<string, unknown> = {}) {
  return mount(LocationSetter, {
    props: {
      latitude: null,
      longitude: null,
      address: null,
      title: '当前位置',
      ...props,
    },
    global: {
      stubs: {
        'wd-button': WdButtonStub,
      },
    },
  })
}

/** 按文案定位按钮(stub 按钮文本即插槽内容) */
function findButton(wrapper: ReturnType<typeof mountSetter>, text: string) {
  return wrapper.findAll('button').find(b => b.text().includes(text))
}

describe('位置设置组件 - 定位当前位置', () => {
  it('定位成功:取坐标 + 逆地理后 emit update:location', async () => {
    mocks.getCurrentLocation.mockResolvedValue({ latitude: 31.23, longitude: 121.47 })
    mocks.reverseGeocode.mockResolvedValue('上海市浦东新区世纪大道')
    const wrapper = mountSetter()

    await findButton(wrapper, '定位当前位置')!.trigger('click')
    await flushPromises()

    expect(mocks.getCurrentLocation).toHaveBeenCalledTimes(1)
    expect(mocks.reverseGeocode).toHaveBeenCalledWith(31.23, 121.47)
    expect(wrapper.emitted('update:location')?.[0]).toEqual([
      { latitude: 31.23, longitude: 121.47, address: '上海市浦东新区世纪大道' },
    ])
  })

  it('逆地理返回空串时地址兜底为「已定位」', async () => {
    mocks.getCurrentLocation.mockResolvedValue({ latitude: 30, longitude: 120 })
    mocks.reverseGeocode.mockResolvedValue('')
    const wrapper = mountSetter()

    await findButton(wrapper, '定位当前位置')!.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('update:location')?.[0]).toEqual([
      { latitude: 30, longitude: 120, address: '已定位' },
    ])
  })

  it('定位失败:提示且不 emit,不破坏原位置', async () => {
    mocks.getCurrentLocation.mockRejectedValue(new Error('permission denied'))
    const wrapper = mountSetter({ latitude: 1, longitude: 2, address: '原地址' })

    await findButton(wrapper, '定位当前位置')!.trigger('click')
    await flushPromises()

    expect(wrapper.emitted('update:location')).toBeUndefined()
    expect(uni.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: '定位失败，请检查定位权限', icon: 'none' }),
    )
    // 原地址仍正常回显
    expect(wrapper.text()).toContain('原地址')
  })

  it('定位进行中重复点击不重复发起请求', async () => {
    let resolveLoc: (v: { latitude: number, longitude: number }) => void = () => {}
    mocks.getCurrentLocation.mockImplementation(
      () => new Promise((resolve) => { resolveLoc = resolve }),
    )
    mocks.reverseGeocode.mockResolvedValue('某地址')
    const wrapper = mountSetter()

    const btn = findButton(wrapper, '定位当前位置')!
    await btn.trigger('click')
    await btn.trigger('click')
    expect(mocks.getCurrentLocation).toHaveBeenCalledTimes(1)

    resolveLoc({ latitude: 1, longitude: 2 })
    await flushPromises()
    expect(wrapper.emitted('update:location')).toHaveLength(1)
  })

  it('定位中按钮展示 loading 且选点入口被禁用', async () => {
    mocks.getCurrentLocation.mockReturnValue(new Promise(() => {}))
    const wrapper = mountSetter()

    await findButton(wrapper, '定位当前位置')!.trigger('click')
    await nextTick()

    const locatingBtn = findButton(wrapper, '定位中')
    expect(locatingBtn).toBeTruthy()
    expect(locatingBtn!.attributes('disabled')).toBeDefined()

    const chooseBtn = findButton(wrapper, '选择位置')
    expect(chooseBtn).toBeTruthy()
    expect(chooseBtn!.attributes('disabled')).toBeDefined()
  })
})
