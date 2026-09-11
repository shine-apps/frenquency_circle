import { beforeEach, describe, expect, it, vi } from 'vitest'
import { closeHomeMbtiEntry, isHomeMbtiEntryClosed } from './home-mbti-entry'

/** 内存版 storage,让 close → isClosed 走真实往返 */
const storage = new Map<string, unknown>()

describe('utils/home-mbti-entry', () => {
  beforeEach(() => {
    storage.clear()
    vi.mocked(uni.getStorageSync).mockImplementation((key: string) => (storage.has(key) ? storage.get(key) : null) as never)
    vi.mocked(uni.setStorageSync).mockImplementation(((key: string, value: unknown) => {
      storage.set(key, value)
    }) as never)
  })

  it('默认未关闭', () => {
    expect(isHomeMbtiEntryClosed()).toBe(false)
  })

  it('关闭后记录状态,再次读取为已关闭', () => {
    closeHomeMbtiEntry()

    expect(isHomeMbtiEntryClosed()).toBe(true)
  })

  it('读取异常时按未关闭处理,不阻断首页渲染', () => {
    vi.mocked(uni.getStorageSync).mockImplementation(() => {
      throw new Error('storage broken')
    })

    expect(isHomeMbtiEntryClosed()).toBe(false)
  })
})
