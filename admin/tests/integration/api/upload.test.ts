import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * POST /api/upload 集成测试。
 *
 * mock 层级:
 * - @/lib/auth/session-token:控制 readUserFromToken 返回值
 * - @/lib/storage/local:fakeDriver(内存实现)替代真实 fs 写盘
 * - @/lib/logger:避免输出噪音
 *
 * happy-dom 提供全局 `FormData` / `File` / `Blob`,可直接构造 multipart body。
 */

const { readUserFromTokenMock, fakeDriver, getUploadLimitsMock } = vi.hoisted(
  () => {
    const readUserFromTokenMock = vi.fn()

    // 内存 fakeDriver:不写盘,只把 put/remove 调用记下来
    const fakeDriver = {
      put: vi.fn(async (input: {
        originalName: string
        mimeType: string
        buffer: Buffer
        purpose: "avatar" | "generic"
      }) => ({
        url: `https://api.example.com/uploads/2026/07/${input.purpose}.${input.mimeType.split("/")[1] ?? "bin"}`,
        key: `2026/07/${input.purpose}.${input.mimeType.split("/")[1] ?? "bin"}`,
        size: input.buffer.length,
        mimeType: input.mimeType,
        originalName: input.originalName,
      })),
      remove: vi.fn(async () => {}),
    }

    // 默认限制(按 purpose 分级;测试用例可覆盖)
    const getUploadLimitsMock = vi.fn((purpose: "avatar" | "generic" = "generic") => ({
      maxBytes:
        purpose === "avatar"
          ? 5 * 1024 * 1024 // 头像默认 5 MiB
          : 100 * 1024 * 1024, // 通用默认 100 MiB
      allowedMime:
        purpose === "avatar"
          ? new Set([
              "image/jpeg",
              "image/png",
              "image/webp",
              "image/gif",
            ])
          : new Set([
              "image/jpeg",
              "image/png",
              "image/webp",
              "image/gif",
              "application/pdf",
              "text/plain",
              "text/csv",
              "text/markdown",
              "application/zip",
              "application/x-zip-compressed",
              "video/mp4",
              "video/webm",
              "video/quicktime",
              "audio/mpeg",
              "audio/mp4",
              "audio/wav",
              "audio/ogg",
              "audio/webm",
              "audio/flac",
              "audio/aac",
            ]),
    }))

    return { readUserFromTokenMock, fakeDriver, getUploadLimitsMock }
  }
)

vi.mock("@/lib/auth/session-token", () => ({
  readUserFromToken: readUserFromTokenMock,
}))

vi.mock("@/lib/storage/local", () => ({
  localDriver: fakeDriver,
  getUploadLimits: getUploadLimitsMock,
}))

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  LOG_PREFIX: {
    AUTH: "AUTH",
    SMS: "SMS",
    ACCOUNT: "ACCOUNT",
    WECHAT: "WECHAT",
    UPLOAD: "UPLOAD",
  },
}))

import { POST } from "@/app/api/upload/route"
import type { IResponse } from "@/types/api"
import type { UploadResult } from "@/lib/storage/types"

const FAKE_USER = {
  id: "u-1",
  email: "u@example.com",
  name: "U",
  role: "USER",
}

/** 构造带 multipart/form-data 的 Request */
function makeMultipart(
  fields: Record<string, { content: string | ArrayBuffer; filename?: string; type?: string }>
) {
  const fd = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    if (name === "file" || value.filename) {
      // 文件字段:用 File 包装
      const blobParts =
        typeof value.content === "string"
          ? [value.content]
          : [new Uint8Array(value.content)]
      const file = new File(blobParts, value.filename ?? "upload.bin", {
        type: value.type ?? "application/octet-stream",
      })
      fd.append(name, file)
    } else {
      fd.append(name, String(value.content))
    }
  }
  return new Request("http://localhost/api/upload", {
    method: "POST",
    body: fd,
  })
}

beforeEach(() => {
  readUserFromTokenMock.mockReset()
  fakeDriver.put.mockClear()
  fakeDriver.remove.mockClear()
  getUploadLimitsMock.mockReset()
  // 默认 limit 恢复到全局(按 purpose 分级)
  getUploadLimitsMock.mockImplementation(
    (purpose: "avatar" | "generic" = "generic") => ({
      maxBytes:
        purpose === "avatar" ? 5 * 1024 * 1024 : 100 * 1024 * 1024,
      allowedMime:
        purpose === "avatar"
          ? new Set([
              "image/jpeg",
              "image/png",
              "image/webp",
              "image/gif",
            ])
          : new Set([
              "image/jpeg",
              "image/png",
              "image/webp",
              "image/gif",
              "application/pdf",
              "text/plain",
              "text/csv",
              "text/markdown",
              "application/zip",
              "application/x-zip-compressed",
              "video/mp4",
              "video/webm",
              "video/quicktime",
              "audio/mpeg",
              "audio/mp4",
              "audio/wav",
              "audio/ogg",
              "audio/webm",
              "audio/flac",
              "audio/aac",
            ]),
    })
  )
  readUserFromTokenMock.mockResolvedValue(FAKE_USER)
})

describe("POST /api/upload", () => {
  it("returns 401 when no auth user", async () => {
    readUserFromTokenMock.mockResolvedValue(null)
    const req = makeMultipart({
      file: { content: "x", filename: "a.png", type: "image/png" },
    })
    const res = await POST(req)
    expect(res.status).toBe(401)
    expect(fakeDriver.put).not.toHaveBeenCalled()
  })

  it("returns 400 when file is missing", async () => {
    const req = new Request("http://localhost/api/upload", {
      method: "POST",
      body: new FormData(), // 空表单
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("No file uploaded")
  })

  it("returns 400 when purpose is invalid", async () => {
    const req = makeMultipart({
      file: { content: "x", filename: "a.png", type: "image/png" },
      purpose: { content: "bogus" },
    })
    const res = await POST(req)
    expect(res.status).toBe(400)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("Invalid purpose")
  })

  it("returns 413 when file size exceeds limit", async () => {
    // 限 1 字节
    getUploadLimitsMock.mockReturnValue({
      maxBytes: 1,
      allowedMime: new Set(["image/png"]),
    })
    const req = makeMultipart({
      file: { content: "abc", filename: "a.png", type: "image/png" },
    })
    const res = await POST(req)
    expect(res.status).toBe(413)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("File too large")
    expect(fakeDriver.put).not.toHaveBeenCalled()
  })

  it("returns 415 when file MIME is not allowed", async () => {
    // application/x-msdownload 是 Windows 可执行文件,绝不应在白名单
    const req = makeMultipart({
      file: { content: "hello", filename: "a.exe", type: "application/x-msdownload" },
    })
    const res = await POST(req)
    expect(res.status).toBe(415)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("Unsupported file type")
    expect(fakeDriver.put).not.toHaveBeenCalled()
  })

  it("returns 200 with full UploadResult on valid png upload", async () => {
    const req = makeMultipart({
      file: { content: "fake-png-bytes", filename: "avatar.png", type: "image/png" },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<UploadResult>
    expect(body.code).toBe(200)
    expect(body.data.mimeType).toBe("image/png")
    expect(body.data.size).toBe(Buffer.byteLength("fake-png-bytes"))
    expect(body.data.originalName).toBe("avatar.png")
    // 透传了 purpose
    expect(fakeDriver.put).toHaveBeenCalledTimes(1)
    const putArg = fakeDriver.put.mock.calls[0]?.[0] as {
      purpose: string
      mimeType: string
    }
    expect(putArg.mimeType).toBe("image/png")
    expect(putArg.purpose).toBe("generic")
  })

  it("uses key with yyyy/mm prefix and forwards purpose=avatar", async () => {
    const req = makeMultipart({
      file: { content: "jpg", filename: "a.jpg", type: "image/jpeg" },
      purpose: { content: "avatar" },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<UploadResult>
    expect(body.data.key).toMatch(/^2026\/\d{2}\//)
    const putArg = fakeDriver.put.mock.calls[0]?.[0] as { purpose: string }
    expect(putArg.purpose).toBe("avatar")
  })

  it("avatar purpose rejects non-image MIME (415)", async () => {
    // application/pdf 在 generic 允许,但在 avatar 严格禁止
    const req = makeMultipart({
      file: { content: "%PDF-1.4", filename: "doc.pdf", type: "application/pdf" },
      purpose: { content: "avatar" },
    })
    const res = await POST(req)
    expect(res.status).toBe(415)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("Unsupported file type")
    expect(fakeDriver.put).not.toHaveBeenCalled()
  })

  it("avatar purpose allows only image MIME", async () => {
    const req = makeMultipart({
      file: { content: "png", filename: "a.png", type: "image/png" },
      purpose: { content: "avatar" },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
  })

  it("avatar purpose enforces 5 MiB limit (413)", async () => {
    // avatar 默认 5 MiB,造一个 6 MiB 假文件
    const big = "x".repeat(6 * 1024 * 1024)
    const req = makeMultipart({
      file: { content: big, filename: "huge.png", type: "image/png" },
      purpose: { content: "avatar" },
    })
    const res = await POST(req)
    expect(res.status).toBe(413)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("File too large")
    expect(fakeDriver.put).not.toHaveBeenCalled()
  })

  it("generic purpose allows video/mp4 upload (200)", async () => {
    const req = makeMultipart({
      file: { content: "fake-mp4", filename: "clip.mp4", type: "video/mp4" },
    })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = (await res.json()) as IResponse<UploadResult>
    expect(body.data.mimeType).toBe("video/mp4")
  })

  it("calls getUploadLimits with parsed purpose", async () => {
    const req = makeMultipart({
      file: { content: "x", filename: "a.png", type: "image/png" },
      purpose: { content: "avatar" },
    })
    await POST(req)
    // Content-Length 预检用 generic,严格校验用 avatar
    const calls = getUploadLimitsMock.mock.calls.map((c) => c[0])
    expect(calls).toContain("generic")
    expect(calls).toContain("avatar")
  })

  it("returns 500 when driver.put throws", async () => {
    fakeDriver.put.mockRejectedValueOnce(new Error("disk full"))
    const req = makeMultipart({
      file: { content: "x", filename: "a.png", type: "image/png" },
    })
    const res = await POST(req)
    expect(res.status).toBe(500)
    const body = (await res.json()) as IResponse<null>
    expect(body.message).toBe("Upload failed")
  })
})
