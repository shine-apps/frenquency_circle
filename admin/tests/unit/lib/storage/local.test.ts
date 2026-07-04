import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { getUploadLimits, localDriver } from "@/lib/storage/local"

let tmpRoot: string

beforeEach(() => {
  tmpRoot = mkdtempSync(path.join(tmpdir(), "uploads-test-"))
  localDriver.__setRootDirForTest(tmpRoot)
})

afterEach(() => {
  if (existsSync(tmpRoot)) {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

describe("lib/storage/local", () => {
  describe("put", () => {
    it("writes the file to <root>/<yyyy>/<mm>/<uuid>.<ext> and returns metadata", async () => {
      const buf = Buffer.from("hello world")
      const result = await localDriver.put({
        originalName: "avatar.PNG",
        mimeType: "image/png",
        buffer: buf,
        purpose: "avatar",
      })

      // 路径: yyyy/mm/<uuid>.png (originalName 大小写不敏感)
      expect(result.key).toMatch(/^\d{4}\/\d{2}\/[a-f0-9-]{36}\.png$/)
      // URL 基础:测试环境用 env 或默认 localhost:3000
      expect(result.url).toMatch(new RegExp(`/uploads/${result.key}$`))
      expect(result.size).toBe(buf.length)
      expect(result.mimeType).toBe("image/png")
      expect(result.originalName).toBe("avatar.PNG")

      // 文件真实落盘
      const abs = path.join(tmpRoot, result.key)
      expect(existsSync(abs)).toBe(true)
      expect(readFileSync(abs).toString()).toBe("hello world")
      // size 字段等于磁盘文件大小
      expect(statSync(abs).size).toBe(buf.length)
    })

    it("falls back to .bin when extension is not in whitelist", async () => {
      const result = await localDriver.put({
        originalName: "malware.exe",
        mimeType: "application/octet-stream",
        buffer: Buffer.from("x"),
        purpose: "generic",
      })
      expect(result.key.endsWith(".bin")).toBe(true)
    })

    it("creates the year/month directory if missing", async () => {
      const result = await localDriver.put({
        originalName: "a.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from("y"),
        purpose: "generic",
      })
      const dir = path.dirname(path.join(tmpRoot, result.key))
      expect(existsSync(dir)).toBe(true)
    })
  })

  describe("remove", () => {
    it("deletes the file at the given key", async () => {
      const result = await localDriver.put({
        originalName: "a.png",
        mimeType: "image/png",
        buffer: Buffer.from("z"),
        purpose: "avatar",
      })
      const abs = path.join(tmpRoot, result.key)
      expect(existsSync(abs)).toBe(true)

      await localDriver.remove!(result.key)
      expect(existsSync(abs)).toBe(false)
    })

    it("refuses to delete files outside the root (path traversal)", async () => {
      // 准备一个真实的"目标"文件(在 tmpRoot 外),确保 remove 没把它删掉
      const outside = path.join(tmpRoot, "..", "outside.txt")
      writeFileSync(outside, "do-not-touch")
      try {
        await expect(
          localDriver.remove!("../../outside.txt")
        ).rejects.toThrow(/Invalid key/)
        expect(existsSync(outside)).toBe(true)
      } finally {
        if (existsSync(outside)) rmSync(outside)
      }
    })

    it("refuses absolute paths", async () => {
      await expect(
        localDriver.remove!("/etc/passwd")
      ).rejects.toThrow(/Invalid key/)
    })
  })

  describe("getUploadLimits", () => {
    /** 清空所有 UPLOAD_* env,确保走内置默认 */
    function clearEnv() {
      delete process.env.UPLOAD_MAX_BYTES
      delete process.env.UPLOAD_MAX_BYTES_AVATAR
      delete process.env.UPLOAD_MAX_BYTES_GENERIC
      delete process.env.UPLOAD_ALLOWED_MIME
      delete process.env.UPLOAD_ALLOWED_MIME_AVATAR
      delete process.env.UPLOAD_ALLOWED_MIME_GENERIC
    }

    it("returns generic defaults (100 MiB + 20 MIME) when env is missing", () => {
      clearEnv()
      const limits = getUploadLimits("generic")
      expect(limits.maxBytes).toBe(100 * 1024 * 1024)
      // 图片
      expect(limits.allowedMime.has("image/png")).toBe(true)
      expect(limits.allowedMime.has("image/jpeg")).toBe(true)
      // 文档
      expect(limits.allowedMime.has("application/pdf")).toBe(true)
      // 视频
      expect(limits.allowedMime.has("video/mp4")).toBe(true)
      // 音频
      expect(limits.allowedMime.has("audio/mpeg")).toBe(true)
    })

    it("returns avatar defaults (5 MiB + image only) when env is missing", () => {
      clearEnv()
      const limits = getUploadLimits("avatar")
      expect(limits.maxBytes).toBe(5 * 1024 * 1024)
      expect(limits.allowedMime.has("image/png")).toBe(true)
      // avatar 严格:不应包含 PDF/视频
      expect(limits.allowedMime.has("application/pdf")).toBe(false)
      expect(limits.allowedMime.has("video/mp4")).toBe(false)
    })

    it("generic env overrides generic defaults", () => {
      clearEnv()
      process.env.UPLOAD_MAX_BYTES = "100"
      process.env.UPLOAD_ALLOWED_MIME = "image/svg+xml, image/png"
      try {
        const limits = getUploadLimits("generic")
        expect(limits.maxBytes).toBe(100)
        expect(limits.allowedMime.has("image/svg+xml")).toBe(true)
        expect(limits.allowedMime.has("image/png")).toBe(true)
        expect(limits.allowedMime.has("image/jpeg")).toBe(false)
      } finally {
        clearEnv()
      }
    })

    it("avatar env overrides avatar defaults", () => {
      clearEnv()
      process.env.UPLOAD_MAX_BYTES_AVATAR = "1024"
      process.env.UPLOAD_ALLOWED_MIME_AVATAR = "image/png"
      try {
        const limits = getUploadLimits("avatar")
        expect(limits.maxBytes).toBe(1024)
        expect(limits.allowedMime.has("image/png")).toBe(true)
        expect(limits.allowedMime.has("image/jpeg")).toBe(false)
      } finally {
        clearEnv()
      }
    })

    it("avatar-specific env takes priority over generic env", () => {
      clearEnv()
      process.env.UPLOAD_MAX_BYTES = "9999"
      process.env.UPLOAD_MAX_BYTES_AVATAR = "1111"
      try {
        // generic 用通用 env
        expect(getUploadLimits("generic").maxBytes).toBe(9999)
        // avatar 优先用 purpose 专属 env
        expect(getUploadLimits("avatar").maxBytes).toBe(1111)
      } finally {
        clearEnv()
      }
    })

    it("falls back to default when env is not a positive number", () => {
      clearEnv()
      process.env.UPLOAD_MAX_BYTES = "abc"
      try {
        const limits = getUploadLimits("generic")
        expect(limits.maxBytes).toBe(100 * 1024 * 1024)
      } finally {
        clearEnv()
      }
    })
  })
})
