import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/api/notifications'

// http client 使用 uni.request,需在测试环境用 mock 驱动 success 回调
const { tokenStoreStub, uniRequestMock } = vi.hoisted(() => ({
  tokenStoreStub: {
    updateNowTime: () => tokenStoreStub,
    validToken: 'fake-token-123',
    tokenInfo: { refreshToken: '' },
    logout: vi.fn(),
    refreshToken: vi.fn(),
  },
  uniRequestMock: vi.fn(),
}))

vi.mock('@/store/token', () => ({
  useTokenStore: () => tokenStoreStub,
}))
// 避免加载真实 src/utils/index.ts(其内部 import { pages } from '@/pages.json',含 uni 注释,vitest 的 vite:json 无法解析)
vi.mock('@/utils', () => ({
  getEnvBaseUrl: () => 'http://localhost:3000',
  isDoubleTokenMode: false,
  HOME_PAGE: '/pages/index/index',
}))

// 提供 uni 命名空间(uni.request / 弹窗等)
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
  tokenStoreStub.validToken = 'fake-token-123'
})

describe('api/notifications', () => {
  it('getNotifications GETs with query params and returns data', async () => {
    mockSuccess({
      code: 200,
      data: {
        list: [
          {
            id: 'n1',
            actorId: 'a1',
            entityType: 'circle',
            entityId: 'c1',
            type: 'circle_followed',
            title: '有人关注了你的圈子',
            content: '小李 关注了 太极圈',
            linkUrl: '/pages/circle/circle?id=c1',
            linkTarget: 'miniprogram',
            readAt: null,
            createdAt: '2026-08-19T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      },
      message: 'ok',
    })

    const res = await getNotifications({ page: 1, pageSize: 20, unreadOnly: true })
    expect(uniRequestMock).toHaveBeenCalledTimes(1)
    const options = uniRequestMock.mock.calls[0][0]
    expect(options.url).toBe('/api/notifications')
    expect(options.method).toBe('GET')
    // query 由 http 客户端放到 options.query(GET 时 uni.request 会序列化为 URL 参数)
    expect(options.query).toMatchObject({ page: 1, pageSize: 20, unreadOnly: true })
    expect(res.list).toHaveLength(1)
    expect(res.total).toBe(1)
  })

  it('getUnreadNotificationCount GETs unread-count', async () => {
    mockSuccess({ code: 200, data: { count: 5 }, message: 'ok' })
    const res = await getUnreadNotificationCount()
    const options = uniRequestMock.mock.calls[0][0]
    expect(options.url).toContain('/api/notifications/unread-count')
    expect(res.count).toBe(5)
  })

  it('markNotificationRead PATCHes /api/notifications/:id', async () => {
    mockSuccess({ code: 200, data: { marked: true }, message: 'ok' })
    const res = await markNotificationRead('n1')
    const options = uniRequestMock.mock.calls[0][0]
    expect(options.url).toContain('/api/notifications/n1')
    expect(options.method).toBe('PATCH')
    expect(res.marked).toBe(true)
  })

  it('markAllNotificationsRead POSTs /api/notifications/read-all', async () => {
    mockSuccess({ code: 200, data: { marked: 2 }, message: 'ok' })
    const res = await markAllNotificationsRead()
    const options = uniRequestMock.mock.calls[0][0]
    expect(options.url).toContain('/api/notifications/read-all')
    expect(options.method).toBe('POST')
    expect(res.marked).toBe(2)
  })

  it('rejects on business error with server message', async () => {
    mockSuccess({ code: 500, message: 'db error', data: null })
    await expect(getNotifications()).rejects.toThrow(/db error/)
  })
})
