/**
 * OpenAPI 3.0 文档所需的最小类型集合。
 *
 * 只声明本项目「生成 + 渲染 + 校验」实际用到的字段，避免引入完整 OpenAPI 类型
 * (数百行)带来的维护成本。渲染端为 Swagger UI，容忍未知字段。
 */

/** 单个 schema(支持嵌套对象 / 数组 / 枚举 / 组合) */
export type OpenApiSchema = {
  title?: string
  type?: "string" | "number" | "integer" | "boolean" | "object" | "array" | "null"
  format?: string
  description?: string
  enum?: readonly (string | number | boolean)[]
  nullable?: boolean
  required?: readonly string[]
  properties?: Record<string, OpenApiSchema>
  items?: OpenApiSchema
  additionalProperties?: boolean | OpenApiSchema
  oneOf?: readonly OpenApiSchema[]
  anyOf?: readonly OpenApiSchema[]
  allOf?: readonly OpenApiSchema[]
  example?: unknown
  default?: unknown
  minimum?: number
  maximum?: number
  deprecated?: boolean
  /** 引用 components.schemas 中的定义,如 `#/components/schemas/CircleDTO` */
  $ref?: string
}

/** 请求参数(query / path / header / cookie) */
export type OpenApiParameter = {
  name: string
  in: "query" | "path" | "header" | "cookie"
  description?: string
  required?: boolean
  deprecated?: boolean
  schema: OpenApiSchema
  example?: unknown
}

/** 单个响应 */
export type OpenApiResponse = {
  description: string
  content?: Record<string, { schema: OpenApiSchema }>
}

/** 安全要求:同一对象内多个 scheme 为 AND,数组中多个对象为 OR */
export type OpenApiSecurityRequirement = Record<string, readonly string[]>

export type OpenApiRequestBody = {
  description?: string
  required?: boolean
  content: Record<string, { schema: OpenApiSchema }>
}

/** 支持的 HTTP 方法(OPTIONS 为 CORS 预检,不进文档) */
export type OpenApiMethod = "get" | "post" | "put" | "patch" | "delete"

/** 单个操作(方法 + 路径) */
export type OpenApiOperation = {
  tags?: string[]
  summary?: string
  description?: string
  operationId?: string
  parameters?: OpenApiParameter[]
  requestBody?: OpenApiRequestBody
  responses: Record<string, OpenApiResponse>
  security?: OpenApiSecurityRequirement[]
  deprecated?: boolean
}

export type OpenApiPathItem = {
  summary?: string
  description?: string
  parameters?: OpenApiParameter[]
} & Partial<Record<OpenApiMethod, OpenApiOperation>>

/** paths 映射:路径(含 `{param}` 占位) → 路径项 */
export type OpenApiPaths = Record<string, OpenApiPathItem>

export type OpenApiTag = {
  name: string
  description?: string
  externalDocs?: { description?: string; url: string }
}

export type OpenApiSecurityScheme = {
  type: "http" | "apiKey"
  scheme?: string
  in?: "cookie" | "header" | "query"
  name?: string
  bearerFormat?: string
  description?: string
}

export type OpenApiInfo = {
  title: string
  version: string
  description?: string
}

/** 完整 OpenAPI 3.0 文档 */
export type OpenApiDocument = {
  openapi: string
  info: OpenApiInfo
  servers: { url: string; description?: string }[]
  tags: OpenApiTag[]
  paths: OpenApiPaths
  components: {
    securitySchemes: Record<string, OpenApiSecurityScheme>
    schemas: Record<string, OpenApiSchema>
  }
}

/**
 * 单条端点的补充信息(手工维护)。
 *
 * 路径写法与 `app/api` 下各 `route.ts` 一致:动态段用 Next.js 的 `[param]` 形式,
 * 生成时会统一转换为 OpenAPI 的 `{param}`。未在 `operationDocs` 中登记的端点,
 * 描述自动取自路由文件里的 JSDoc 注释。
 */
export type EndpointDoc = {
  method: OpenApiMethod
  path: string
  /** 覆盖自动推断的 tag(中文分组名) */
  tag?: string
  /** 覆盖自动提取的 summary */
  summary?: string
  /** 覆盖自动提取的 description(支持 markdown) */
  description?: string
  /** 补充 query 参数(与源码自动提取结果合并,同名以手工为准) */
  parameters?: OpenApiParameter[]
  requestBody?: OpenApiRequestBody
  /** 补充 / 覆盖响应(键为状态码字符串) */
  responses?: Record<string, OpenApiResponse>
  /** 覆盖自动推断的鉴权要求;传 `[]` 表示公开接口 */
  security?: OpenApiSecurityRequirement[]
}
