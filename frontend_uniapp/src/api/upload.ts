import { useTokenStore } from '@/store/token'
import { getEnvBaseUrl } from '@/utils'

// ============================================================================
// 直传腾讯云 COS(新增;现有 uploadFile 走后端,保留为回退)
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
   * - 小程序端: `uni.chooseMedia` 返回的 `tempFilePath` 字符串
   * - H5: `originalFileObj` (即原生 `File` 对象)
   */
  file: string | File
  /** 文件名(H5 可选,默认从 File.name 取) */
  name?: string
  /** 业务场景:avatar / generic */
  purpose?: 'avatar' | 'generic'
}

/** IResponse 信封(本文件内只用到 data 字段) */
interface IResponse<T> {
  code: number
  data: T
  message: string
}

/** 把后端 IResponse 错误转为 Error 抛出 */
async function parseEnvelope<T>(res: { statusCode: number, data: unknown }): Promise<T> {
  if (res.statusCode >= 200 && res.statusCode < 300) {
    const envelope = res.data as IResponse<T>
    if (envelope && typeof envelope === 'object' && 'code' in envelope) {
      if (envelope.code !== 200) {
        throw new Error(envelope.message || `Upload failed: ${envelope.code}`)
      }
      return envelope.data
    }
    // 兜底:如果后端没包 IResponse(理论上不会)
    return res.data as T
  }
  // HTTP 错误码:尝试解析 message
  const data = res.data as { message?: string } | string | undefined
  const msg = (data && typeof data === 'object' && data.message) || `HTTP ${res.statusCode}`
  throw new Error(msg)
}

/**
 * 小程序端上传:走 `uni.uploadFile`,`file` 必须是 tempFilePath 字符串。
 */
// #ifndef H5
async function uploadWx(input: UploadInput): Promise<UploadResult> {
  const baseUrl = getEnvBaseUrl()
  const tokenStore = useTokenStore()
  const token = tokenStore.updateNowTime().validToken
  const authHeader: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {}

  if (typeof input.file !== 'string') {
    throw new TypeError('小程序端 file 必须是 tempFilePath 字符串')
  }
  const wxRes = (await uni.uploadFile({
    url: `${baseUrl}/api/upload`,
    filePath: input.file,
    name: 'file',
    // formData 中 additional fields 会作为额外 multipart 字段发送
    formData: { purpose: input.purpose ?? 'generic' },
    header: authHeader,
    timeout: 30000, // 上传超时比普通请求长
  })) as unknown as { statusCode: number, data: string }

  // 小程序端 data 是 string(JSON),手动 parse
  let parsed: unknown
  try {
    parsed = JSON.parse(wxRes.data)
  }
  catch {
    throw new Error(`服务器返回非 JSON: ${wxRes.data.slice(0, 100)}`)
  }
  return parseEnvelope<UploadResult>({
    statusCode: wxRes.statusCode,
    data: parsed,
  })
}
// #endif

/**
 * H5 端上传:fetch + FormData,直接用原生 File 对象。
 */
// #ifdef H5
async function uploadH5(input: UploadInput): Promise<UploadResult> {
  const baseUrl = getEnvBaseUrl()
  const tokenStore = useTokenStore()
  const token = tokenStore.updateNowTime().validToken
  const authHeader: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {}

  const h5Fd = new FormData()
  if (typeof input.file === 'string') {
    // 也支持 string(当 blob URL 之类):用 fetch 拉回来再包
    const blob = await fetch(input.file).then(r => r.blob())
    h5Fd.append('file', blob, input.name ?? 'upload.bin')
  }
  else {
    h5Fd.append('file', input.file, input.name ?? input.file.name ?? 'upload.bin')
  }
  h5Fd.append('purpose', input.purpose ?? 'generic')

  let h5Res: Response
  try {
    h5Res = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      body: h5Fd,
      headers: authHeader,
    })
  }
  catch (e) {
    throw new Error(`网络异常: ${e instanceof Error ? e.message : String(e)}`)
  }

  let h5Body: unknown
  try {
    h5Body = await h5Res.json()
  }
  catch {
    throw new Error(`服务器返回非 JSON: ${h5Res.status}`)
  }

  return parseEnvelope<UploadResult>({
    statusCode: h5Res.status,
    data: h5Body,
  })
}
// #endif

/**
 * 通用文件上传(跨平台自动路由)。
 *
 * - **小程序端**:走 `uni.uploadFile`,`file` 必须是 tempFilePath
 * - **H5**:`fetch` + `FormData`(直接用原生 File 对象)
 */
export async function uploadFile(input: UploadInput): Promise<UploadResult> {
  // #ifndef H5
  return uploadWx(input)
  // #endif
  // #ifdef H5
  return uploadH5(input)
  // #endif
}

/** 凭证提前刷新阈值:到期前 5 分钟视为失效 */
const CREDS_REFRESH_THRESHOLD_SECONDS = 300

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

/** 微信小程序端:用 uni.getFileInfo 拿真实文件大小(H5 直接用 File.size) */
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

/** 类型守卫:判断是否为 H5 端原生 File(微信小程序端传 string) */
function isH5File(file: string | File): file is File {
  return typeof file !== 'string'
}

/**
 * 直传腾讯云 COS(跨平台自动路由)。
 *
 * - **H5**(`input.file` 为 `File`):走 `cos.putObject({ Body: File })`
 * - **微信小程序**(`input.file` 为 `tempFilePath` 字符串):走 `cos.uploadFile({ Body: tempFilePath })`
 *
 * 返回的 `UploadResult` 与 `uploadFile` 形状一致,调用方可平滑切换。
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

  // H5: input.file 是 File;微信小程序: input.file 是 tempFilePath 字符串
  const mimeType = isH5File(input.file) ? input.file.type : guessMimeFromName(input.name ?? '')
  const originalName = isH5File(input.file) ? input.file.name : (input.name ?? 'upload.bin')
  const key = buildCosObjectKey({
    keyPrefix: creds.keyPrefix,
    userId: creds.userId,
    mimeType,
    originalName,
  })

  try {
    if (isH5File(input.file)) {
      // H5:走 putObject,Body 直接传 File
      await client.putObject({
        Bucket: creds.bucket,
        Region: creds.region,
        Key: key,
        Body: input.file,
        ContentType: mimeType,
      })
    }
    else {
      // 微信小程序:走 uploadFile(multipart),Body 是 tempFilePath 字符串
      await client.uploadFile({
        Bucket: creds.bucket,
        Region: creds.region,
        Key: key,
        Body: input.file,
        ContentType: mimeType,
      })
    }
  }
  catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`COS 上传失败: ${msg}`)
  }

  const size = isH5File(input.file) ? input.file.size : await getWxFileSize(input.file)
  return {
    url: buildCosPublicUrl(creds.publicBaseUrl, key),
    key,
    size,
    mimeType,
    originalName,
  }
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
