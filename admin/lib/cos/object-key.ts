/**
 * 构造 COS 对象 key 与公开 URL(纯函数,可单测,与 SDK 解耦)。
 *
 * key 形如:`<keyPrefix>/<userId>/<yyyy>/<mm>/<uuid>.<ext>`
 * 与后端 STS scope `<keyPrefix>/<userId>/*` 严格对齐,否则上传会被 COS 拒绝。
 */

/** MIME → 扩展名(权威,避免扩展名/MIME 不一致) */
const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "text/markdown": ".md",
  "application/zip": ".zip",
  "application/x-zip-compressed": ".zip",
  "video/mp4": ".mp4",
  "video/webm": ".webm",
  "video/quicktime": ".mov",
  "audio/mpeg": ".mp3",
  "audio/mp4": ".m4a",
  "audio/wav": ".wav",
  "audio/ogg": ".ogg",
  "audio/webm": ".webm",
  "audio/flac": ".flac",
  "audio/aac": ".aac",
}

/** 允许的扩展名白名单(兜底,从 originalName 推断) */
const ALLOWED_EXTS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".pdf",
  ".txt",
  ".csv",
  ".md",
  ".zip",
  ".mp4",
  ".webm",
  ".mov",
  ".mp3",
  ".m4a",
  ".wav",
  ".ogg",
  ".flac",
  ".aac",
]

/** 推断扩展名:优先 MIME,兜底 filename,再不行 .bin */
export function pickExt(mimeType: string, originalName: string): string {
  const fromMime = MIME_TO_EXT[mimeType]
  if (fromMime) return fromMime
  const lower = originalName.toLowerCase()
  for (const ext of ALLOWED_EXTS) {
    if (lower.endsWith(ext)) return ext
  }
  return ".bin"
}

export interface BuildKeyInput {
  keyPrefix: string
  userId: string
  mimeType: string
  originalName: string
}

/**
 * 构造对象 key:`<keyPrefix>/<userId>/<yyyy>/<mm>/<uuid>.<ext>`
 * - yyyy/mm 用 UTC(与后端 LocalDriver 对齐);
 * - keyPrefix 为空时不带前缀段;
 * - uuid 用 `crypto.randomUUID()`(浏览器 / Node 20+ 均有),保证同 key 永不复用。
 */
export function buildCosObjectKey(input: BuildKeyInput): string {
  const now = new Date()
  const yyyy = String(now.getUTCFullYear())
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0")
  const ext = pickExt(input.mimeType, input.originalName)
  const fileName = `${crypto.randomUUID()}${ext}`
  const segs = [input.keyPrefix, input.userId, yyyy, mm, fileName].filter(Boolean)
  return segs.join("/")
}

/**
 * 构造公开访问 URL:`<publicBaseUrl>/<key>`(保证单斜杠)。
 */
export function buildCosPublicUrl(publicBaseUrl: string, key: string): string {
  const base = publicBaseUrl.replace(/\/+$/, "")
  return `${base}/${key.replace(/^\/+/, "")}`
}
