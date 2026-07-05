import Taro from '@tarojs/taro'

/** 本地存储 key */
const TOKEN_KEY = 'auth_token'
/** 请求超时(ms) */
const TIMEOUT = 10000

/** 后端 IResponse 信封 */
interface IResponse<T> {
  code: number
  data: T
  message: string
  details?: unknown
}

/** 读取本地存储的 auth token */
export function getToken(): string | null {
  try {
    return Taro.getStorageSync(TOKEN_KEY) || null
  } catch {
    return null
  }
}

/** 持久化 auth token */
export function setToken(token: string): void {
  Taro.setStorageSync(TOKEN_KEY, token)
}

/** 清除 auth token */
export function clearToken(): void {
  try {
    Taro.removeStorageSync(TOKEN_KEY)
  } catch {
    // 忽略存储异常
  }
}

interface RequestOptions {
  url: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** 请求体(POST/PUT/PATCH);GET/DELETE 时若需 query 请用 `params` */
  data?: Record<string, unknown>
  /** GET/DELETE query 参数(自动拼接到 URL query string) */
  params?: Record<string, unknown>
  /** 是否跳过 Authorization 头(登录接口本身不需要) */
  skipAuth?: boolean
}

/**
 * 把 params 对象序列化为 URL query string。
 * - 数组值序列化为逗号分隔字符串(后端 `tagIds=a,b,c` 解析)
 * - undefined / null 跳过
 * - 已存在的 query string 会被追加(以 `&` 连接)
 */
function appendQuery(
  url: string,
  params: Record<string, unknown> | undefined
): string {
  if (!params) return url
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    let v: string
    if (Array.isArray(value)) {
      v = value.join(',')
    } else if (typeof value === 'object') {
      // 不支持嵌套对象,直接 JSON 化(理论上业务接口不会用)
      v = JSON.stringify(value)
    } else {
      v = String(value)
    }
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`)
  }
  if (parts.length === 0) return url
  return url.includes('?') ? `${url}&${parts.join('&')}` : `${url}?${parts.join('&')}`
}

/**
 * 统一请求封装。
 * - 自动拼接 API_BASE_URL(defineConstants 注入)
 * - 自动注入 Authorization: Bearer
 * - 解析 IResponse<T> 信封,返回 data 字段
 * - 401 时清 token 并跳转登录页
 */
export async function request<T = unknown>(
  options: RequestOptions
): Promise<T> {
  const { method = 'GET', data, params, skipAuth = false } = options
  const url = appendQuery(options.url, params)

  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (!skipAuth) {
    const token = getToken()
    if (token) header['Authorization'] = `Bearer ${token}`
  }

  let res: { statusCode: number; data: unknown }
  try {
    res = (await Taro.request({
      url: `${API_BASE_URL}${url}`,
      method,
      data,
      header,
      timeout: TIMEOUT,
    })) as { statusCode: number; data: unknown }
  } catch {
    throw new Error('网络异常,请稍后重试')
  }

  // HTTP 401:token 失效,清除并跳转登录
  if (res.statusCode === 401) {
    clearToken()
    Taro.reLaunch({ url: '/pages/login/index' })
    throw new Error('登录已过期,请重新登录')
  }

  const body = res.data as IResponse<T>
  if (!body || typeof body.code !== 'number') {
    throw new Error('服务器响应格式异常')
  }

  // 业务层错误(4xx/5xx)
  if (body.code < 200 || body.code >= 300) {
    throw new Error(body.message || '请求失败')
  }

  return body.data
}
