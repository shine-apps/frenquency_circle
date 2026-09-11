import { useMatchStore } from '@/store/match'
import { describe, expect, it } from 'vitest'

describe('store/match 待首页消费的兴趣筛选', () => {
  it('设置后可消费一次,再次消费返回 null(避免重复应用)', () => {
    const store = useMatchStore()
    store.setPendingTags(['书法', '国画'])

    expect(store.consumePendingTags()).toEqual(['书法', '国画'])
    expect(store.consumePendingTags()).toBeNull()
  })

  it('空数组视为清空,不产生待消费状态', () => {
    const store = useMatchStore()
    store.setPendingTags(['书法'])
    store.setPendingTags([])

    expect(store.consumePendingTags()).toBeNull()
  })

  it('clearMatch 一并重置待消费兴趣', () => {
    const store = useMatchStore()
    store.setPendingTags(['瑜伽'])
    store.clearMatch()

    expect(store.consumePendingTags()).toBeNull()
  })
})
