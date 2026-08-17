import { beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetCosClientForTest, getCosClient } from '@/utils/cos-client'

const { CosCtor, putObjectMock, uploadFileMock } = vi.hoisted(() => ({
  CosCtor: vi.fn(),
  putObjectMock: vi.fn(),
  uploadFileMock: vi.fn(),
}))

vi.mock('cos-js-sdk-v5', () => ({
  default: vi.fn().mockImplementation(() => ({
    putObject: putObjectMock,
    uploadFile: uploadFileMock,
  })),
}))

beforeEach(() => {
  CosCtor.mockClear()
  putObjectMock.mockReset()
  uploadFileMock.mockReset()
  __resetCosClientForTest()
})

describe('utils/cos-client', () => {
  it('constructs COS instance with STS creds + session token', async () => {
    putObjectMock.mockResolvedValue({ statusCode: 200 })
    const creds = {
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
    await getCosClient(creds)
    const { default: COS } = await import('cos-js-sdk-v5')
    expect(COS).toHaveBeenCalledWith({
      SecretId: 'tmpSid',
      SecretKey: 'tmpSkey',
      SecurityToken: 'tok',
    })
  })

  it('reuses cached instance when same creds passed', async () => {
    putObjectMock.mockResolvedValue({ statusCode: 200 })
    const creds = {
      userId: 'u-1',
      secretId: 's1',
      secretKey: 'k1',
      sessionToken: 't1',
      startTime: 1,
      expiredTime: 2,
      bucket: 'b',
      region: 'r',
      keyPrefix: 'p',
      publicBaseUrl: 'u',
    }
    await getCosClient(creds)
    await getCosClient(creds)
    const { default: COS } = await import('cos-js-sdk-v5')
    // 同一凭证只构造一次
    expect(COS).toHaveBeenCalledTimes(1)
  })

  it('reconstructs when secretId changes (creds refreshed)', async () => {
    putObjectMock.mockResolvedValue({ statusCode: 200 })
    await getCosClient({
      userId: 'u-1',
      secretId: 's1',
      secretKey: 'k1',
      sessionToken: 't1',
      startTime: 1,
      expiredTime: 2,
      bucket: 'b',
      region: 'r',
      keyPrefix: 'p',
      publicBaseUrl: 'u',
    })
    await getCosClient({
      userId: 'u-1',
      secretId: 's2',
      secretKey: 'k2',
      sessionToken: 't2',
      startTime: 3,
      expiredTime: 4,
      bucket: 'b',
      region: 'r',
      keyPrefix: 'p',
      publicBaseUrl: 'u',
    })
    const { default: COS } = await import('cos-js-sdk-v5')
    expect(COS).toHaveBeenCalledTimes(2)
  })
})
