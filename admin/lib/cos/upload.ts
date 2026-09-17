import { getValidCredentials } from "@/lib/cos/credentials"
import { getCosClient, normalizeCosError, type CosSdkLike } from "@/lib/cos/cos-client"
import { buildCosObjectKey, buildCosPublicUrl } from "@/lib/cos/object-key"

/**
 * 后台统一上传通道:COS 直传(与小程序端同一存储桶 / key 规范 / STS scope)。
 *
 * 文件字节不进 Next.js 进程;项目无本地上传通道,后台所有上传都走这里。
 */

/** 与后端 STS scope / 小程序端一致的返回结构 */
export interface CosUploadResult {
  url: string
  key: string
  size: number
  mimeType: string
  originalName: string
}

export interface CosUploadInput {
  file: File
  /** 上传进度(0-100,整型) */
  onProgress?: (percent: number) => void
}

/**
 * 上传到 COS 的 Cache-Control:1 年 + immutable,作为"永久缓存"方案。
 *
 * - `max-age=31536000`:各浏览器实际接受的上限,再多写也无效;
 * - `immutable`:跳过任何条件请求,真正做到"永久"。
 *
 * 注意:此策略要求同 key 永不复用。本项目 key 含 uuid,天然满足。
 */
export const COS_CACHE_CONTROL_PERMANENT = "public, max-age=31536000, immutable"

/**
 * COS 直传。失败时抛出携带可读信息的 Error,由字段组件展示,不静默。
 *
 * 超大文件由 `cos-js-sdk-v5` 自动切换分片上传(STS 已授予分片系列动作)。
 */
export async function uploadFileToCos(input: CosUploadInput): Promise<CosUploadResult> {
  const { file } = input
  if (!file) throw new Error("请选择要上传的文件")

  const creds = await getValidCredentials()
  const sdk: CosSdkLike = await getCosClient(creds)

  const mimeType = file.type || "application/octet-stream"
  const originalName = file.name || "upload.bin"
  const key = buildCosObjectKey({
    keyPrefix: creds.keyPrefix,
    userId: creds.userId,
    mimeType,
    originalName,
  })

  try {
    await new Promise<void>((resolve, reject) => {
      sdk.putObject(
        {
          Bucket: creds.bucket,
          Region: creds.region,
          Key: key,
          Body: file,
          ContentType: mimeType,
          CacheControl: COS_CACHE_CONTROL_PERMANENT,
          ...(input.onProgress
            ? {
                onProgress: (info: unknown) => {
                  const percent = (info as { percent?: number } | undefined)?.percent
                  if (typeof percent === "number") input.onProgress?.(Math.round(percent))
                },
              }
            : {}),
        },
        (err) => {
          if (err) {
            reject(normalizeCosError(err))
            return
          }
          resolve()
        }
      )
    })
  } catch (e) {
    if (e instanceof Error) throw e
    throw new Error(`COS 上传失败: ${String(e)}`)
  }

  return {
    url: buildCosPublicUrl(creds.publicBaseUrl, key),
    key,
    size: file.size,
    mimeType,
    originalName,
  }
}
