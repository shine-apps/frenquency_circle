import Taro from '@tarojs/taro'

import { getToken } from './request'

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
   * - weapp/tt: Taro.chooseMedia 返回的 `tempFilePath` 字符串
   * - H5: `originalFileObj` (即原生 `File` 对象)
   */
  file: string | File
  /** 文件名(weapp 必填;H5 可选,默认从 File.name 取) */
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

/** 取当前 Taro 运行端(weapp / h5 / tt / swan / alipay / jd / qq ...) */
function getEnv(): string {
  return process.env.TARO_ENV ?? 'h5'
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
 * 通用文件上传。
 *
 * 三端分支:
 * - **weapp / tt**:走 `Taro.uploadFile`,`file` 必须是 tempFilePath
 *   (Taro 4.x 的 `Taro.uploadFile` 返回 `data: string`,需手动 JSON.parse)
 * - **H5**:`fetch` + `FormData`(`Taro.uploadFile` 在 H5 不传真实 File,且 `Taro.request`
 *   会强制 `Content-Type: application/json` 破坏 multipart boundary,故独立处理)
 *
 * 不复用 `request<T>`:multipart 序列化与 `Taro.request` 默认 JSON 序列化冲突。
 */
export async function uploadFile(input: UploadInput): Promise<UploadResult> {
  const env = getEnv()
  const isWeappLike = env === 'weapp' || env === 'tt'

  // 构造通用 headers(Authorization)
  const token = getToken()
  const authHeader: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {}

  if (isWeappLike) {
    // weapp/tt: file 必须是字符串(tempFilePath)
    if (typeof input.file !== 'string') {
      throw new Error('weapp/tt 端 file 必须是 tempFilePath 字符串')
    }
    const res = (await Taro.uploadFile({
      url: `${API_BASE_URL}/api/upload`,
      filePath: input.file,
      name: 'file',
      // formData 中 additional fields 会作为额外 multipart 字段发送
      formData: { purpose: input.purpose ?? 'generic' },
      header: authHeader,
      timeout: 30000, // 上传超时比普通请求长
    })) as { statusCode: number; data: string }

    // weapp 端 data 是 string(JSON),手动 parse
    let parsed: unknown
    try {
      parsed = JSON.parse(res.data)
    } catch {
      throw new Error(`服务器返回非 JSON: ${res.data.slice(0, 100)}`)
    }
    return parseEnvelope<UploadResult>({
      statusCode: res.statusCode,
      data: parsed,
    })
  }

  // H5 / 其它:fetch + FormData
  const fd = new FormData()
  if (typeof input.file === 'string') {
    // 也支持 string(当 blob URL 之类):用 fetch 拉回来再包
    const blob = await fetch(input.file).then((r) => r.blob())
    fd.append('file', blob, input.name ?? 'upload.bin')
  } else {
    fd.append('file', input.file, input.name ?? input.file.name ?? 'upload.bin')
  }
  fd.append('purpose', input.purpose ?? 'generic')

  let res: Response
  try {
    res = await fetch(`${API_BASE_URL}/api/upload`, {
      method: 'POST',
      body: fd,
      headers: authHeader,
    })
  } catch (e) {
    throw new Error(
      `网络异常: ${e instanceof Error ? e.message : String(e)}`
    )
  }

  let body: unknown
  try {
    body = await res.json()
  } catch {
    throw new Error(`服务器返回非 JSON: ${res.status}`)
  }

  return parseEnvelope<UploadResult>({
    statusCode: res.status,
    data: body,
  })
}
