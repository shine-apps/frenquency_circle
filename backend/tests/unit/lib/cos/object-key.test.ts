import { describe, expect, it } from "vitest"

import {
  buildCosObjectKey,
  buildCosPublicUrl,
  pickExt,
} from "@/lib/cos/object-key"

describe("pickExt", () => {
  it("prefers mime mapping", () => {
    expect(pickExt("image/jpeg", "a.txt")).toBe(".jpg")
    expect(pickExt("image/png", "a.txt")).toBe(".png")
    expect(pickExt("video/mp4", "a.txt")).toBe(".mp4")
    expect(pickExt("video/quicktime", "a.txt")).toBe(".mov")
    expect(pickExt("audio/mpeg", "a.txt")).toBe(".mp3")
  })

  it("falls back to the original filename extension", () => {
    expect(pickExt("", "photo.PNG")).toBe(".png")
    expect(pickExt("application/octet-stream", "clip.webm")).toBe(".webm")
  })

  it("falls back to .bin for unknown types", () => {
    expect(pickExt("", "file.xyz")).toBe(".bin")
    expect(pickExt("", "")).toBe(".bin")
  })
})

describe("buildCosObjectKey", () => {
  it("builds <keyPrefix>/<userId>/<yyyy>/<mm>/<uuid>.<ext>", () => {
    const key = buildCosObjectKey({
      keyPrefix: "uploads",
      userId: "u-1",
      mimeType: "video/mp4",
      originalName: "lesson.mp4",
    })
    const now = new Date()
    const yyyy = String(now.getUTCFullYear())
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0")
    const parts = key.split("/")
    expect(parts[0]).toBe("uploads")
    expect(parts[1]).toBe("u-1")
    expect(parts[2]).toBe(yyyy)
    expect(parts[3]).toBe(mm)
    // <uuid>.mp4
    expect(parts[4]).toMatch(/^[0-9a-f-]{36}\.mp4$/)
  })

  it("omits the prefix segment when keyPrefix is empty", () => {
    const key = buildCosObjectKey({
      keyPrefix: "",
      userId: "u-1",
      mimeType: "image/png",
      originalName: "cover.png",
    })
    const parts = key.split("/")
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe("u-1")
  })

  it("produces a unique key per call", () => {
    const a = buildCosObjectKey({ keyPrefix: "uploads", userId: "u", mimeType: "image/png", originalName: "a.png" })
    const b = buildCosObjectKey({ keyPrefix: "uploads", userId: "u", mimeType: "image/png", originalName: "a.png" })
    expect(a).not.toBe(b)
  })
})

describe("buildCosPublicUrl", () => {
  it("normalizes to a single slash", () => {
    expect(buildCosPublicUrl("https://cdn.example.com", "a/b.mp4")).toBe(
      "https://cdn.example.com/a/b.mp4"
    )
    expect(buildCosPublicUrl("https://cdn.example.com/", "a/b.mp4")).toBe(
      "https://cdn.example.com/a/b.mp4"
    )
    expect(buildCosPublicUrl("https://cdn.example.com", "/a/b.mp4")).toBe(
      "https://cdn.example.com/a/b.mp4"
    )
  })
})
