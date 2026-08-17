import { describe, expect, it, vi } from 'vitest'

import { buildCosObjectKey, buildCosPublicUrl } from '@/utils/cos-key'

// 固定时间，避免测试因时间漂移失败
vi.useFakeTimers().setSystemTime(new Date('2026-08-17T03:30:00Z'))

describe('utils/cos-key', () => {
  it('buildCosObjectKey returns <prefix>/<userId>/<yyyy>/<mm>/<uuid>.<ext>', () => {
    const key = buildCosObjectKey({
      keyPrefix: 'uploads',
      userId: 'u-abc',
      mimeType: 'image/png',
      originalName: 'avatar.PNG',
    })
    expect(key).toMatch(/^uploads\/u-abc\/2026\/08\/[a-f0-9-]{36}\.png$/)
  })

  it('uses .jpg for image/jpeg regardless of originalName', () => {
    const key = buildCosObjectKey({
      keyPrefix: 'uploads',
      userId: 'u-1',
      mimeType: 'image/jpeg',
      originalName: 'photo.txt',
    })
    expect(key.endsWith('.jpg')).toBe(true)
  })

  it('falls back to .bin when MIME unknown', () => {
    const key = buildCosObjectKey({
      keyPrefix: 'uploads',
      userId: 'u-1',
      mimeType: 'application/octet-stream',
      originalName: 'x.exe',
    })
    expect(key.endsWith('.bin')).toBe(true)
  })

  it('omits prefix segment when keyPrefix is empty', () => {
    const key = buildCosObjectKey({
      keyPrefix: '',
      userId: 'u-1',
      mimeType: 'image/png',
      originalName: 'a.png',
    })
    expect(key).toMatch(/^u-1\/2026\/08\/[a-f0-9-]{36}\.png$/)
  })

  it('buildCosPublicUrl joins publicBaseUrl + key with single slash', () => {
    const url = buildCosPublicUrl('https://cdn.example.com', 'uploads/u-1/2026/08/abc.png')
    expect(url).toBe('https://cdn.example.com/uploads/u-1/2026/08/abc.png')
  })

  it('buildCosPublicUrl tolerates trailing slash in publicBaseUrl', () => {
    const url = buildCosPublicUrl('https://cdn.example.com/', 'uploads/u-1/x.png')
    expect(url).toBe('https://cdn.example.com/uploads/u-1/x.png')
  })
})
