/**
 * 跨平台图片选择公共方法。
 *
 * - H5:调用 `uni.chooseImage`,返回 `tempFilePaths`(blob URL 数组),
 *   可直接作为 `uploadFileToCos` 的 `file` 入参(上传层经 `isFetchableUrl` 识别)
 * - 小程序端:调用 `uni.chooseMedia`,逐项取 `originalFileObj ?? tempFilePath`
 *
 * 用户取消选择(errMsg 含 cancel)时静默返回空数组,由调用方自行处理空结果;
 * 其它错误向上抛出,由调用方统一 toast。
 */
export interface ChosenImageFile {
  /** 上传入参:小程序为 tempFilePath 字符串,H5 为 blob URL 字符串 */
  file: string | File
  /** 上传文件名 */
  name: string
}

export interface ChooseImagesOptions {
  /** 文件名前缀,默认 `image` */
  prefix?: string
  /**
   * 媒体类型,默认仅图片。
   * 注意:H5 端 `uni.chooseImage` 仅支持图片,传含 video 的数组时 H5 仍只选图片。
   */
  mediaType?: Array<'image' | 'video'>
}

/**
 * H5 端 `uni.chooseImage` 返回的 `tempFilePaths` 类型不统一(string | string[]),
 * 此处统一归一为数组。纯函数,便于单测。
 *
 * H5 端 blob URL 无法保留原始文件名,由 buildH5ImageName 按序号回退;
 * 注意扩展名仅作兜底,上传层会优先采用浏览器从文件头推断的真实 MIME。
 */
// #ifdef H5
export function normalizeH5ImagePaths(raw: string | string[] | undefined): string[] {
  return Array.isArray(raw) ? raw : (typeof raw === 'string' ? [raw] : [])
}

export function buildH5ImageName(prefix: string, index: number): string {
  return `${prefix}-${Date.now()}-${index}.jpg`
}
// #endif

export async function chooseImages(
  count: number,
  options?: ChooseImagesOptions,
): Promise<ChosenImageFile[]> {
  // count 非正整数直接返回,避免底层选择 API 报错
  if (!Number.isInteger(count) || count < 1)
    return []
  const prefix = options?.prefix ?? 'image'
  const mediaType: Array<'image' | 'video'> = options?.mediaType && options.mediaType.length > 0
    ? options.mediaType
    : ['image']
  const files: ChosenImageFile[] = []

  try {
    // #ifndef H5
    const res = await uni.chooseMedia({
      count,
      mediaType,
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      maxDuration: 60,
      camera: 'back',
    })
    const tempFiles = (res as unknown as { tempFiles?: Array<{ tempFilePath: string, originalFileObj?: File }> }).tempFiles ?? []
    for (const f of tempFiles) {
      const file: string | File = f.originalFileObj ?? f.tempFilePath
      // 小程序端无 originalFileObj,name 回退到 tempFilePath(带扩展名,可推断 MIME)
      const name = f.originalFileObj?.name || f.tempFilePath || `${prefix}-${Date.now()}`
      files.push({ file, name })
    }
    // #endif

    // #ifdef H5
    const h5Res = await uni.chooseImage({
      count,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
    })
    const paths = normalizeH5ImagePaths(h5Res.tempFilePaths)
    paths.forEach((path, index) => {
      // H5 的 tempFilePaths 是 blob URL,文件名无法保留,统一按序号回退
      files.push({
        file: path,
        name: buildH5ImageName(prefix, index),
      })
    })
    // #endif
  }
  catch (e) {
    const err = e as Error & { errMsg?: string }
    if (err?.errMsg && /cancel/i.test(err.errMsg))
      return []
    throw err
  }

  return files
}
