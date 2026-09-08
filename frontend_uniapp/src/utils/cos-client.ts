// #ifdef H5
import CosJs from 'cos-js-sdk-v5'
// #endif
// #ifdef MP-WEIXIN
import CosWx from 'cos-wx-sdk-v5'
// #endif

import type { CosCredentials } from '@/api/cos-credentials'

/**
 * COS SDK 单例管理(按凭证缓存)。
 *
 * 设计:
 * - 凭证由后端签发,带 30 分钟 TTL
 * - 同一凭证(secretId 相同)复用同一个 COS 实例
 * - 凭证刷新(secretId 变化)时重建实例
 * - 不在这里做"到期前 5 分钟预刷新"(留给 uploadFileToCos 决策,本模块只做缓存)
 *
 * SDK 选型(条件编译,互不进入对方产物):
 * - H5:`cos-js-sdk-v5`(请求层基于 `XMLHttpRequest`)
 * - 微信小程序:`cos-wx-sdk-v5`(请求层基于 `wx.request`,不依赖 fetch/XHR)
 * - 其它平台(抖音小程序/App 等):无对应 COS 直传 SDK,`createSdk` 显式抛错
 */

/** 平台无关的上传参数 */
export interface CosUploadParams {
  /** 存储桶名称,格式 BucketName-APPID */
  Bucket: string
  /** 地域,如 ap-shanghai */
  Region: string
  /** 对象键(含路径) */
  Key: string
  /** H5 端:原生 File / Blob(cos-js-sdk-v5 的 `Body`) */
  Body?: File | Blob
  /** 小程序端:uni.chooseMedia / chooseAvatar 返回的 tempFilePath(cos-wx-sdk-v5 的 `FilePath`) */
  FilePath?: string
  /** 对象 MIME(保存为 Content-Type 元数据) */
  ContentType: string
  /** 永久缓存控制头(SDK 内部映射为 `Cache-Control` 请求头) */
  CacheControl: string
}

/** 平台无关的 COS 客户端最小接口(Promise 化;失败 reject Error) */
export interface CosClientLike {
  putObject(params: CosUploadParams): Promise<void>
  uploadFile(params: CosUploadParams): Promise<void>
}

/** SDK 回调签名 */
type CosSdkCallback = (err: unknown, data?: unknown) => void

/** 两个 SDK 共有的最小调用面(方法名一致,参数结构不同) */
interface CosSdkLike {
  putObject(params: Record<string, unknown>, callback?: CosSdkCallback): unknown
  uploadFile(params: Record<string, unknown>, callback?: CosSdkCallback): unknown
}

interface CachedClient {
  secretId: string
  client: CosClientLike
}

let _cached: CachedClient | null = null

/** 把 SDK 回调式调用包装为 Promise,并归一错误为 Error(保留 SDK 的 message) */
function callSdk(
  sdk: CosSdkLike,
  method: 'putObject' | 'uploadFile',
  params: Record<string, unknown>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    sdk[method](params, (err) => {
      if (err) {
        const e = err as { error?: { message?: string } | string, message?: string }
        const detail
          = (typeof e?.error === 'object' && e.error?.message)
            || (typeof e?.error === 'string' ? e.error : undefined)
            || e?.message
            || JSON.stringify(err)
        reject(new Error(detail))
        return
      }
      resolve()
    })
  })
}

/** 按平台创建 SDK 实例(编译期二选一,与文件头 import 配对) */
function createSdk(creds: CosCredentials): CosSdkLike {
  const options = {
    SecretId: creds.secretId,
    SecretKey: creds.secretKey,
    SecurityToken: creds.sessionToken,
  }
  // #ifdef H5
  return new CosJs(options) as unknown as CosSdkLike
  // #endif
  // #ifdef MP-WEIXIN
  return new CosWx(options) as unknown as CosSdkLike
  // #endif
  // 其它平台(抖音小程序/App 等)暂无 COS 直传 SDK,显式报错而非运行时 `wx is not defined`
  throw new Error('当前平台暂不支持 COS 直传上传')
}

/**
 * 返回与给定凭证绑定的 COS 实例。若凭证与缓存一致则复用,否则重建。
 */
export function getCosClient(creds: CosCredentials): CosClientLike {
  if (_cached && _cached.secretId === creds.secretId) {
    return _cached.client
  }
  const sdk = createSdk(creds)
  const client: CosClientLike = {
    putObject: params => callSdk(sdk, 'putObject', { ...params }),
    uploadFile: params => callSdk(sdk, 'uploadFile', { ...params }),
  }
  _cached = { secretId: creds.secretId, client }
  return client
}

/** 测试钩子:重置缓存 */
export function __resetCosClientForTest(): void {
  _cached = null
}
