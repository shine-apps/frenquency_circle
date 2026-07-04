import { mkdir, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { randomUUID } from "node:crypto"

import type { StorageDriver, UploadInput, UploadResult } from "./types"

/** 默认上传大小上限:通用 100 MiB(视频/音频友好) */
const DEFAULT_MAX_BYTES = 100 * 1024 * 1024
/** 头像场景默认大小上限 5 MiB(头像通常 < 2 MB) */
const AVATAR_DEFAULT_MAX_BYTES = 5 * 1024 * 1024
/** 头像场景默认 MIME:仅图片(收紧,头像不该是 PDF/视频) */
const AVATAR_ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const
/** 通用场景默认允许的 MIME(图片 + 文档 + 压缩包 + 视频 + 音频) */
const DEFAULT_ALLOWED_MIME = [
  // 图片
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  // 文档
  "application/pdf",
  "text/plain",
  "text/csv",
  "text/markdown",
  // 压缩包
  "application/zip",
  "application/x-zip-compressed",
  // 视频
  "video/mp4",
  "video/webm",
  "video/quicktime",
  // 音频
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/ogg",
  "audio/webm",
  "audio/flac",
  "audio/aac",
] as const
/** 允许的扩展名(与 MIME 对应,落盘时用于推断后缀) */
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
] as const
/** MIME → 扩展名 映射(权威,用于避免扩展名/MIME 不一致导致静态服务错配 Content-Type) */
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

/** 暴露给路由处理器的限制参数(便于返回 413/415 详情) */
export interface UploadLimits {
  maxBytes: number
  allowedMime: ReadonlySet<string>
}

/** 业务场景(与路由层 purposeSchema 对齐) */
export type UploadPurpose = "avatar" | "generic"

/**
 * 解析场景默认大小(env 缺失/非法时回退)。
 * 优先级:purpose 专属 env > 通用 UPLOAD_MAX_BYTES > 内置默认值
 */
function resolveMaxBytes(purpose: UploadPurpose): number {
  const specific = process.env[`UPLOAD_MAX_BYTES_${purpose.toUpperCase()}`]
  if (specific) {
    const n = Number(specific)
    if (Number.isFinite(n) && n > 0) return n
  }
  const generic = process.env.UPLOAD_MAX_BYTES
  if (generic) {
    const n = Number(generic)
    if (Number.isFinite(n) && n > 0) return n
  }
  return purpose === "avatar" ? AVATAR_DEFAULT_MAX_BYTES : DEFAULT_MAX_BYTES
}

/**
 * 解析场景默认 MIME 白名单(env 缺失/非法时回退)。
 * 优先级:purpose 专属 env > 通用 UPLOAD_ALLOWED_MIME > 内置默认值
 */
function resolveAllowedMime(purpose: UploadPurpose): ReadonlySet<string> {
  const specific = process.env[`UPLOAD_ALLOWED_MIME_${purpose.toUpperCase()}`]
  if (specific) {
    return new Set(
      specific.split(",").map((s) => s.trim()).filter(Boolean)
    )
  }
  const generic = process.env.UPLOAD_ALLOWED_MIME
  if (generic) {
    return new Set(generic.split(",").map((s) => s.trim()).filter(Boolean))
  }
  const fallback =
    purpose === "avatar"
      ? (AVATAR_ALLOWED_MIME as readonly string[])
      : (DEFAULT_ALLOWED_MIME as readonly string[])
  return new Set(fallback)
}

/**
 * 解析上传限制(按 purpose 分级)。
 *
 * - `purpose=avatar`:默认 5 MiB + 仅图片(env `UPLOAD_MAX_BYTES_AVATAR` / `UPLOAD_ALLOWED_MIME_AVATAR` 可覆盖)
 * - `purpose=generic`:默认 100 MiB + 20 种 MIME(env `UPLOAD_MAX_BYTES` / `UPLOAD_ALLOWED_MIME` 可覆盖)
 *
 * env 优先级:`UPLOAD_MAX_BYTES_<PURPOSE>` > `UPLOAD_MAX_BYTES` > 内置默认
 */
export function getUploadLimits(purpose: UploadPurpose = "generic"): UploadLimits {
  return {
    maxBytes: resolveMaxBytes(purpose),
    allowedMime: resolveAllowedMime(purpose),
  }
}

/** 公开 URL 基础(从 env 读,无则用 localhost:PORT) */
function getPublicBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/+$/, "")
  const port = process.env.PORT ?? "3000"
  return `http://localhost:${port}`
}

/**
 * 推断落盘扩展名:优先用 MIME(权威,保证静态服务回正确的 Content-Type),
 * 兜底用 filename;都不在白名单则 .bin(几乎不会触发,因为 MIME 已在路由层校验)。
 */
function pickExt(mimeType: string, originalName: string): string {
  const fromMime = MIME_TO_EXT[mimeType]
  if (fromMime) return fromMime
  const lower = originalName.toLowerCase()
  for (const ext of ALLOWED_EXTS) {
    if (lower.endsWith(ext)) return ext
  }
  return ".bin"
}

/**
 * 本地文件系统驱动:把文件写到 `<rootDir>/<yyyy>/<mm>/<uuid><ext>`。
 * - 落盘根目录默认 `<cwd>/public/uploads`,Next.js 自动以 `/uploads/...` 暴露
 * - 测试可通过 `setRootDirForTest` 覆盖到临时目录
 */
class LocalDriver implements StorageDriver {
  private rootDir: string

  constructor() {
    this.rootDir = path.join(process.cwd(), "public", "uploads")
  }

  /** 测试钩子:切换落盘根目录 */
  __setRootDirForTest(dir: string) {
    this.rootDir = dir
  }

  getRootDir(): string {
    return this.rootDir
  }

  async put(input: UploadInput): Promise<UploadResult> {
    const now = new Date()
    const yyyy = String(now.getUTCFullYear())
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0")
    const ext = pickExt(input.mimeType, input.originalName)
    const fileName = `${randomUUID()}${ext}`
    const key = `${yyyy}/${mm}/${fileName}`
    const absDir = path.join(this.rootDir, yyyy, mm)
    const absPath = path.join(absDir, fileName)

    await mkdir(absDir, { recursive: true })
    await writeFile(absPath, input.buffer)

    return {
      url: `${getPublicBaseUrl()}/uploads/${key}`,
      key,
      size: input.buffer.length,
      mimeType: input.mimeType,
      originalName: input.originalName,
    }
  }

  async remove(key: string): Promise<void> {
    // 防越权:key 不能逃出 rootDir
    const target = path.resolve(this.rootDir, key)
    const rel = path.relative(this.rootDir, target)
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new Error(`Invalid key: ${key}`)
    }
    await unlink(target)
  }
}

/** 模块级单例:全应用共用一个驱动实例 */
export const localDriver = new LocalDriver()
