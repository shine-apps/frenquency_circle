// ============================================================================
// 直传腾讯云 COS(唯一上传通道;后端中转/本地文件上传已删除)
// ============================================================================

import { fetchCosCredentials } from '@/api/cos-credentials'
import type { CosCredentials } from '@/api/cos-credentials'
import { getCosClient } from '@/utils/cos-client'
import { buildCosObjectKey, buildCosPublicUrl } from '@/utils/cos-key'

/** 与后端 UploadResult 对齐 */
export interface UploadResult {
  url: string
  key: string
  size: number
  mimeType: string
  originalName: string
}

export interface UploadInput {
  /**
   * 文件来源:
   * - 小程序端: `uni.chooseMedia` / `chooseAvatar` 返回的 `tempFilePath` 字符串
   * - H5: 原生 `File` 对象,或 `blob:` / `data:` 临时 URL
   */
  file: string | File
  /** 文件名(H5 可选,默认从 File.name 取) */
  name?: string
  /**
   * 业务场景:avatar / generic。
   * 注:直传 COS 的 key 由后端 STS 凭证 scope(`uploads/<userId>/*`)决定,
   * 该字段当前不参与 COS key 生成,保留仅为 API 兼容。
   */
  purpose?: 'avatar' | 'generic'
}

/** 凭证提前刷新阈值:到期前 5 分钟视为失效 */
const CREDS_REFRESH_THRESHOLD_SECONDS = 300

/**
 * 上传到 COS 的 Cache-Control 头:1 年 + immutable,作为"永久缓存"的业界等价方案。
 *
 * - `max-age=31536000`:Chrome/Firefox/Safari/Edge 对超出 1 年的 max-age 一律截断,
 *   1 年是各浏览器实际接受的上限,再多写也无效。
 * - `immutable`:告知客户端/中间代理该资源 URL 在 max-age 内永远不会变化,
 *   浏览器将跳过任何条件请求(If-None-Match / If-Modified-Since),真正做到"永久"。
 *
 * 注意:此策略要求上传 key 一旦确定便不可再覆盖同 key,否则旧 URL 仍命中缓存。
 * 本项目 key 形如 `uploads/<userId>/<yyyy>/<mm>/<uuid>.<ext>`,天然满足。
 */
const COS_CACHE_CONTROL_PERMANENT = 'public, max-age=31536000, immutable'

let _cachedCreds: CosCredentials | null = null

/** 凭证是否需要刷新(null / 过期 / 即将过期) */
function needsRefresh(creds: CosCredentials | null, nowSeconds: number): boolean {
  if (!creds)
    return true
  return creds.expiredTime - nowSeconds <= CREDS_REFRESH_THRESHOLD_SECONDS
}

/** 取(可能刷新的)凭证;若刷新则更新缓存 */
async function getValidCreds(): Promise<CosCredentials> {
  const nowSeconds = Math.floor(Date.now() / 1000)
  if (!needsRefresh(_cachedCreds, nowSeconds)) {
    return _cachedCreds!
  }
  let fresh = await fetchCosCredentials()
  // 防御:若后端返回的凭证本身已经/即将过期(可能为后端缓存),主动重拉一次
  if (needsRefresh(fresh, Math.floor(Date.now() / 1000))) {
    fresh = await fetchCosCredentials()
  }
  _cachedCreds = fresh
  return fresh
}

/** 测试钩子:重置凭证缓存 */
export function __resetUploadCredsForTest(): void {
  _cachedCreds = null
}

/** 小程序端:用 uni.getFileInfo 拿真实文件大小(H5 直接用 File.size / Blob.size) */
function getWxFileSize(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    uni.getFileInfo({
      filePath,
      success: res => resolve(res.size ?? 0),
      // 失败不阻断上传,回退到 0
      fail: () => resolve(0),
    })
  })
}

/**
 * 判断字符串是否为浏览器端"可 fetch 的临时 URL":
 * - `blob:`:URL.createObjectURL / canvasToTempFilePath(H5) 产生
 * - `data:`:data URL(base64 内嵌)
 * 小程序本地临时路径(wxfile://、http://tmp/...) 不在此列,走 FilePath 由 SDK 读本地文件。
 */
function isFetchableUrl(p: string): boolean {
  return p.startsWith('blob:') || p.startsWith('data:')
}

/** 从文件名粗略推断 MIME(微信小程序 tempFilePath 没有内置 MIME) */
function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg'))
    return 'image/jpeg'
  if (lower.endsWith('.png'))
    return 'image/png'
  if (lower.endsWith('.webp'))
    return 'image/webp'
  if (lower.endsWith('.gif'))
    return 'image/gif'
  if (lower.endsWith('.pdf'))
    return 'application/pdf'
  if (lower.endsWith('.mp4'))
    return 'video/mp4'
  if (lower.endsWith('.mp3'))
    return 'audio/mpeg'
  return 'application/octet-stream'
}

/**
 * 直传腾讯云 COS(跨平台,统一 SDK 抽象,见 `@/utils/cos-client`)。
 *
 * - **H5**(`cos-js-sdk-v5`):走 `putObject`,Body 为 `File | Blob`;
 *   若传入 `blob:` / `data:` 开头的临时 URL(如 wd-img-cropper 的 canvasToTempFilePath 产物),
 *   先 `fetch()` 下载成 Blob 再上传,避免 SDK 把字符串当文本内容写入导致图片损坏。
 * - **小程序 / App**(`cos-wx-sdk-v5`):走 `uploadFile`,`FilePath` 传 tempFilePath,
 *   SDK 内部经 `wx.getFileSystemManager` 读取本地文件;大文件自动切换分片上传。
 *
 * 返回的 `UploadResult.url` 为 COS 公网地址,前后端语义一致。
 *
 * 凭证由后端 `GET /api/upload/cos-credentials` 签发(scope=`uploads/<userId>/*`),
 * 客户端做内存级缓存,到期前 5 分钟自动刷新。
 */
export async function uploadFileToCos(input: UploadInput): Promise<UploadResult> {
  if (!input.file) {
    throw new Error('file is required')
  }

  const creds = await getValidCreds()
  const client = getCosClient(creds)

  // 统一推导 mimeType / originalName
  let mimeType: string
  let originalName: string
  if (typeof input.file !== 'string') {
    mimeType = input.file.type || guessMimeFromName(input.name ?? input.file.name)
    originalName = input.name ?? input.file.name
  }
  else {
    mimeType = guessMimeFromName(input.name ?? '')
    originalName = input.name ?? 'upload.bin'
  }
  let key = buildCosObjectKey({
    keyPrefix: creds.keyPrefix,
    userId: creds.userId,
    mimeType,
    originalName,
  })

  let size = 0
  try {
    if (typeof input.file !== 'string') {
      // H5:原生 File 对象,直接 putObject
      await client.putObject({
        Bucket: creds.bucket,
        Region: creds.region,
        Key: key,
        Body: input.file,
        ContentType: mimeType,
        CacheControl: COS_CACHE_CONTROL_PERMANENT,
      })
      size = input.file.size
    }
    else if (isFetchableUrl(input.file)) {
      // H5:blob: / data: 临时 URL,先 fetch 成 Blob 再 putObject(避免把 URL 字符串当文本上传)
      const fetched = await fetch(input.file)
      if (!fetched.ok) {
        throw new Error(`读取临时图片失败: HTTP ${fetched.status}`)
      }
      const rawBlob = await fetched.blob()
      // 浏览器从文件头精确推断的 MIME 优先于 name 猜测(如 H5 chooseImage 的 .jpg 回退名),
      // 避免真实为 PNG/GIF/WEBP 时 ContentType 与 key 扩展名失真
      const realMime = rawBlob.type && rawBlob.type !== 'application/octet-stream' ? rawBlob.type : ''
      if (realMime && realMime !== mimeType) {
        mimeType = realMime
        key = buildCosObjectKey({ keyPrefix: creds.keyPrefix, userId: creds.userId, mimeType, originalName })
      }
      // fetch blob: URL 返回的 Blob.type 可能为空;若能从 filename 推断出更准确的 MIME,则重新包装
      const body: Blob = (!rawBlob.type || rawBlob.type === 'application/octet-stream') && mimeType !== 'application/octet-stream'
        ? new Blob([rawBlob], { type: mimeType })
        : rawBlob
      await client.putObject({
        Bucket: creds.bucket,
        Region: creds.region,
        Key: key,
        Body: body,
        ContentType: mimeType,
        CacheControl: COS_CACHE_CONTROL_PERMANENT,
      })
      size = body.size
    }
    else {
      // 小程序/App:tempFilePath 字符串 → FilePath,SDK 内部读本地文件
      await client.uploadFile({
        Bucket: creds.bucket,
        Region: creds.region,
        Key: key,
        FilePath: input.file,
        ContentType: mimeType,
        CacheControl: COS_CACHE_CONTROL_PERMANENT,
      })
      size = await getWxFileSize(input.file)
    }
  }
  catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`COS 上传失败: ${msg}`)
  }

  return {
    url: buildCosPublicUrl(creds.publicBaseUrl, key),
    key,
    size,
    mimeType,
    originalName,
  }
}
