import { z } from "zod"

import { corsOptions, fail, ok, withCors } from "@/lib/api"
import { readUserFromToken } from "@/lib/auth/session-token"
import { logger, LOG_PREFIX } from "@/lib/logger"
import { getUploadLimits, localDriver } from "@/lib/storage/local"

/** 业务场景校验 */
const purposeSchema = z.enum(["avatar", "generic"]).default("generic")

/** 安全地把 unknown 转为字符串(用于日志) */
function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}

/**
 * 通用文件上传接口。
 *
 * - 鉴权:任意登录用户(`readUserFromToken`,与 /api/auth/me 一致)
 * - 接收 multipart/form-data:`file` 字段为必填,`purpose` 可选
 * - 大小 / MIME 限制通过 env(`UPLOAD_MAX_BYTES` / `UPLOAD_ALLOWED_MIME`)配置
 * - 文件落到 `public/uploads/<yyyy>/<mm>/<uuid>.<ext>`,Next.js 自动以 `/uploads/...` 暴露
 */
export async function OPTIONS(req: Request) {
  return corsOptions(req)
}

export async function POST(req: Request) {
  const authUser = await readUserFromToken(req)
  if (!authUser) {
    return withCors(fail(401, "未登录或登录已过期"), req)
  }

  // 1. 预检 Content-Length:用 generic 上限做"安全网",避免任何场景的巨型 body 进内存
  //    严格的目的相关限流在解析 multipart 后按 purpose 重新校验
  const genericLimits = getUploadLimits("generic")
  const contentLength = Number(req.headers.get("content-length") ?? "0")
  if (Number.isFinite(contentLength) && contentLength > genericLimits.maxBytes) {
    return withCors(
      fail(413, "File too large", { maxBytes: genericLimits.maxBytes }),
      req
    )
  }

  // 2. 解析 multipart(Next.js 16 App Router 原生支持)
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return withCors(fail(400, "Invalid multipart body"), req)
  }

  // 3. 校验 purpose(可选,默认 generic)→ 取目的相关限流
  const purposeParsed = purposeSchema.safeParse(form.get("purpose") ?? "generic")
  if (!purposeParsed.success) {
    return withCors(
      fail(400, "Invalid purpose", purposeParsed.error.flatten()),
      req
    )
  }
  const purpose = purposeParsed.data
  const limits = getUploadLimits(purpose)

  // 4. 校验 file 字段
  const file = form.get("file")
  if (!file) {
    return withCors(fail(400, "No file uploaded"), req)
  }
  if (!(file instanceof File)) {
    return withCors(fail(400, "Invalid file"), req)
  }

  if (file.size === 0) {
    return withCors(fail(400, "Empty file"), req)
  }
  if (file.size > limits.maxBytes) {
    return withCors(
      fail(413, "File too large", { maxBytes: limits.maxBytes }),
      req
    )
  }
  if (!limits.allowedMime.has(file.type)) {
    return withCors(
      fail(415, "Unsupported file type", { mimeType: file.type }),
      req
    )
  }

  // 5. 落盘
  let buffer: Buffer
  try {
    buffer = Buffer.from(await file.arrayBuffer())
  } catch (e) {
    logger.error(LOG_PREFIX.UPLOAD, "read file failed", {
      err: errMessage(e),
      userId: authUser.id,
    })
    return withCors(fail(500, "Failed to read file"), req)
  }

  try {
    const result = await localDriver.put({
      originalName: file.name,
      mimeType: file.type,
      buffer,
      purpose,
    })
    logger.info(LOG_PREFIX.UPLOAD, "file uploaded", {
      userId: authUser.id,
      key: result.key,
      size: result.size,
      purpose,
    })
    return withCors(ok(result), req)
  } catch (e) {
    logger.error(LOG_PREFIX.UPLOAD, "put failed", {
      err: errMessage(e),
      userId: authUser.id,
    })
    return withCors(fail(500, "Upload failed"), req)
  }
}
