import {
  openApiInfo,
  openApiSecuritySchemes,
  openApiServers,
  openApiTags,
} from "./manual"
import { apiVersion, openApiPaths } from "./paths.generated"
import { openApiSchemas } from "./schemas"
import type { OpenApiDocument } from "./types"

/**
 * 运行时组装完整 OpenAPI 文档。
 *
 * - paths 来自生成产物 `paths.generated.ts`(由 `pnpm openapi:generate` 依据路由生成);
 * - 元信息 / 分组 / schema 来自手工维护模块,不写进生成产物,
 *   改一处描述无需重新生成(生成产物的 diff 只反映路由变化)。
 *
 * 使用方:`GET /api/openapi`(JSON)与 `/admin/api-docs`(Swagger UI)。
 */
export function getOpenApiSpec(): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: { ...openApiInfo, version: apiVersion },
    servers: openApiServers,
    tags: openApiTags,
    paths: openApiPaths,
    components: {
      securitySchemes: openApiSecuritySchemes,
      schemas: openApiSchemas,
    },
  }
}
