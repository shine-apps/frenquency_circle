import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * POST /api/content/check 集成测试。
 *
 * 覆盖:
 * - 401 未登录 / 400 参数非法(type 非 text、content 缺失或为空)
 * - 开关关闭 → 200 pass,且不产生任何微信调用
 * - 开关开启但用户未绑定微信 → 503(fail-closed)
 * - 正常送审 → 200(透传 suggest → result / label / labelName / traceId)
 * - 微信侧异常(WechatMpError)→ 503
 * - 超长文本分段送审,任一段 risky 即整体 risky
 * - CORS 头
 *
 * mock 层级(参考 users-me-wechat-bind.test.ts 模式):
 * - @/lib/auth-utils:requireSession(避免拉入 @/auth)
 * - @/lib/db:select().from().where().limit() 链,按请求顺序出队结果
 *   (路由内查询顺序固定:① system_settings 开关 → ② accounts openid)
 * - @/lib/wechat/miniprogram:readWechatMpConfig / getAccessToken / msgSecCheck
 * - @/lib/logger:静默
 */

const {
  requireSessionMock,
  readWechatMpConfigMock,
  getAccessTokenMock,
  msgSecCheckMock,
  resultQueue,
  MockWechatMpError,
} = vi.hoisted(() => {
  class MockWechatMpError extends Error {
    constructor(
      public errcode: number,
      public errmsg: string,
      public stage: string
    ) {
      super(`[${errcode}] ${errmsg}`)
      this.name = "WechatMpError"
    }
  }
  const resultQueue: unknown[][] = []
  return {
    requireSessionMock: vi.fn(),
    readWechatMpConfigMock: vi.fn(),
    getAccessTokenMock: vi.fn(),
    msgSecCheckMock: vi.fn(),
    resultQueue,
    MockWechatMpError,
  }
})

vi.mock("@/lib/auth-utils", () => ({
  requireSession: requireSessionMock,
}))

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          // 每次查询按序消费一个结果集:① 开关行 ② openid 行
          limit: async () => resultQueue.shift() ?? [],
        }),
      }),
    }),
  },
}))

vi.mock("@/lib/wechat/miniprogram", () => ({
  WechatMpError: MockWechatMpError,
  readWechatMpConfig: readWechatMpConfigMock,
  getAccessToken: getAccessTokenMock,
  msgSecCheck: msgSecCheckMock,
}))

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  LOG_PREFIX: { MODERATION: "MODERATION" },
}))

import { OPTIONS, POST } from "@/app/api/content/check/route"
import type { ContentCheckDTO, IResponse } from "@/types/api"

const FAKE_USER = { id: "u-1", email: "u@test.dev", name: "user-1", role: "USER" }
const FAKE_OPENID = "o-openid-1"

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/content/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

/** 入队一轮查询结果:① 开关 ② openid 绑定 */
function enqueueSettings(enabled: boolean, openid: string | null) {
  resultQueue.push([{ value: enabled }])
  resultQueue.push(openid ? [{ openid }] : [])
}

/** 断言请求未走到微信调用(用于 401/400/未绑定等快速失败路径) */
function expectNoWechatCall(): void {
  expect(getAccessTokenMock).not.toHaveBeenCalled()
  expect(msgSecCheckMock).not.toHaveBeenCalled()
}

beforeEach(() => {
  resultQueue.length = 0
  requireSessionMock.mockReset().mockResolvedValue({ user: FAKE_USER })
  readWechatMpConfigMock
    .mockReset()
    .mockReturnValue({ appId: "wx-app", appSecret: "secret", apiBase: "https://api.weixin.qq.com" })
  getAccessTokenMock.mockReset().mockResolvedValue("token-1")
  msgSecCheckMock.mockReset().mockResolvedValue({ suggest: "pass", label: 100, traceId: "t-1" })
})

describe("POST /api/content/check", () => {
  it("returns 401 when unauthenticated", async () => {
    requireSessionMock.mockResolvedValue({
      response: new Response(JSON.stringify({ code: 401, data: null, message: "未登录" }), {
        status: 401,
      }),
    })
    const res = await POST(makeRequest({ type: "text", content: "hello" }))
    expect(res.status).toBe(401)
    expectNoWechatCall()
  })

  it("returns 400 when type is not text", async () => {
    const res = await POST(makeRequest({ type: "image", content: "hello" }))
    expect(res.status).toBe(400)
    expectNoWechatCall()
  })

  it("returns 400 when content is missing or blank", async () => {
    for (const body of [{ type: "text" }, { type: "text", content: "   " }]) {
      const res = await POST(makeRequest(body))
      expect(res.status).toBe(400)
    }
    expectNoWechatCall()
  })

  it("returns 200 pass without any wechat call when moderation is disabled", async () => {
    enqueueSettings(false, null)
    const res = await POST(makeRequest({ type: "text", content: "hello" }))
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<ContentCheckDTO>
    expect(body.data.result).toBe("pass")
    expectNoWechatCall()
  })

  it("returns 503 when enabled but user has no wechat openid binding", async () => {
    enqueueSettings(true, null)
    const res = await POST(makeRequest({ type: "text", content: "hello" }))
    expect(res.status).toBe(503)
    expectNoWechatCall()
  })

  it("returns pass and calls wechat with resolved openid and default scene", async () => {
    enqueueSettings(true, FAKE_OPENID)
    const res = await POST(makeRequest({ type: "text", content: "正常内容" }))
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<ContentCheckDTO>
    expect(body.data.result).toBe("pass")
    expect(getAccessTokenMock).toHaveBeenCalledTimes(1)
    expect(msgSecCheckMock).toHaveBeenCalledTimes(1)
    expect(msgSecCheckMock).toHaveBeenCalledWith(
      expect.objectContaining({
        openid: FAKE_OPENID,
        scene: 3, // 缺省 scene=circle → 论坛
        content: "正常内容",
        accessToken: "token-1",
      })
    )
  })

  it("maps business scene to wechat scene value", async () => {
    enqueueSettings(true, FAKE_OPENID)
    await POST(makeRequest({ type: "text", content: "打卡一下", scene: "checkin" }))
    expect(msgSecCheckMock).toHaveBeenCalledWith(expect.objectContaining({ scene: 4 }))
  })

  it("propagates risky verdict with label/labelName/traceId", async () => {
    enqueueSettings(true, FAKE_OPENID)
    msgSecCheckMock.mockResolvedValue({ suggest: "risky", label: 20002, traceId: "tr-9" })

    const res = await POST(makeRequest({ type: "text", content: "违规内容" }))
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<ContentCheckDTO>
    expect(body.data.result).toBe("risky")
    expect(body.data.label).toBe(20002)
    expect(body.data.labelName).toBe("色情")
    expect(body.data.traceId).toBe("tr-9")
  })

  it("propagates review verdict", async () => {
    enqueueSettings(true, FAKE_OPENID)
    msgSecCheckMock.mockResolvedValue({ suggest: "review", label: 10001 })

    const res = await POST(makeRequest({ type: "text", content: "待定内容" }))
    const body = (await res.json()) as IResponse<ContentCheckDTO>
    expect(body.data.result).toBe("review")
  })

  it("returns 503 when the wechat upstream fails (fail closed)", async () => {
    enqueueSettings(true, FAKE_OPENID)
    msgSecCheckMock.mockRejectedValue(new MockWechatMpError(40001, "invalid credential", "sec-check"))

    const res = await POST(makeRequest({ type: "text", content: "hello" }))
    expect(res.status).toBe(503)
  })

  it("returns 503 when wechat config is missing on the server", async () => {
    enqueueSettings(true, FAKE_OPENID)
    readWechatMpConfigMock.mockImplementation(() => {
      throw new MockWechatMpError(-10, "missing WECHAT_MP_APP_ID or WECHAT_MP_APP_SECRET", "code2session")
    })

    const res = await POST(makeRequest({ type: "text", content: "hello" }))
    expect(res.status).toBe(503)
    expectNoWechatCall()
  })

  it("splits over-length text into byte-safe chunks and any risky chunk wins", async () => {
    enqueueSettings(true, FAKE_OPENID)
    // 1600 个汉字 = 4800 字节 → 2 段(每段 ≤ 2400 字节)
    const content = "汉".repeat(1600)
    msgSecCheckMock
      .mockResolvedValueOnce({ suggest: "pass", label: 100 })
      .mockResolvedValueOnce({ suggest: "risky", label: 20003, traceId: "tr-split" })

    const res = await POST(makeRequest({ type: "text", content }))
    expect(res.status).toBe(200)

    const body = (await res.json()) as IResponse<ContentCheckDTO>
    expect(body.data.result).toBe("risky")
    expect(body.data.labelName).toBe("辱骂")
    expect(msgSecCheckMock).toHaveBeenCalledTimes(2)

    const first = msgSecCheckMock.mock.calls[0]![0] as { content: string }
    const second = msgSecCheckMock.mock.calls[1]![0] as { content: string }
    expect(first.content + second.content).toBe(content) // 分段不丢字
    expect(first.content).toHaveLength(800)
  })

  it("attaches CORS headers", async () => {
    enqueueSettings(false, null)
    const res = await POST(makeRequest({ type: "text", content: "hello" }))
    expect(res.headers.get("access-control-allow-origin")).toBe("*")
    expect(res.headers.get("access-control-allow-headers")).toContain("Authorization")
  })

  it("answers OPTIONS preflight", async () => {
    const res = await OPTIONS(makeRequest({}))
    expect(res.status).toBe(204)
    expect(res.headers.get("access-control-allow-methods")).toContain("POST")
  })
})
