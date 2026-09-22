import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * COS 直传客户端单测(admin Web)。
 *
 * - 真实运行 `credentials.ts` / `cos-client.ts` / `upload.ts`;
 * - mock 掉边界:`cos-js-sdk-v5`(构造 + putObject)与 `object-key`(固定 key)
 *   以及全局 `fetch`(STS 凭证端点)。
 */

const { mockFetch, MockCos } = vi.hoisted(() => {
  const mockFetch = vi.fn()

  /** cos-js-sdk-v5 的替身:记录构造参数与 putObject 入参,可注入错误 / 进度 */
  class MockCos {
    static instances: MockCos[] = []
    static nextError: unknown = null
    static nextProgress: number[] = []
    static putObjectCalls: Record<string, unknown>[] = []

    options: Record<string, unknown>

    constructor(options: Record<string, unknown>) {
      this.options = options
      MockCos.instances.push(this)
    }

    putObject(params: Record<string, unknown>, cb: (err: unknown) => void) {
      MockCos.putObjectCalls.push(params)
      const onProgress = params.onProgress as ((info: unknown) => void) | undefined
      if (onProgress && MockCos.nextProgress.length > 0) {
        onProgress({ percent: MockCos.nextProgress[0] })
      }
      cb(MockCos.nextError)
    }
  }

  return { mockFetch, MockCos }
})

vi.mock("cos-js-sdk-v5", () => ({ default: MockCos }))

vi.mock("@/lib/cos/object-key", () => ({
  buildCosObjectKey: (input: { keyPrefix: string; userId: string; mimeType: string }) =>
    `${input.keyPrefix}/${input.userId}/2026/09/fixed-key.bin`,
  buildCosPublicUrl: (base: string, key: string) => `${base}/${key}`,
}))

import {
  __resetCosCredentialsForTest,
  getValidCredentials,
  needsCredentialsRefresh,
} from "@/lib/cos/credentials"
import { __resetCosClientForTest } from "@/lib/cos/cos-client"
import {
  COS_CACHE_CONTROL_PERMANENT,
  uploadFileToCos,
  type CosUploadResult,
} from "@/lib/cos/upload"

/** 构造 STS 凭证响应 */
function credentialsPayload(overrides: Partial<{ expiredTime: number; userId: string }> = {}) {
  const now = Math.floor(Date.now() / 1000)
  return {
    userId: overrides.userId ?? "u-1",
    secretId: "ak-secret-id",
    secretKey: "ak-secret-key",
    sessionToken: "ak-token",
    startTime: now - 10,
    expiredTime: overrides.expiredTime ?? now + 1800,
    bucket: "bucket-1250000000",
    region: "ap-shanghai",
    keyPrefix: "uploads",
    publicBaseUrl: "https://bucket.cos.ap-shanghai.myqcloud.com",
  }
}

function makeFile(name = "lesson.mp4", size = 1024): File {
  return new File(["x".repeat(size)], name, { type: "video/mp4" })
}

function okResponse(body: unknown) {
  return new Response(JSON.stringify({ code: 200, data: body, message: "OK" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}

function errResponse(status: number, message: string) {
  return new Response(JSON.stringify({ code: status, data: null, message }), { status })
}

beforeEach(() => {
  vi.clearAllMocks()
  MockCos.instances = []
  MockCos.putObjectCalls = []
  MockCos.nextError = null
  MockCos.nextProgress = []
  __resetCosCredentialsForTest()
  __resetCosClientForTest()
  mockFetch.mockResolvedValue(okResponse(credentialsPayload()))
  vi.stubGlobal("fetch", mockFetch)
})

describe("凭证获取与缓存", () => {
  it("needsCredentialsRefresh treats null / expiring / valid correctly", () => {
    const now = Math.floor(Date.now() / 1000)
    expect(needsCredentialsRefresh(null, now)).toBe(true)
    expect(needsCredentialsRefresh(credentialsPayload({ expiredTime: now + 100 }), now)).toBe(true)
    expect(needsCredentialsRefresh(credentialsPayload({ expiredTime: now + 1800 }), now)).toBe(false)
  })

  it("caches credentials across uploads (single fetch)", async () => {
    await uploadFileToCos({ file: makeFile() })
    await uploadFileToCos({ file: makeFile() })
    expect(mockFetch).toHaveBeenCalledTimes(1)
    expect(mockFetch.mock.calls[0][0]).toBe("/api/upload/cos-credentials")
  })

  it("re-fetches when credentials are about to expire", async () => {
    mockFetch.mockResolvedValueOnce(okResponse(credentialsPayload({ expiredTime: Math.floor(Date.now() / 1000) + 100 })))
    await uploadFileToCos({ file: makeFile() })
    await uploadFileToCos({ file: makeFile() })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it("throws a readable error when the credentials endpoint fails", async () => {
    mockFetch.mockResolvedValue(errResponse(401, "未登录或登录已过期"))
    await expect(getValidCredentials()).rejects.toThrow("未登录或登录已过期")
  })
})

describe("uploadFileToCos", () => {
  it("passes scoped params to the SDK and returns the public url", async () => {
    const file = makeFile("lesson.mp4", 2048)
    const result: CosUploadResult = await uploadFileToCos({ file })

    // SDK 构造参数来自 STS 凭证
    expect(MockCos.instances).toHaveLength(1)
    expect(MockCos.instances[0].options).toMatchObject({
      SecretId: "ak-secret-id",
      SecretKey: "ak-secret-key",
      SecurityToken: "ak-token",
    })

    // putObject 入参
    expect(MockCos.putObjectCalls).toHaveLength(1)
    expect(MockCos.putObjectCalls[0]).toMatchObject({
      Bucket: "bucket-1250000000",
      Region: "ap-shanghai",
      Key: "uploads/u-1/2026/09/fixed-key.bin",
      ContentType: "video/mp4",
      CacheControl: COS_CACHE_CONTROL_PERMANENT,
    })
    expect((MockCos.putObjectCalls[0].Body as File).name).toBe("lesson.mp4")

    // 结果
    expect(result.url).toBe("https://bucket.cos.ap-shanghai.myqcloud.com/uploads/u-1/2026/09/fixed-key.bin")
    expect(result.key).toBe("uploads/u-1/2026/09/fixed-key.bin")
    expect(result.size).toBe(2048)
    expect(result.mimeType).toBe("video/mp4")
    expect(result.originalName).toBe("lesson.mp4")
  })

  it("reuses the SDK instance while credentials are unchanged", async () => {
    await uploadFileToCos({ file: makeFile() })
    await uploadFileToCos({ file: makeFile() })
    expect(MockCos.instances).toHaveLength(1)
  })

  it("forwards sdk progress percent (rounded)", async () => {
    MockCos.nextProgress = [89.4]
    const seen: number[] = []
    await uploadFileToCos({ file: makeFile(), onProgress: (p) => seen.push(p) })
    expect(seen).toEqual([89])
  })

  it("normalizes sdk errors into readable messages", async () => {
    MockCos.nextError = { error: { message: "AccessDenied" } }
    await expect(uploadFileToCos({ file: makeFile() })).rejects.toThrow("AccessDenied")
  })

  it("rejects a missing file", async () => {
    await expect(
      uploadFileToCos({ file: undefined as unknown as File })
    ).rejects.toThrow("请选择要上传的文件")
  })
})
