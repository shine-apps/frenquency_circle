import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fetchCosCredentials } from '@/api/cos-credentials'

const { tokenStoreStub, fetchMock } = vi.hoisted(() => ({
  tokenStoreStub: {
    updateNowTime: () => tokenStoreStub,
    validToken: 'fake-token-123',
  },
  fetchMock: vi.fn(),
}))

vi.mock('@/store/token', () => ({
  useTokenStore: () => tokenStoreStub,
}))
vi.mock('@/utils', async () => ({
  getEnvBaseUrl: () => 'http://localhost:3000',
}))

globalThis.fetch = fetchMock as unknown as typeof fetch

beforeEach(() => {
  fetchMock.mockReset()
})

describe('api/cos-credentials', () => {
  it('gETs /api/upload/cos-credentials with Bearer token', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        code: 200,
        data: {
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
        },
        message: 'ok',
      }),
    })
    const result = await fetchCosCredentials()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:3000/api/upload/cos-credentials')
    expect(init.method).toBe('GET')
    expect(init.headers.Authorization).toBe('Bearer fake-token-123')
    expect(result.bucket).toBe('b-1')
    expect(result.sessionToken).toBe('tok')
  })

  it('throws when not logged in (no token)', async () => {
    tokenStoreStub.validToken = ''
    await expect(fetchCosCredentials()).rejects.toThrow(/未登录|token|auth/i)
    tokenStoreStub.validToken = 'fake-token-123'
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws on HTTP error with server message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ code: 500, message: 'sts down', data: null }),
    })
    await expect(fetchCosCredentials()).rejects.toThrow(/sts down/)
  })

  it('throws on non-JSON response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json')
      },
    })
    await expect(fetchCosCredentials()).rejects.toThrow()
  })
})
