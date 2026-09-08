import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * GET /api/settings 集成测试。
 *
 * 覆盖:
 * - 无需登录即可访问(公开接口)
 * - 返回 key/value 数组,value 为 JSON 值(对象)而非字符串
 * - 无设置项时返回空数组
 *
 * mock 层级:
 * - @/lib/db:仅 mock select().from().orderBy() 链,返回预设的系统设置行
 *
 * 直接调用 route handler(参考 tags-search.test.ts 模式)。
 */

type SettingRow = { key: string; value: unknown }

const { mockDb } = vi.hoisted(() => {
  let rows: SettingRow[] = []

  const mockDb = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        orderBy: vi.fn(async () => rows),
      })),
    })),
    _setRows(r: SettingRow[]) {
      rows = r
    },
  }

  return { mockDb }
})

vi.mock("@/lib/db", () => ({ db: mockDb }))

import { GET as settingsGet } from "@/app/api/settings/route"
import type { IResponse, SystemSettingDTO } from "@/types/api"

beforeEach(() => {
  mockDb.select.mockClear()
  mockDb._setRows([])
})

describe("GET /api/settings", () => {
  it("returns key/value array without auth, value is JSON", async () => {
    mockDb._setRows([
      { key: "app_name", value: { zh: "趣邻圈", en: "QuLinQuan" } },
      { key: "app_version", value: { version: "1.0.0", forceUpdate: false } },
    ])

    const req = new Request("http://localhost/api/settings", { method: "GET" })
    const res = await settingsGet(req)
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<SystemSettingDTO[]>
    expect(body.code).toBe(200)
    expect(body.data).toHaveLength(2)
    expect(body.data[0]).toEqual({
      key: "app_name",
      value: { zh: "趣邻圈", en: "QuLinQuan" },
    })
    expect(body.data[1]!.key).toBe("app_version")
    // value 为 JSON 对象而非字符串
    expect(typeof body.data[0]!.value).toBe("object")
  })

  it("returns empty array when no settings exist", async () => {
    mockDb._setRows([])

    const req = new Request("http://localhost/api/settings", { method: "GET" })
    const res = await settingsGet(req)
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<SystemSettingDTO[]>
    expect(body.code).toBe(200)
    expect(body.data).toEqual([])
  })
})
