/**
 * 构造 COS 对象 key 与公开 URL(纯函数,可单测,与 SDK 解耦)。
 *
 * key 形如:`<keyPrefix>/<userId>/<yyyy>/<mm>/<uuid>.<ext>`
 * 与后端 STS scope `<keyPrefix>/<userId>/*` 严格对齐,否则上传会被 COS 拒绝。
 */

/** MIME → 扩展名(权威,避免扩展名/MIME 不一致) */
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'text/markdown': '.md',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.webm',
  'audio/flac': '.flac',
  'audio/aac': '.aac',
}

/** 允许的扩展名白名单(兜底,从 originalName 推断) */
const ALLOWED_EXTS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.pdf',
  '.txt',
  '.csv',
  '.md',
  '.zip',
  '.mp4',
  '.webm',
  '.mov',
  '.mp3',
  '.m4a',
  '.wav',
  '.ogg',
  '.flac',
  '.aac',
]

/** 推断扩展名:优先 MIME,兜底 filename,再不行 .bin */
export function pickExt(mimeType: string, originalName: string): string {
  const fromMime = MIME_TO_EXT[mimeType]
  if (fromMime)
    return fromMime
  const lower = originalName.toLowerCase()
  for (const ext of ALLOWED_EXTS) {
    if (lower.endsWith(ext))
      return ext
  }
  return '.bin'
}

/** 生成 RFC4122 v4 UUID(浏览器/小程序通用,基于 crypto.getRandomValues) */
function uuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // 兜底:手动拼(微信小程序老版本无 crypto.randomUUID)
  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes)
  }
  else {
    for (let i = 0; i < 16; i++)
      bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0F) | 0x40
  bytes[8] = (bytes[8] & 0x3F) | 0x80
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10, 16).join('')}`
}

export interface BuildKeyInput {
  keyPrefix: string
  userId: string
  mimeType: string
  originalName: string
}

/**
 * 构造对象 key:`<keyPrefix>/<userId>/<yyyy>/<mm>/<uuid>.<ext>`
 * - yyyy/mm 用 UTC(与后端 LocalDriver 对齐)
 * - keyPrefix 为空时不带前缀段
 */
export function buildCosObjectKey(input: BuildKeyInput): string {
  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0')
  const ext = pickExt(input.mimeType, input.originalName)
  const fileName = `${uuid()}${ext}`
  const segs = [input.keyPrefix, input.userId, yyyy, mm, fileName].filter(Boolean)
  return segs.join('/')
}

/**
 * 构造公开访问 URL:`<publicBaseUrl>/<key>`(保证单斜杠)。
 */
export function buildCosPublicUrl(publicBaseUrl: string, key: string): string {
  const base = publicBaseUrl.replace(/\/+$/, '')
  return `${base}/${key.replace(/^\/+/, '')}`
}
