import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { generateDocument, renderGeneratedModule } from "@/lib/openapi/generate"
import { getOpenApiSpec } from "@/lib/openapi/spec"

/**
 * OpenAPI 文档测试:
 * 1. 生成产物必须与 `app/api` 下的路由保持同步(新增路由后忘记重新生成会在这里失败);
 * 2. 文档结构自检(分组 / 名称 / 响应 / path 参数 / $ref);
 * 3. 鉴权标注抽查。
 */

const ROOT = process.cwd()
const API_DIR = path.join(ROOT, "app", "api")
const GENERATED_FILE = path.join(ROOT, "lib", "openapi", "paths.generated.ts")

const METHODS = ["get", "post", "put", "patch", "delete"] as const

/** 递归收集文档中的所有 `$ref` */
function collectRefs(value: unknown, refs: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs)
    return refs
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (key === "$ref" && typeof child === "string") refs.push(child)
      else collectRefs(child, refs)
    }
  }
  return refs
}

describe("OpenAPI 文档", () => {
  it("生成产物与 app/api 路由保持同步", () => {
    const version = (
      JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as { version: string }
    ).version
    const { document, operationCount } = generateDocument({ apiDir: API_DIR, version })

    expect(operationCount).toBeGreaterThan(100)
    expect(renderGeneratedModule(document)).toBe(readFileSync(GENERATED_FILE, "utf8"))
  })

  it("每个接口都有分组、名称、响应定义,path 参数与路径占位一致", () => {
    const spec = getOpenApiSpec()
    const entries = Object.entries(spec.paths).flatMap(([routePath, item]) =>
      METHODS.flatMap(method => {
        const operation = item[method]
        return operation ? [{ routePath, method, operation }] : []
      })
    )

    expect(entries.length).toBeGreaterThan(100)

    for (const { routePath, method, operation } of entries) {
      const label = `${method.toUpperCase()} ${routePath}`
      // 缺名称时:优先给路由补 JSDoc,或在 lib/openapi/summaries.ts 登记
      expect(operation.summary, `${label} 缺少 summary`).toBeTruthy()
      expect(operation.tags?.length, `${label} 缺少 tags`).toBeGreaterThan(0)
      expect(Object.keys(operation.responses).length, `${label} 缺少 responses`).toBeGreaterThan(0)

      const placeholders = [...routePath.matchAll(/\{([^}]+)\}/g)].map(match => match[1]).sort()
      const pathParams = (operation.parameters ?? [])
        .filter(parameter => parameter.in === "path")
        .map(parameter => parameter.name)
        .sort()
      expect(pathParams, `${label} 的 path 参数与路径占位不一致`).toEqual(placeholders)
    }
  })

  it("所有 $ref 都指向已定义的 schema", () => {
    const spec = getOpenApiSpec()
    const refs = collectRefs(spec.paths)

    expect(refs.length).toBeGreaterThan(0)
    for (const ref of refs) {
      const name = ref.replace("#/components/schemas/", "")
      expect(spec.components.schemas[name], `未定义的 schema: ${ref}`).toBeTruthy()
    }
  })

  it("公开接口不标注鉴权,后台接口仅使用 cookie 会话", () => {
    const spec = getOpenApiSpec()

    expect(spec.paths["/api/health"]?.get?.security).toBeUndefined()
    expect(spec.paths["/api/admin/stats"]?.get?.security).toEqual([{ sessionCookie: [] }])
    expect(spec.paths["/api/upload/cos-credentials"]?.get?.security).toEqual([
      { sessionCookie: [] },
      { bearerAuth: [] },
    ])
  })
})
