/**
 * 存储驱动抽象接口(后续可加 AliyunOssDriver 等)。
 *
 * 本地实现见 `./local.ts`。
 *
 * 关键设计:
 * - 驱动接收 `Buffer`(不与具体传输层耦合);Next.js Route Handler 通过
 *   `request.formData()` 拿到 `File`,再 `Buffer.from(await file.arrayBuffer())` 转换。
 * - 驱动不感知鉴权 / CORS / 限流,这些由调用方(路由处理器)负责。
 */
export interface UploadInput {
  /** 原始文件名(用于解析扩展名/审计) */
  originalName: string
  /** MIME,如 "image/png" */
  mimeType: string
  /** 文件字节 */
  buffer: Buffer
  /** 业务场景:avatar / generic */
  purpose: "avatar" | "generic"
}

export interface UploadResult {
  /** 公开访问 URL(完整 https) */
  url: string
  /** 相对 key(用于后续删除/迁移),不含前导 "/" */
  key: string
  /** 落盘字节数 */
  size: number
  mimeType: string
  originalName: string
}

export interface StorageDriver {
  /** 写入并返回公开访问信息 */
  put(input: UploadInput): Promise<UploadResult>
  /** 删除(可选,key 必须由本驱动的 put 产生) */
  remove?(key: string): Promise<void>
}
