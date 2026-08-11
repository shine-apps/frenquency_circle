import { useTokenStore } from '@/store/token'
import { getEnvBaseUrl } from '@/utils'

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
async function parseEnvelope<T>(res: { statusCode: number; data: unknown }): Promise<T> {
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
    throw new Error('小程序端 file 必须是 tempFilePath 字符串')
  }
  const wxRes = (await uni.uploadFile({
    url: `${baseUrl}/api/upload`,
    filePath: input.file,
    name: 'file',
    // formData 中 additional fields 会作为额外 multipart 字段发送
    formData: { purpose: input.purpose ?? 'generic' },
    header: authHeader,
    timeout: 30000, // 上传超时比普通请求长
  })) as unknown as { statusCode: number; data: string }

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
