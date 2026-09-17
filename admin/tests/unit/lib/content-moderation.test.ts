import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * lib/content-moderation 纯函数单元测试。
 *
 * 模块顶层 import 了 @/lib/db,统一 mock 断开数据库;
 * 本文件只覆盖无副作用的纯逻辑:文本分段、结果合并、label 映射、scene 映射。
 * 开关 / openid 的 DB 查询逻辑由集成测试 content-check.test.ts 覆盖。
 */

const { mockDb } = vi.hoisted(() => {
  // 通用空链:select().from().where().limit() → []
  const chain = () => ({
    from: () => ({
      where: () => ({
        limit: async () => [],
      }),
    }),
  })
  return { mockDb: { select: vi.fn(() => chain()) } }
})

vi.mock("@/lib/db", () => ({ db: mockDb }))

import {
  combineVerdicts,
  labelNameOf,
  MODERATION_MAX_CHUNK_BYTES,
  SCENE_TO_WECHAT,
  splitTextByUtf8Bytes,
} from "@/lib/content-moderation"
import type { MsgSecCheckResult } from "@/lib/wechat/miniprogram"

beforeEach(() => {
  mockDb.select.mockClear()
})

describe("splitTextByUtf8Bytes", () => {
  it("keeps short ascii text in a single chunk", () => {
    expect(splitTextByUtf8Bytes("hello world")).toEqual(["hello world"])
  })

  it("returns empty array for empty text", () => {
    expect(splitTextByUtf8Bytes("")).toEqual([])
  })

  it("never splits inside a multi-byte char and preserves the original on concat", () => {
    // 每个汉字 3 字节;maxBytes=5 时任何两个汉字都无法同段
    const text = "你好世界"
    const chunks = splitTextByUtf8Bytes(text, 5)
    expect(chunks.every((c) => Buffer.byteLength(c, "utf8") <= 5)).toBe(true)
    expect(chunks.join("")).toBe(text)
    expect(chunks).toEqual(["你", "好", "世", "界"])
  })

  it("honours the exact byte boundary", () => {
    // 你好 = 6 字节,恰好等于 maxBytes
    const chunks = splitTextByUtf8Bytes("你好世", 6)
    expect(chunks).toEqual(["你好", "世"])
  })

  it("uses the default 2400-byte budget", () => {
    const text = "汉".repeat(1000) // 3000 字节
    const chunks = splitTextByUtf8Bytes(text)
    expect(chunks.length).toBe(2)
    expect(chunks.every((c) => Buffer.byteLength(c, "utf8") <= MODERATION_MAX_CHUNK_BYTES)).toBe(true)
    expect(chunks.join("")).toBe(text)
  })

  it("keeps a 4-byte emoji as its own chunk when it exceeds maxBytes", () => {
    const chunks = splitTextByUtf8Bytes("🙂", 3)
    expect(chunks).toEqual(["🙂"])
  })
})

describe("combineVerdicts", () => {
  const pass = (label = 100): MsgSecCheckResult => ({ suggest: "pass", label })
  const risky = (label: number): MsgSecCheckResult => ({ suggest: "risky", label })
  const review = (label: number): MsgSecCheckResult => ({ suggest: "review", label })

  it("returns plain pass when every chunk passes (no label fields)", () => {
    const verdict = combineVerdicts([pass(), pass(100)])
    expect(verdict).toEqual({ result: "pass" })
  })

  it("picks the worst suggestion regardless of chunk order", () => {
    // risky(0) 比 review(1) / pass(2) 更严重
    const verdict = combineVerdicts([review(20001), pass(), risky(20002)])
    expect(verdict.result).toBe("risky")
    expect(verdict.label).toBe(20002)
    expect(verdict.labelName).toBe("色情")
  })

  it("falls back to review when no chunk is risky but one asks for human review", () => {
    const verdict = combineVerdicts([pass(), review(10001)])
    expect(verdict.result).toBe("review")
    expect(verdict.label).toBe(10001)
    expect(verdict.labelName).toBe("广告")
  })

  it("maps unknown suggest to block (fail closed)", () => {
    const verdict = combineVerdicts([
      { suggest: "whatever", label: 100 },
      pass(),
    ])
    expect(verdict.result).toBe("block")
  })

  it("returns block when there is no result at all (defensive)", () => {
    expect(combineVerdicts([]).result).toBe("block")
  })

  it("carries traceId of the worst chunk", () => {
    const verdict = combineVerdicts([
      { suggest: "pass", label: 100, traceId: "t-pass" },
      { suggest: "risky", label: 20003, traceId: "t-risky" },
    ])
    expect(verdict.traceId).toBe("t-risky")
  })
})

describe("labelNameOf", () => {
  it("maps documented wechat labels", () => {
    expect(labelNameOf(100)).toBe("正常")
    expect(labelNameOf(20001)).toBe("时政")
    expect(labelNameOf(20006)).toBe("违法犯罪")
  })

  it("returns undefined for unknown labels instead of inventing a name", () => {
    expect(labelNameOf(99999)).toBeUndefined()
  })
})

describe("SCENE_TO_WECHAT", () => {
  it("maps business scenes to wechat scene values", () => {
    expect(SCENE_TO_WECHAT.checkin).toBe(4)
    expect(SCENE_TO_WECHAT.comment).toBe(2)
    expect(SCENE_TO_WECHAT.circle).toBe(3)
    expect(SCENE_TO_WECHAT.activity).toBe(3)
    expect(SCENE_TO_WECHAT.profile).toBe(1)
  })
})
