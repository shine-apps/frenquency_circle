"use client"

import dynamic from "next/dynamic"

import "swagger-ui-react/swagger-ui.css"

import type { OpenApiDocument } from "@/lib/openapi/types"

/**
 * Swagger UI 容器。
 *
 * - `dynamic(..., { ssr: false })`:swagger-ui 在模块初始化时访问 `window`,
 *   必须延后到浏览器端加载(在 Server Component 里禁止 `ssr: false`,故本文件是客户端组件);
 * - 样式表 `swagger-ui-react/swagger-ui.css` 只在访问本页时随路由样式注入,
 *   不会影响后台其余页面。
 */
const SwaggerUI = dynamic(() => import("swagger-ui-react"), { ssr: false })

export function ApiDocsView({ spec }: { spec: OpenApiDocument }) {
  return (
    <div className="swagger-shell overflow-hidden rounded-lg border bg-white">
      <SwaggerUI
        spec={spec}
        docExpansion="list"
        defaultModelsExpandDepth={-1}
        filter
        displayRequestDuration
      />
    </div>
  )
}
