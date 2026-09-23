import { NextResponse } from "next/server"

import { getOpenApiSpec } from "@/lib/openapi/spec"

/**
 * GET /api/openapi
 *
 * 返回 OpenAPI 3.0 文档(JSON)。
 *
 * - 公开只读:内容仅为接口契约(路径 / 参数 / 响应结构),不含任何业务数据;
 * - 浏览器直接打开即可查看;可导入 Postman / Apifox / IDE 的 OpenAPI 插件;
 * - 同名 Swagger UI 页面在管理后台 `/admin/api-docs`(需登录)。
 */
export async function GET() {
  return NextResponse.json(getOpenApiSpec(), {
    headers: {
      // 便于浏览器另存为 openapi.json
      "Content-Disposition": 'inline; filename="openapi.json"',
      "Cache-Control": "no-store",
    },
  })
}
