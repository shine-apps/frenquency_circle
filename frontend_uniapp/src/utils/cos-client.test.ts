import { beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetCosClientForTest, getCosClient } from '@/utils/cos-client'

const { putObjectMock, uploadFileMock } = vi.hoisted(() => ({
  putObjectMock: vi.fn(),
  uploadFileMock: vi.fn(),
}))

vi.mock('cos-js-sdk-v5', () => ({
  default: vi.fn().mockImplementation(() => ({
    putObject: putObjectMock,
    uploadFile: uploadFileMock,
  })),
}))

// cos-client.ts 通过条件编译二选一:vitest 不做条件编译,两个 SDK 都会被 import,
// 因此这里同时 mock,保证模块在 jsdom 下可加载(真实运行时只会打包其一)。
vi.mock('cos-wx-sdk-v5', () => ({
  default: vi.fn().mockImplementation(() => ({
    putObject: putObjectMock,
    uploadFile: uploadFileMock,
  })),
}))

const CREDS_A = {
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

beforeEach(() => {
  putObjectMock.mockReset()
  uploadFileMock.mockReset()
  __resetCosClientForTest()
})

describe('utils/cos-client', () => {
  it('constructs COS instance with STS creds + session token', async () => {
    getCosClient(CREDS_A)
    const { default: COS } = await import('cos-js-sdk-v5')
    expect(COS).toHaveBeenCalledWith({
      SecretId: 'tmpSid',
      SecretKey: 'tmpSkey',
      SecurityToken: 'tok',
    })
  })

  it('reuses cached instance when same creds passed', async () => {
    getCosClient(CREDS_A)
    getCosClient({ ...CREDS_A })
    const { default: COS } = await import('cos-js-sdk-v5')
    // 同一凭证只构造一次
    expect(COS).toHaveBeenCalledTimes(1)
  })

  it('reconstructs when secretId changes (creds refreshed)', async () => {
    getCosClient(CREDS_A)
    getCosClient({ ...CREDS_A, secretId: 's2', secretKey: 'k2', sessionToken: 't2' })
    const { default: COS } = await import('cos-js-sdk-v5')
    expect(COS).toHaveBeenCalledTimes(2)
  })

  it('putObject forwards params and resolves on SDK success', async () => {
    putObjectMock.mockImplementation((_params: unknown, cb: (err: null) => void) => cb(null))
    const client = getCosClient(CREDS_A)
    const params = {
      Bucket: 'b-1',
      Region: 'ap-shanghai',
      Key: 'uploads/u-abc/2026/09/x.png',
      Body: new Blob(['x']),
      ContentType: 'image/png',
      CacheControl: 'public, max-age=31536000, immutable',
    }
    await expect(client.putObject(params)).resolves.toBeUndefined()
    expect(putObjectMock).toHaveBeenCalledTimes(1)
    expect(putObjectMock.mock.calls[0]?.[0]).toEqual(params)
  })

  it('putObject rejects with the SDK error message', async () => {
    putObjectMock.mockImplementation((_params: unknown, cb: (err: unknown) => void) =>
      cb({ error: { message: 'cos 403' } }))
    const client = getCosClient(CREDS_A)
    await expect(client.putObject({
      Bucket: 'b-1',
      Region: 'ap-shanghai',
      Key: 'k',
      Body: new Blob(['x']),
      ContentType: 'image/png',
      CacheControl: 'c',
    })).rejects.toThrow(/cos 403/)
  })

  it('uploadFile forwards FilePath params and rejects on flat error message', async () => {
    uploadFileMock.mockImplementation((_params: unknown, cb: (err: unknown) => void) =>
      cb({ message: 'file not found' }))
    const client = getCosClient(CREDS_A)
    await expect(client.uploadFile({
      Bucket: 'b-1',
      Region: 'ap-shanghai',
      Key: 'k',
      FilePath: 'wxfile://tmp/a.png',
      ContentType: 'image/png',
      CacheControl: 'c',
    })).rejects.toThrow(/file not found/)
    expect(uploadFileMock).toHaveBeenCalledTimes(1)
    expect(uploadFileMock.mock.calls[0]?.[0]).toMatchObject({ FilePath: 'wxfile://tmp/a.png' })
  })
})
