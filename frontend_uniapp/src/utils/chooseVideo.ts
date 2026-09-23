/**
 * 跨平台视频选择公共方法(打卡媒体选择:一次仅 1 个视频)。
 *
 * - 小程序 / App:`uni.chooseMedia`(mediaType: ['video']),取 `tempFilePath`;
 *   拍摄时长按平台上限夹取(见 `clampMpMaxDuration`),相册选择不受时长限制
 * - H5:`uni.chooseVideo`(`uni.chooseMedia` 在 H5 不支持),
 *   返回 blob URL,可直接作为 `uploadFileToCos` 的 `file` 入参
 *
 * 用户取消选择(errMsg 含 cancel)时静默返回 null,由调用方自行处理;
 * 其它错误向上抛出,由调用方统一 toast。
 */
export interface ChosenVideoFile {
  /** 上传入参:小程序为 tempFilePath 字符串,H5 为 blob URL 字符串 */
  file: string | File
  /** 上传文件名(用于推断 MIME 与扩展名) */
  name: string
  /** 视频时长(秒;未知为 0) */
  duration: number
  /** 视频大小(字节;未知为 0) */
  size: number
}

export interface ChooseVideoOptions {
  /** 文件名前缀,默认 `video` */
  prefix?: string
  /** 最长可拍摄时长(秒),默认 60 */
  maxDuration?: number
}

/**
 * 小程序端「拍摄」时长上限(秒)。
 *
 * 微信 `wx.chooseMedia` 的 `maxDuration` 限 3-60s,超出范围时 iOS 端会直接失败
 * (安卓不受限),故统一夹取到 60。该参数只约束「拍摄」,从相册选择视频不受限制,
 * 因此课时视频这类长视频仍可从相册选入。
 */
const MP_CAMERA_MAX_DURATION = 60

/** 把 maxDuration 夹到小程序端允许范围(仅用于 chooseMedia 的拍摄参数) */
export function clampMpMaxDuration(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0)
    return MP_CAMERA_MAX_DURATION
  return Math.min(Math.max(Math.round(seconds), 3), MP_CAMERA_MAX_DURATION)
}

/** 从临时路径推断扩展名(无扩展名时回退 mp4) */
export function extFromVideoPath(path: string): string {
  const matched = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(path)
  return matched ? matched[1].toLowerCase() : 'mp4'
}

/**
 * 选择 1 个视频。
 *
 * @returns 选中返回 `ChosenVideoFile`;用户取消返回 `null`。
 */
export async function chooseVideo(
  options?: ChooseVideoOptions,
): Promise<ChosenVideoFile | null> {
  const prefix = options?.prefix ?? 'video'
  const maxDuration = options?.maxDuration ?? 60
  let picked: ChosenVideoFile | null = null

  try {
    // #ifndef H5
    const mediaRes = await uni.chooseMedia({
      count: 1,
      mediaType: ['video'],
      sourceType: ['album', 'camera'],
      // 拍摄时长需夹到平台允许范围(相册选择不受该参数限制)
      maxDuration: clampMpMaxDuration(maxDuration),
      camera: 'back',
    })
    const tempFile = (mediaRes as unknown as {
      tempFiles?: Array<{ tempFilePath: string, duration?: number, size?: number }>
    }).tempFiles?.[0]
    if (tempFile?.tempFilePath) {
      picked = {
        file: tempFile.tempFilePath,
        // 小程序 tempFilePath 带扩展名,可直接用于推断 MIME
        name: `${prefix}-${Date.now()}.${extFromVideoPath(tempFile.tempFilePath)}`,
        duration: tempFile.duration ?? 0,
        size: tempFile.size ?? 0,
      }
    }
    // #endif

    // #ifdef H5
    const videoRes = await uni.chooseVideo({
      sourceType: ['album', 'camera'],
      maxDuration,
      camera: 'back',
      compressed: true,
    })
    const tempFilePath = (videoRes as unknown as { tempFilePath?: string }).tempFilePath
    if (tempFilePath) {
      picked = {
        // H5 为 blob URL(无扩展名),扩展名回退 mp4;真实 MIME 由上传层从 Blob.type 校正
        file: tempFilePath,
        name: `${prefix}-${Date.now()}.${extFromVideoPath(tempFilePath)}`,
        duration: (videoRes as unknown as { duration?: number }).duration ?? 0,
        size: (videoRes as unknown as { size?: number }).size ?? 0,
      }
    }
    // #endif
  }
  catch (e) {
    const err = e as Error & { errMsg?: string }
    if (err?.errMsg && /cancel/i.test(err.errMsg))
      return null
    throw err
  }

  return picked
}
