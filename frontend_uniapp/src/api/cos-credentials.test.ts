import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchCosCredentials } from '@/api/cos-credentials'

const STUB_CREDENTIALS = {
  userId: 'u-abc',
  secretId: 'tmpSid',
  secretKey: 'tmpSkey',
  sessionToken: 'tok',
  startTime: 1,
  expiredTime: 2,
  bucket: 'b-1',
  region: 'ap-shanghai',
  keyPrefix: 'uploads',
  publicBaseUrl: 'https://cdn.example.com',
}

const { tokenStoreStub, requestMock } = vi.hoisted(() => ({
  tokenStoreStub: {
    updateNowTime: () => tokenStoreStub,
    validToken: 'fake-token-123',
  },
  requestMock: vi.fn(),
}))

vi.mock('@/store/token', () => ({
  useTokenStore: () => tokenStoreStub,
}))
vi.mock('@/utils', () => ({
  getEnvBaseUrl: () => 'http://localhost:3000',
  // http.ts 在模块加载期读取 isDoubleTokenMode
  isDoubleTokenMode: false,
  HOME_PAGE: '/pages/index/index',
}))

/** 模拟一次 uni.request:success / fail 由 payload 决定 */
function mockRequestOnce(payload: { statusCode?: number, data?: unknown, fail?: boolean }) {
  requestMock.mockImplementationOnce((options: {
    success: (res: { statusCode: number, data: unknown }) => void
    fail: (err: { errMsg: string }) => void
  }) => {
    if (payload.fail) {
      options.fail({ errMsg: 'request:fail' })
      return
    }
    options.success({ statusCode: payload.statusCode ?? 200, data: payload.data })
  })
}

beforeEach(() => {
  requestMock.mockReset()
  ;(globalThis as unknown as { uni: { request: unknown } }).uni.request = requestMock
})

describe('api/cos-credentials', () => {
  it('GETs /api/upload/cos-credentials via uni.request and unwraps the envelope', async () => {
    mockRequestOnce({
      statusCode: 200,
      data: { code: 200, data: STUB_CREDENTIALS, message: 'ok' },
    })

    const result = await fetchCosCredentials()

    expect(requestMock).toHaveBeenCalledTimes(1)
    const options = requestMock.mock.calls[0]?.[0] as { url: string, method: string }
    expect(options.url).toBe('/api/upload/cos-credentials')
    expect(options.method).toBe('GET')
    expect(result.bucket).toBe('b-1')
    expect(result.sessionToken).toBe('tok')
    expect(result.expiredTime).toBe(2)
  })

  it('throws when not logged in (no token)', async () => {
    tokenStoreStub.validToken = ''
    await expect(fetchCosCredentials()).rejects.toThrow(/未登录|token|auth/i)
    tokenStoreStub.validToken = 'fake-token-123'
    expect(requestMock).not.toHaveBeenCalled()
  })

  it('throws the server message when business code is not 200', async () => {
    mockRequestOnce({ statusCode: 200, data: { code: 500, message: 'sts down', data: null } })
    await expect(fetchCosCredentials()).rejects.toThrow(/sts down/)
  })

  it('throws when HTTP status is an error', async () => {
    mockRequestOnce({ statusCode: 500, data: { message: 'boom' } })
    await expect(fetchCosCredentials()).rejects.toThrow()
  })

  it('rejects on network failure', async () => {
    mockRequestOnce({ fail: true })
    await expect(fetchCosCredentials()).rejects.toThrow()
  })
})
