import type { HttpError, IResponse } from '@/http/types'

export enum ResultEnum {
  // 0和200当做成功都很普遍，这里直接兼容两者（PS：0和200通常都不会当做错误码，但是有的接口会返回0，有的接口会返回200）
  Success0 = 0, // 成功
  Success200 = 200, // 成功
  Error = 400, // 错误
  Unauthorized = 401, // 未授权
  Forbidden = 403, // 禁止访问（原为forbidden）
  NotFound = 404, // 未找到（原为notFound）
  MethodNotAllowed = 405, // 方法不允许（原为methodNotAllowed）
  RequestTimeout = 408, // 请求超时（原为requestTimeout）
  InternalServerError = 500, // 服务器错误（原为internalServerError）
  NotImplemented = 501, // 未实现（原为notImplemented）
  BadGateway = 502, // 网关错误（原为badGateway）
  ServiceUnavailable = 503, // 服务不可用（原为serviceUnavailable）
  GatewayTimeout = 504, // 网关超时（原为gatewayTimeout）
  HttpVersionNotSupported = 505, // HTTP版本不支持（原为httpVersionNotSupported）
}
export enum ContentTypeEnum {
  JSON = 'application/json;charset=UTF-8',
  FORM_URLENCODED = 'application/x-www-form-urlencoded;charset=UTF-8',
  FORM_DATA = 'multipart/form-data;charset=UTF-8',
}

export enum HttpErrorType {
  Business = 'business',
  Auth = 'auth',
  Http = 'http',
  Network = 'network',
}

/**
 * 判断业务码是否表示成功。
 *
 * 兼容两类约定：
 * - `0`：部分后端以 0 表示成功（见 ResultEnum.Success0）
 * - `2xx`：与 HTTP 状态码镜像。后端「创建类」接口会返回 201/203
 *   （如 `POST /api/auth/sms/send` 201、`POST /api/circles` 203），
 *   旧实现只认 0/200，会把成功响应当成业务错误 reject，
 *   导致调用方后续逻辑不执行（例如验证码倒计时不启动）。
 */
export function isSuccessResultCode(code: number): boolean {
  if (code === ResultEnum.Success0)
    return true
  return typeof code === 'number' && code >= 200 && code < 300
}

export function getResponseMessage(responseData: Partial<IResponse<any>> | undefined, fallback = '请求错误'): string {
  return responseData?.msg || responseData?.message || fallback
}

export function createHttpError<T>(params: HttpError<T>): HttpError<T> {
  return params
}
/**
 * 根据状态码，生成对应的错误信息
 * @param {number|string} status 状态码
 * @returns {string} 错误信息
 */
export function ShowMessage(status: number | string): string {
  let message: string
  switch (status) {
    case 400:
      message = '请求错误(400)'
      break
    case 401:
      message = '未授权，请重新登录(401)'
      break
    case 403:
      message = '拒绝访问(403)'
      break
    case 404:
      message = '请求出错(404)'
      break
    case 408:
      message = '请求超时(408)'
      break
    case 500:
      message = '服务器错误(500)'
      break
    case 501:
      message = '服务未实现(501)'
      break
    case 502:
      message = '网络错误(502)'
      break
    case 503:
      message = '服务不可用(503)'
      break
    case 504:
      message = '网络超时(504)'
      break
    case 505:
      message = 'HTTP版本不受支持(505)'
      break
    default:
      message = `连接出错(${status})!`
  }
  return `${message}，请检查网络或联系管理员！`
}
