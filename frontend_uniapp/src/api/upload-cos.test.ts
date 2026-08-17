import { beforeEach, describe, expect, it, vi } from 'vitest'

import { __resetUploadCredsForTest, uploadFileToCos } from '@/api/upload'

/**
 * uploadFileToCos 测试:mock fetchCosCredentials + cos-client + cos-key。
 *
 * 验证:
 * - H5 端(input.file 为 File):调 cos.putObject({ Body: File })
 * - 微信小程序端(input.file 为 tempFilePath):调 cos.uploadFile({ FilePath })
 * - 返回 UploadResult 形状与现有 uploadFile 一致
 * - 凭证过期前 5 分钟自动重新拉取
 */

const { fetchCredsMock, getCosClientMock, putObjectMock, uploadFileMock } = vi.hoisted(() => ({
  fetchCredsMock: vi.fn(),
  getCosClientMock: vi.fn(),
  putObjectMock: vi.fn(),
  uploadFileMock: vi.fn(),
}))

vi.mock('@/api/cos-credentials', () => ({
  fetchCosCredentials: fetchCredsMock,
}))
vi.mock('@/utils/cos-client', () => ({
  getCosClient: getCosClientMock,
}))
vi.mock('@/utils', () => ({
  // token.ts 在模块加载期会读 isDoubleTokenMode;为避免引入真实 pages.json,显式提供
  getEnvBaseUrl: () => 'http://localhost:3000',
  isDoubleTokenMode: false,
  HOME_PAGE: '/pages/index/index',
}))

const STUB_CREDS = {
  userId: 'u-abc',
  secretId: 's1',
  secretKey: 'k1',
  sessionToken: 't1',
  startTime: Math.floor(Date.now() / 1000),
  expiredTime: Math.floor(Date.now() / 1000) + 1800,
  bucket: 'b-1',
  region: 'ap-shanghai',
  keyPrefix: 'uploads',
  publicBaseUrl: 'https://cdn.example.com',
}

beforeEach(() => {
  fetchCredsMock.mockReset()
  getCosClientMock.mockReset()
  putObjectMock.mockReset()
  uploadFileMock.mockReset()
  fetchCredsMock.mockResolvedValue(STUB_CREDS)
  getCosClientMock.mockReturnValue({
    putObject: putObjectMock,
    uploadFile: uploadFileMock,
  })
  putObjectMock.mockResolvedValue({ statusCode: 200 })
  uploadFileMock.mockResolvedValue({ statusCode: 200 })
  // 重置 upload.ts 模块内凭证缓存,避免前一个测试用例影响下一个
  __resetUploadCredsForTest()
  // uni.getFileInfo 默认 mock(被 wx path 调用,test-setup.ts 未提供)
  ;(globalThis as any).uni.getFileInfo = ({ success }: { success: (r: { size: number }) => void }) =>
    success({ size: 0 })
})

describe('api/upload.uploadFileToCos', () => {
  it('rejects when file is undefined/null', async () => {
    await expect(uploadFileToCos({ file: '' as unknown as File })).rejects.toThrow(/file/i)
  })

  it('h5 path: uses cos.putObject with Body=File and returns UploadResult', async () => {
    // 模拟 H5:传 File 对象
    const blob = new Blob(['x'], { type: 'image/png' })
    const file = new File([blob], 'avatar.png', { type: 'image/png' })
    const result = await uploadFileToCos({ file, purpose: 'avatar' })
    expect(putObjectMock).toHaveBeenCalledTimes(1)
    const params = putObjectMock.mock.calls[0]?.[0]
    expect(params.Bucket).toBe('b-1')
    expect(params.Region).toBe('ap-shanghai')
    expect(params.Key).toMatch(/^uploads\/[^/]+\/\d{4}\/\d{2}\/[a-f0-9-]{36}\.png$/)
    expect(params.Body).toBe(file)
    expect(params.ContentType).toBe('image/png')
    expect(result.url).toBe(`https://cdn.example.com/${params.Key}`)
    expect(result.key).toBe(params.Key)
    expect(result.size).toBe(file.size)
    expect(result.mimeType).toBe('image/png')
    expect(result.originalName).toBe('avatar.png')
  })

  it('wx path: uses cos.uploadFile with Body=tempFilePath when file is string', async () => {
    // 模拟微信小程序:传 tempFilePath 字符串
    const tempPath = 'wx://tmp/abc.png'
    const result = await uploadFileToCos({
      file: tempPath,
      name: 'avatar.png',
      purpose: 'avatar',
    })
    expect(uploadFileMock).toHaveBeenCalledTimes(1)
    expect(putObjectMock).not.toHaveBeenCalled()
    const params = uploadFileMock.mock.calls[0]?.[0]
    expect(params.Bucket).toBe('b-1')
    expect(params.Body).toBe(tempPath)
    expect(params.ContentType).toBe('image/png')
    expect(result.url).toBe(`https://cdn.example.com/${params.Key}`)
  })

  it('refreshes credentials when expiredTime is within 5 min', async () => {
    // 第一次:凭证快过期(< 5 min)
    const almostExpired = {
      ...STUB_CREDS,
      secretId: 's-old',
      startTime: Math.floor(Date.now() / 1000) - 1700,
      expiredTime: Math.floor(Date.now() / 1000) + 60, // 1 min 后过期
    }
    fetchCredsMock.mockResolvedValueOnce(almostExpired)
    fetchCredsMock.mockResolvedValueOnce(STUB_CREDS) // 刷新后的新凭证
    // putObject 用新 client(通过 getCosClient 重建)
    getCosClientMock.mockReturnValueOnce({
      putObject: putObjectMock,
      uploadFile: uploadFileMock,
    })
    const blob = new Blob(['x'], { type: 'image/png' })
    const file = new File([blob], 'a.png', { type: 'image/png' })
    await uploadFileToCos({ file, purpose: 'avatar' })
    // 凭证过期前应重新拉取
    expect(fetchCredsMock).toHaveBeenCalledTimes(2)
  })

  it('propagates cos putObject errors', async () => {
    putObjectMock.mockRejectedValue(new Error('cos 403'))
    const blob = new Blob(['x'], { type: 'image/png' })
    const file = new File([blob], 'a.png', { type: 'image/png' })
    await expect(uploadFileToCos({ file, purpose: 'avatar' })).rejects.toThrow(/cos 403/)
  })
})
