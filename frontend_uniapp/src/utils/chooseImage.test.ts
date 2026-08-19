import { beforeEach, describe, expect, it, vi } from 'vitest'

import { buildH5ImageName, chooseImages, normalizeH5ImagePaths } from '@/utils/chooseImage'

/**
 * chooseImage.ts 测试。
 *
 * 注意:vitest 不处理 uni-app 条件编译注释,故 `// #ifndef H5`(chooseMedia) 与
 * `// #ifdef H5`(chooseImage) 两个分支都会执行。测试中需同时 mock 两者,
 * 且通过控制各自返回值验证对应分支行为。
 */

/** 测试内 mock uni.chooseMedia / uni.chooseImage 的便捷封装 */
function mockUniPickers() {
  const u = (globalThis as any).uni
  u.chooseMedia = vi.fn()
  u.chooseImage = vi.fn()
  return {
    chooseMedia: u.chooseMedia as ReturnType<typeof vi.fn>,
    chooseImage: u.chooseImage as ReturnType<typeof vi.fn>,
  }
}

describe('utils/chooseImage', () => {
  beforeEach(() => {
    mockUniPickers()
  })

  describe('normalizeH5ImagePaths', () => {
    it('undefined → 空数组', () => {
      expect(normalizeH5ImagePaths(undefined)).toEqual([])
    })

    it('单字符串 → 包裹为单元素数组', () => {
      expect(normalizeH5ImagePaths('blob:http://x/1')).toEqual(['blob:http://x/1'])
    })

    it('string[] → 原样返回', () => {
      const paths = ['blob:http://x/1', 'blob:http://x/2']
      expect(normalizeH5ImagePaths(paths)).toBe(paths)
    })
  })

  describe('buildH5ImageName', () => {
    it('拼接 prefix + 时间戳 + 序号 + .jpg', () => {
      const name = buildH5ImageName('cover', 2)
      expect(name).toMatch(/^cover-\d+-2\.jpg$/)
    })
  })

  describe('chooseImages count 边界', () => {
    it('count=0 直接返回空数组,不触底层 API', async () => {
      const { chooseMedia } = mockUniPickers()
      expect(await chooseImages(0)).toEqual([])
      expect(chooseMedia).not.toHaveBeenCalled()
    })

    it('count 为负数直接返回空数组', async () => {
      expect(await chooseImages(-1)).toEqual([])
    })

    it('count 非整数直接返回空数组', async () => {
      expect(await chooseImages(1.5)).toEqual([])
    })
  })

  describe('chooseImages 小程序路径(uni.chooseMedia)', () => {
    it('tempFiles 含 originalFileObj → file 取 File, name 取 File.name', async () => {
      const { chooseMedia, chooseImage } = mockUniPickers()
      const fileObj = new File(['x'], 'photo.png', { type: 'image/png' })
      chooseMedia.mockResolvedValue({
        tempFiles: [{ tempFilePath: 'wx://tmp/a.png', originalFileObj: fileObj }],
      })
      // H5 分支置空,避免干扰
      chooseImage.mockResolvedValue({ tempFilePaths: [] })

      const result = await chooseImages(1, { prefix: 'cover' })

      expect(result).toHaveLength(1)
      expect(result[0].file).toBe(fileObj)
      expect(result[0].name).toBe('photo.png')
    })

    it('tempFiles 无 originalFileObj → file 与 name 均回退到 tempFilePath', async () => {
      const { chooseMedia, chooseImage } = mockUniPickers()
      chooseMedia.mockResolvedValue({
        tempFiles: [{ tempFilePath: 'wx://tmp/abc.png' }],
      })
      chooseImage.mockResolvedValue({ tempFilePaths: [] })

      const result = await chooseImages(1)

      expect(result).toHaveLength(1)
      expect(result[0].file).toBe('wx://tmp/abc.png')
      expect(result[0].name).toBe('wx://tmp/abc.png')
    })

    it('空 mediaType 回退为 ["image"]', async () => {
      const { chooseMedia, chooseImage } = mockUniPickers()
      chooseMedia.mockResolvedValue({ tempFiles: [] })
      chooseImage.mockResolvedValue({ tempFilePaths: [] })

      await chooseImages(2, { mediaType: [] })

      expect(chooseMedia).toHaveBeenCalledWith(expect.objectContaining({ mediaType: ['image'] }))
    })
  })

  describe('chooseImages H5 路径(uni.chooseImage)', () => {
    it('tempFilePaths 为 blob URL 列表 → 逐项构造 { file, name }', async () => {
      const { chooseMedia, chooseImage } = mockUniPickers()
      chooseMedia.mockResolvedValue({ tempFiles: [] })
      chooseImage.mockResolvedValue({
        tempFilePaths: ['blob:http://x/1', 'blob:http://x/2'],
      })

      const result = await chooseImages(2, { prefix: 'cover' })

      expect(result).toHaveLength(2)
      expect(result[0].file).toBe('blob:http://x/1')
      expect(result[0].name).toMatch(/^cover-\d+-0\.jpg$/)
      expect(result[1].file).toBe('blob:http://x/2')
      expect(result[1].name).toMatch(/^cover-\d+-1\.jpg$/)
    })

    it('tempFilePaths 为单字符串时也能归一', async () => {
      const { chooseMedia, chooseImage } = mockUniPickers()
      chooseMedia.mockResolvedValue({ tempFiles: [] })
      chooseImage.mockResolvedValue({ tempFilePaths: 'blob:http://x/1' })

      const result = await chooseImages(1, { prefix: 'avatar' })

      expect(result).toHaveLength(1)
      expect(result[0].file).toBe('blob:http://x/1')
    })
  })

  describe('chooseImages 错误处理', () => {
    it('用户取消(errMsg 含 cancel) → 静默返回空数组', async () => {
      const { chooseMedia } = mockUniPickers()
      chooseMedia.mockRejectedValue({ errMsg: 'chooseMedia:fail cancel' })

      expect(await chooseImages(1)).toEqual([])
    })

    it('其它错误向上抛出,由调用方 toast', async () => {
      const { chooseMedia } = mockUniPickers()
      chooseMedia.mockRejectedValue(new Error('boom'))

      await expect(chooseImages(1)).rejects.toThrow(/boom/)
    })
  })
})
