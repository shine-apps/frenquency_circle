import { beforeEach, describe, expect, it, vi } from 'vitest'

import { followCourse, getCourses, getFollowedCourses, unfollowCourse } from '@/api/courses'

// http client 使用 uni.request,需在测试环境用 mock 驱动 success 回调
const { tokenStoreStub, uniRequestMock } = vi.hoisted(() => ({
  tokenStoreStub: {
    updateNowTime: () => tokenStoreStub,
    validToken: 'fake-token-123',
    logout: vi.fn(),
  },
  uniRequestMock: vi.fn(),
}))

vi.mock('@/store/token', () => ({
  useTokenStore: () => tokenStoreStub,
}))
// 避免加载真实 src/utils/index.ts(其内部 import { pages } from '@/pages.json',含 uni 注释,vitest 的 vite:json 无法解析)
vi.mock('@/utils', () => ({
  getEnvBaseUrl: () => 'http://localhost:3000',
  HOME_PAGE: '/pages/index/index',
  getAllPages: () => [],
}))

;(globalThis as any).uni = {
  request: uniRequestMock,
  showToast: vi.fn(),
  hideToast: vi.fn(),
  reLaunch: vi.fn(),
}

/** 安排下一次 uni.request 的成功响应 */
function mockSuccess(payload: unknown, statusCode = 200) {
  uniRequestMock.mockImplementationOnce((options: any) => {
    options.success({ statusCode, data: payload })
  })
}

beforeEach(() => {
  uniRequestMock.mockReset()
})

describe('api/courses 关注相关', () => {
  it('followCourse POSTs /api/courses/:id/follow', async () => {
    mockSuccess({ code: 200, data: { followed: true }, message: 'ok' })

    const res = await followCourse('course-1')

    const options = uniRequestMock.mock.calls[0][0]
    expect(options.url).toBe('/api/courses/course-1/follow')
    expect(options.method).toBe('POST')
    expect(res.followed).toBe(true)
  })

  it('followCourse 对 id 做 encodeURIComponent', async () => {
    mockSuccess({ code: 200, data: { followed: true }, message: 'ok' })

    await followCourse('a b/c')

    expect(uniRequestMock.mock.calls[0][0].url).toBe('/api/courses/a%20b%2Fc/follow')
  })

  it('unfollowCourse DELETEs /api/courses/:id/follow', async () => {
    mockSuccess({ code: 200, data: { followed: false }, message: 'ok' })

    const res = await unfollowCourse('course-1')

    const options = uniRequestMock.mock.calls[0][0]
    expect(options.url).toBe('/api/courses/course-1/follow')
    expect(options.method).toBe('DELETE')
    expect(res.followed).toBe(false)
  })

  it('getFollowedCourses GETs /api/courses/followed with only provided params', async () => {
    mockSuccess({
      code: 200,
      data: { list: [], total: 0, page: 1, pageSize: 20 },
      message: 'ok',
    })

    const res = await getFollowedCourses({ page: 2, pageSize: 20 })

    const options = uniRequestMock.mock.calls[0][0]
    expect(options.url).toBe('/api/courses/followed')
    expect(options.method).toBe('GET')
    // 未传的 userId 不下发,由后端取默认值(当前登录用户)
    expect(options.query).toEqual({ page: 2, pageSize: 20 })
    expect(res.total).toBe(0)
  })

  it('getFollowedCourses 透传 userId(查看他人关注的课程)', async () => {
    mockSuccess({
      code: 200,
      data: { list: [], total: 0, page: 1, pageSize: 20 },
      message: 'ok',
    })

    await getFollowedCourses({ userId: 'user-2' })

    expect(uniRequestMock.mock.calls[0][0].query).toEqual({ userId: 'user-2' })
  })

  it('getCourses 仅在传入时下发 keyword / creatorId', async () => {
    mockSuccess({
      code: 200,
      data: { list: [], total: 0, page: 1, pageSize: 10 },
      message: 'ok',
    })

    await getCourses({ page: 1, pageSize: 10, keyword: '太极', creatorId: 'user-2' })

    expect(uniRequestMock.mock.calls[0][0].query).toEqual({
      page: 1,
      pageSize: 10,
      keyword: '太极',
      creatorId: 'user-2',
    })
  })

  it('rejects on business error with server message', async () => {
    mockSuccess({ code: 404, message: '课程不存在或已下线', data: null })

    await expect(followCourse('course-1')).rejects.toThrow(/课程不存在或已下线/)
  })
})
