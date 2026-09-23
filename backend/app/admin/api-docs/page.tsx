import Link from "next/link"

import { getOpenApiSpec } from "@/lib/openapi/spec"

import { ApiDocsView } from "./_components/api-docs-view"

export const metadata = {
  title: "API 文档",
}

/** 文档里收录的方法(用于统计接口数量) */
const METHODS = ["get", "post", "put", "patch", "delete"] as const

export default function ApiDocsPage() {
  const spec = getOpenApiSpec()
  const pathCount = Object.keys(spec.paths).length
  const operationCount = Object.values(spec.paths).reduce(
    (total, item) => total + METHODS.filter(method => item[method]).length,
    0
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">API 文档</h1>
          <p className="text-sm text-muted-foreground">
            共 {pathCount} 个路径 / {operationCount} 个接口,由
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-xs">
              pnpm openapi:generate
            </code>
            从路由源码生成。
          </p>
        </div>
        <Link
          href="/api/openapi"
          target="_blank"
          className="text-sm text-primary hover:underline"
        >
          查看 OpenAPI JSON
        </Link>
      </div>

      <ApiDocsView spec={spec} />
    </div>
  )
}
