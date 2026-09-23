import { beforeEach, describe, expect, it, vi } from 'vitest'

import { chooseVideo, clampMpMaxDuration, extFromVideoPath } from '@/utils/chooseVideo'

/**
 * chooseVideo.ts 测试。
 *
 * 注意:vitest 不处理 uni-app 条件编译注释,故 `// #ifndef H5`(chooseMedia) 与
 * `// #ifdef H5`(chooseVideo) 两个分支都会执行。测试中需同时 mock 两者,
 * 且通过控制各自返回值验证对应分支行为(mp 分支命中时 H5 分支返回空值即可)。
 */

/** 测试内 mock uni.chooseMedia / uni.chooseVideo 的便捷封装 */
function mockUniVideoPickers() {
  const u = (globalThis as any).uni
  u.chooseMedia = vi.fn()
  u.chooseVideo = vi.fn()
  return {
    chooseMedia: u.chooseMedia as ReturnType<typeof vi.fn>,
    chooseVideo: u.chooseVideo as ReturnType<typeof vi.fn>,
  }
}

describe('utils/chooseVideo', () => {
  beforeEach(() => {
    mockUniVideoPickers()
  })

  describe('clampMpMaxDuration', () => {
    it('超过 60s → 夹到 60(微信拍摄上限)', () => {
      expect(clampMpMaxDuration(60 * 30)).toBe(60)
    })

    it('范围内的值原样返回', () => {
      expect(clampMpMaxDuration(30)).toBe(30)
    })

    it('低于下限 3s → 夹到 3', () => {
      expect(clampMpMaxDuration(1)).toBe(3)
    })

    it('非法值(0 / NaN)→ 回退上限 60', () => {
      expect(clampMpMaxDuration(0)).toBe(60)
      expect(clampMpMaxDuration(Number.NaN)).toBe(60)
    })
  })

  describe('extFromVideoPath', () => {
    it('取扩展名并小写', () => {
      expect(extFromVideoPath('wx://tmp/a.MOV')).toBe('mov')
    })

    it('无扩展名 → 回退 mp4', () => {
      expect(extFromVideoPath('blob:http://localhost/9a1b')).toBe('mp4')
    })
  })

  describe('chooseVideo 小程序路径(uni.chooseMedia)', () => {
    it('maxDuration 超过平台上限时按 60 传给 chooseMedia', async () => {
      const { chooseMedia, chooseVideo: chooseVideoApi } = mockUniVideoPickers()
      chooseMedia.mockResolvedValue({
        tempFiles: [{ tempFilePath: 'wx://tmp/lesson.mp4', size: 2048, duration: 95 }],
      })
      // H5 分支置空,避免干扰
      chooseVideoApi.mockResolvedValue({})

      const picked = await chooseVideo({ prefix: 'lesson', maxDuration: 60 * 30 })

      expect(chooseMedia).toHaveBeenCalledWith(expect.objectContaining({ maxDuration: 60 }))
      expect(picked?.file).toBe('wx://tmp/lesson.mp4')
      expect(picked?.name).toMatch(/^lesson-\d+\.mp4$/)
      expect(picked?.duration).toBe(95)
      expect(picked?.size).toBe(2048)
    })

    it('用户取消(errMsg 含 cancel)→ 返回 null', async () => {
      const { chooseMedia, chooseVideo: chooseVideoApi } = mockUniVideoPickers()
      chooseMedia.mockRejectedValue({ errMsg: 'chooseMedia:fail cancel' })
      chooseVideoApi.mockRejectedValue({ errMsg: 'chooseVideo:fail cancel' })

      expect(await chooseVideo()).toBeNull()
    })

    it('其它错误向上抛出(由调用方 toast)', async () => {
      const { chooseMedia, chooseVideo: chooseVideoApi } = mockUniVideoPickers()
      chooseMedia.mockRejectedValue(new Error('boom'))
      chooseVideoApi.mockRejectedValue(new Error('boom'))

      await expect(chooseVideo()).rejects.toThrow('boom')
    })
  })
})
