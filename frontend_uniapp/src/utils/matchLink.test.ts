import { HOME_PAGE_PATH } from '@/router/config'
import { useMatchStore } from '@/store/match'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { goHomeMatchWithTags } from './matchLink'

// pages.json 由 uni-pages 插件在 dev/build 时生成(未纳入版本管理),
// 测试环境用最小替身,保证 @/router/config 可解析
vi.mock('@/pages.json', () => ({
  pages: [{ path: 'pages/index/index', type: 'home' }],
  subPackages: [],
}))

/** switchTab 入参最小结构,便于模拟成功/失败分支 */
interface TabNavOptions {
  url: string
  success?: (res: unknown) => void
  fail?: (err: unknown) => void
}

describe('utils/matchLink', () => {
  beforeEach(() => {
    vi.mocked(uni.switchTab).mockImplementation(((options: TabNavOptions) => {
      options.success?.({})
    }) as never)
  })

  it('携带兴趣跳首页:写入待消费兴趣并 switchTab', () => {
    goHomeMatchWithTags(['书法'])

    expect(useMatchStore().pendingTags).toEqual(['书法'])
    expect(uni.switchTab).toHaveBeenCalledWith(expect.objectContaining({ url: HOME_PAGE_PATH }))
  })

  it('switchTab 失败时回退 reLaunch 打开首页,入口不失效', () => {
    vi.mocked(uni.switchTab).mockImplementation(((options: TabNavOptions) => {
      options.fail?.(new Error('switchTab not supported'))
    }) as never)

    goHomeMatchWithTags(['古琴'])

    expect(uni.reLaunch).toHaveBeenCalledWith(expect.objectContaining({ url: HOME_PAGE_PATH }))
  })
})
