import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * lib/contacts.ts 纯函数单测。
 *
 * 覆盖 `deriveContactStatus`(请求状态推导)的核心规则:
 * - 无历史请求 → none
 * - accepted 优先于一切(一旦建立联系即永久解锁)
 * - pending 按方向区分 pending_sent / pending_received
 * - 最近一次 rejected → rejected
 * - 其他状态兜底 → none
 */

vi.mock("@/lib/db", () => ({ db: {} }))

import { deriveContactStatus } from "@/lib/contacts"

function row(
  overrides: Partial<{
    id: string
    fromUserId: string
    toUserId: string
    status: "pending" | "accepted" | "rejected"
  }> = {}
) {
  return {
    id: overrides.id ?? "req-1",
    fromUserId: overrides.fromUserId ?? "viewer",
    toUserId: overrides.toUserId ?? "target",
    status: overrides.status ?? ("pending" as const),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("deriveContactStatus", () => {
  it("returns none for empty history", () => {
    expect(deriveContactStatus([], "viewer")).toEqual({
      contactStatus: "none",
      requestId: null,
    })
  })

  it("derives pending_sent for viewer's own pending request", () => {
    const result = deriveContactStatus([row()], "viewer")
    expect(result.contactStatus).toBe("pending_sent")
    expect(result.requestId).toBe("req-1")
  })

  it("derives pending_received for incoming pending request", () => {
    const result = deriveContactStatus(
      [row({ fromUserId: "target", toUserId: "viewer", id: "req-2" })],
      "viewer"
    )
    expect(result.contactStatus).toBe("pending_received")
    expect(result.requestId).toBe("req-2")
  })

  it("accepted wins over any other status", () => {
    const result = deriveContactStatus(
      [
        row({ status: "pending", id: "req-pending" }),
        row({ status: "accepted", id: "req-accepted" }),
        row({ status: "rejected", id: "req-rejected" }),
      ],
      "viewer"
    )
    expect(result.contactStatus).toBe("accepted")
    expect(result.requestId).toBe("req-accepted")
  })

  it("returns rejected when latest request was rejected", () => {
    const result = deriveContactStatus(
      [row({ status: "rejected", id: "req-3" })],
      "viewer"
    )
    expect(result.contactStatus).toBe("rejected")
    expect(result.requestId).toBeNull()
  })

  it("falls back to none for unknown statuses", () => {
    const rows = [
      {
        id: "req-x",
        fromUserId: "viewer",
        toUserId: "target",
        status: "unknown" as never,
      },
    ]
    const result = deriveContactStatus(rows, "viewer")
    expect(result.contactStatus).toBe("none")
    expect(result.requestId).toBeNull()
  })
})
