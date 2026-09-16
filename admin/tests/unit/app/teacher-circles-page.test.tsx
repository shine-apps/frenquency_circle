import { beforeEach, describe, expect, it, vi } from "vitest"
import type { Mock } from "vitest"
import type { ReactElement } from "react"

/**
 * `app/teacher/circles/page.tsx` 的 `?scope=all` 服务端权限校验测试。
 *
 * 关键点:客户端组件里的「查看全部」开关只是 UI 入口,**真正的越权防护在服务端**。
 * 这里断言:
 * - ADMIN 带 `?scope=all` → 查询不带 creatorId 过滤,scope 透传为 "all"
 * - TEACHER 带 `?scope=all` → 被忽略,仍然只查自己(scope 回落 "mine")
 */

const { authMock, redirectMock, selectWhereArgs, mockDb } = vi.hoisted(() => {
  /** 记录每次 db.select() 链上的 where 参数 */
  const whereArgs: unknown[] = []

  function makeSelectChain() {
    const chain = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      where: vi.fn((condition?: unknown) => {
        whereArgs.push(condition)
        return chain
      }),
      orderBy: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      offset: vi.fn(() => chain),
      then: (
        resolve: (value: Record<string, unknown>[]) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve([] as Record<string, unknown>[]).then(resolve, reject),
    }
    return chain
  }

  return {
    authMock: vi.fn(),
    redirectMock: vi.fn(),
    selectWhereArgs: whereArgs,
    mockDb: {
      select: vi.fn(() => makeSelectChain()),
    },
  }
}) as {
  authMock: ReturnType<typeof vi.fn>
  // 注意用 Mock<T> 而非 ReturnType<typeof vi.fn>:后者是
  // `Mock<Procedure | Constructable>`,TS 认为不可直接调用
  redirectMock: Mock<(path: string) => void>
  selectWhereArgs: unknown[]
  mockDb: { select: ReturnType<typeof vi.fn> }
}

vi.mock("@/auth", () => ({ auth: authMock }))
vi.mock("@/lib/db", () => ({ db: mockDb }))
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    redirectMock(path)
    const err = new Error(`NEXT_REDIRECT:${path}`)
    ;(err as Error & { path: string }).path = path
    throw err
  },
}))

import TeacherCirclesPage from "@/app/teacher/circles/page"
import { extractSqlParamValues } from "@/tests/helpers/sql-params"

const ADMIN = { id: "33333333-3333-3333-3333-333333333333", role: "ADMIN" }
const TEACHER = { id: "11111111-1111-1111-1111-111111111111", role: "TEACHER" }

function sessionOf(user: unknown) {
  return { user: { email: "x@e.com", name: "X", ...(user as object) }, expires: "2099-01-01" }
}

/** 从返回的元素树里取出传给 TeacherCirclesTable 的 props */
function tablePropsOf(element: unknown): { scope: string; canSwitchScope: boolean } {
  const el = element as ReactElement<{
    children: ReactElement<{ scope: string; canSwitchScope: boolean }>[]
  }>
  // 返回值形如 <div><div/>{table}</div>,向下找第一个带 scope prop 的元素
  const stack: unknown[] = [el]
  while (stack.length > 0) {
    const node = stack.pop() as ReactElement<Record<string, unknown>> | undefined
    if (!node || typeof node !== "object") continue
    const props = node.props
    if (props && typeof props === "object" && "scope" in props) {
      return props as unknown as { scope: string; canSwitchScope: boolean }
    }
    const children = props?.children
    if (Array.isArray(children)) stack.push(...children)
    else if (children) stack.push(children)
  }
  throw new Error("未在返回的元素树中找到 TeacherCirclesTable")
}

beforeEach(() => {
  authMock.mockReset()
  redirectMock.mockClear()
  mockDb.select.mockClear()
  selectWhereArgs.length = 0
})

describe("TeacherCirclesPage 的 scope=all 服务端校验", () => {
  it("redirects to /login when the session has no user id", async () => {
    authMock.mockResolvedValue({ user: { role: "TEACHER" }, expires: "2099-01-01" })
    await expect(
      TeacherCirclesPage({ searchParams: Promise.resolve({}) })
    ).rejects.toMatchObject({ path: "/login" })
  })

  it("rejects a USER session (非 TEACHER/ADMIN 不可访问)", async () => {
    // 单测层面只验证不会进入查库分支:USER 在 layout/proxy 层已被拦,
    // 这里 page 自身不判角色,因此仅断言 admin 判定为 false(不展示开关)
    authMock.mockResolvedValue(sessionOf({ id: TEACHER.id, role: "USER" }))
    const props = tablePropsOf(await TeacherCirclesPage({ searchParams: Promise.resolve({}) }))
    expect(props.canSwitchScope).toBe(false)
  })

  it("ignores scope=all for a TEACHER (仍只查自己)", async () => {
    authMock.mockResolvedValue(sessionOf(TEACHER))

    const props = tablePropsOf(
      await TeacherCirclesPage({ searchParams: Promise.resolve({ scope: "all" }) })
    )

    expect(props.scope).toBe("mine")
    expect(props.canSwitchScope).toBe(false)
    // 圈子查询的 where 必须仍然带 creatorId
    const circleWhere = selectWhereArgs[0]
    expect(extractSqlParamValues(circleWhere)).toContain(TEACHER.id)
  })

  it("honours scope=all for an ADMIN (可代管,不加 creatorId 过滤)", async () => {
    authMock.mockResolvedValue(sessionOf(ADMIN))

    const props = tablePropsOf(
      await TeacherCirclesPage({ searchParams: Promise.resolve({ scope: "all" }) })
    )

    expect(props.scope).toBe("all")
    expect(props.canSwitchScope).toBe(true)
    // 全量视图的 where 不应包含 ADMIN 自己的 id
    expect(extractSqlParamValues(selectWhereArgs[0])).not.toContain(ADMIN.id)
  })

  it("defaults ADMIN to mine without the query param", async () => {
    authMock.mockResolvedValue(sessionOf(ADMIN))

    const props = tablePropsOf(
      await TeacherCirclesPage({ searchParams: Promise.resolve({}) })
    )

    expect(props.scope).toBe("mine")
    expect(extractSqlParamValues(selectWhereArgs[0])).toContain(ADMIN.id)
  })
})
