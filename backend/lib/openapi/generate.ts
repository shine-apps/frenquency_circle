import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import {
  openApiInfo,
  openApiSecuritySchemes,
  openApiServers,
  openApiTags,
  operationDocs,
  pathTagLabels,
} from "./manual"
import { openApiSchemas } from "./schemas"
import { operationSummaries } from "./summaries"
import type {
  EndpointDoc,
  OpenApiDocument,
  OpenApiMethod,
  OpenApiOperation,
  OpenApiParameter,
  OpenApiPaths,
  OpenApiResponse,
  OpenApiSchema,
  OpenApiSecurityRequirement,
} from "./types"

/**
 * OpenAPI 文档生成器。
 *
 * 扫描 `app/api/**\/route.ts`,从「导出的 HTTP 方法 + 方法上方 JSDoc 注释」生成
 * 文档条目;`lib/openapi/manual.ts` 的 `operationDocs` 负责补充代码里读不出来的
 * 信息(请求体结构、业务参数含义、响应示例)。
 *
 * 仅供 `scripts/generate-openapi.ts`(生成)与单元测试(校验同步)使用,
 * 不参与 Next.js 运行时渲染 —— 运行时读取的是生成产物 `paths.generated.ts`。
 */

/** 文档中收录的 HTTP 方法(OPTIONS 为 CORS 预检,HEAD 无业务实现,均不收录) */
const DOC_METHODS: OpenApiMethod[] = ["get", "post", "put", "patch", "delete"]

/** catch-all 路由(`[...nextauth]`)无法用 OpenAPI 路径表达,整体跳过 */
const CATCH_ALL_SEGMENT = /^\[\.\.\./

const JSDOC_RE = /\/\*\*([\s\S]*?)\*\//g
const METHOD_RE = /export\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD)\s*\(/g
const SEARCH_PARAM_RE = /searchParams\.get\(\s*["'`]([^"'`]+)["'`]\s*\)/g

export type ParsedRoute = {
  /** Next.js 形式的路径,如 `/api/circles/[id]` */
  nextPath: string
  /** OpenAPI 形式的路径,如 `/api/circles/{id}` */
  openApiPath: string
  method: OpenApiMethod
  /** JSDoc 第一行(去掉结尾句号) */
  summary?: string
  /** JSDoc 剩余内容(markdown) */
  description?: string
  /** 源码中推断出的守卫类型 */
  guard: RouteGuard
  /** 从 `searchParams.get("x")` 提取的 query 参数名 */
  queryParams: string[]
  /** 是否使用 `parsePagination()`,是则补 page / pageSize 参数 */
  paginated: boolean
}

/** 递归收集 `route.ts` 文件(返回绝对路径,已排序保证结果稳定) */
export function collectRouteFiles(apiDir: string): string[] {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name)
    )) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === "route.ts") files.push(full)
    }
  }
  walk(apiDir)
  return files
}

/** 绝对文件路径 → Next.js 路由路径(相对 `apiDir`,形如 `/api/circles/[id]`) */
export function toNextPath(apiDir: string, file: string): string {
  const dir = path.dirname(path.relative(apiDir, file))
  const segments = dir.split(path.sep).filter(Boolean)
  return "/api" + (segments.length > 0 ? "/" + segments.join("/") : "")
}

/** Next.js 路径 → OpenAPI 路径(`[id]` → `{id}`) */
export function toOpenApiPath(nextPath: string): string {
  return nextPath.replace(/\[([^[\]]+)\]/g, "{$1}")
}

/** 清洗 JSDoc:去掉 `*` 前缀与首尾空行,并剥离首行的 `METHOD /api/...` 标题 */
function cleanJsDoc(raw: string, method: string): string[] {
  const lines = raw
    .split("\n")
    .map(line => line.replace(/^\s*\*\s?/, "").trimEnd())

  while (lines.length > 0 && lines[0].trim() === "") lines.shift()
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop()

  const titleRe = new RegExp(`^${method}\\s+/api/\\S*$`)
  if (lines.length > 0 && titleRe.test(lines[0].trim())) lines.shift()

  while (lines.length > 0 && lines[0].trim() === "") lines.shift()
  return lines
}

/** 取 JSDoc 第一行作为 summary(超长时截断到第一个句号) */
function toSummary(lines: string[]): string | undefined {
  const first = lines[0]?.trim()
  if (!first) return undefined
  const sentence = first.split("。")[0] || first
  const text = sentence.replace(/[。:：]\s*$/, "").trim()
  return text.length > 100 ? `${text.slice(0, 97)}...` : text
}

/**
 * 守卫类型:
 * - `admin` / `teacher` —— 后台接口,浏览器 cookie 会话;
 * - `session` —— 普通登录态接口,cookie 与 Bearer 均可;
 * - `public` —— 公开接口。
 */
export type RouteGuard = "admin" | "teacher" | "session" | "public"

/** 在方法体内推断守卫类型(方法体不含 guard 时视为公开接口) */
function inferGuard(body: string): RouteGuard {
  if (/requireAdmin\(/.test(body)) return "admin"
  if (/requireTeacher\(/.test(body)) return "teacher"
  if (/requireSession\(|readUserFromToken\(/.test(body)) return "session"
  return "public"
}

/** 守卫类型 → OpenAPI 鉴权要求 */
function securityForGuard(guard: RouteGuard): OpenApiSecurityRequirement[] | undefined {
  if (guard === "admin" || guard === "teacher") return [{ sessionCookie: [] }]
  if (guard === "session") return [{ sessionCookie: [] }, { bearerAuth: [] }]
  return undefined
}

/** 解析单个 route.ts,返回其中每个 HTTP 方法的文档信息 */
export function parseRouteFile(apiDir: string, file: string): ParsedRoute[] {
  const source = readFileSync(file, "utf8")
  const nextPath = toNextPath(apiDir, file)
  if (nextPath.split("/").some(segment => CATCH_ALL_SEGMENT.test(segment))) return []

  const matches = [...source.matchAll(METHOD_RE)]
  const routes: ParsedRoute[] = []

  matches.forEach((match, index) => {
    const method = match[1].toLowerCase() as OpenApiMethod
    const start = match.index ?? 0
    const end = matches[index + 1]?.index ?? source.length

    // 取「上一个方法声明 → 当前方法声明」之间的文本,其中的最后一个 JSDoc
    // 即为当前方法的注释;注释与方法声明之间必须只有空白,否则视为文件头注释丢弃
    const segmentStart = matches[index - 1]?.index ?? 0
    const before = source.slice(segmentStart, start)
    let jsdocRaw: string | null = null
    for (const m of before.matchAll(JSDOC_RE)) {
      if (before.slice((m.index ?? 0) + m[0].length).trim() === "") jsdocRaw = m[1]
    }

    if (!DOC_METHODS.includes(method)) return

    const lines = jsdocRaw ? cleanJsDoc(jsdocRaw, match[1]) : []
    const body = source.slice(start, end)

    routes.push({
      nextPath,
      openApiPath: toOpenApiPath(nextPath),
      method,
      summary: toSummary(lines),
      description: lines.slice(1).join("\n").trim() || undefined,
      guard: inferGuard(body),
      queryParams: [...new Set([...body.matchAll(SEARCH_PARAM_RE)].map(m => m[1]))],
      paginated: body.includes("parsePagination("),
    })
  })

  return routes
}

/** query 参数 schema:分页 / 数量类按整数处理,其余按字符串 */
function inferQuerySchema(name: string): OpenApiSchema {
  if (/^(page|pageSize|limit|offset)$/.test(name)) {
    return name === "pageSize"
      ? { type: "integer", default: 20, maximum: 100, description: "每页条数(默认 20,上限 100)" }
      : name === "page"
        ? { type: "integer", default: 1, description: "页码(从 1 开始,默认 1)" }
        : { type: "integer" }
  }
  return { type: "string" }
}

const PAGE_PARAMS: OpenApiParameter[] = [
  {
    name: "page",
    in: "query",
    required: false,
    description: "页码(从 1 开始,默认 1)",
    schema: { type: "integer", default: 1, minimum: 1 },
  },
  {
    name: "pageSize",
    in: "query",
    required: false,
    description: "每页条数(默认 20,上限 100)",
    schema: { type: "integer", default: 20, minimum: 1, maximum: 100 },
  },
]

/** 路径中的动态段 → path 参数 */
function pathParams(nextPath: string): OpenApiParameter[] {
  return [...nextPath.matchAll(/\[([^[\]]+)\]/g)].map(m => ({
    name: m[1],
    in: "path" as const,
    required: true,
    description: "路径参数",
    schema: { type: "string" },
  }))
}

/** 合并 path / query 参数(手工登记优先,按 `in` + `name` 去重) */
function mergeParameters(
  route: ParsedRoute,
  doc?: EndpointDoc
): OpenApiParameter[] | undefined {
  const merged: OpenApiParameter[] = [...pathParams(route.nextPath)]
  const manual = doc?.parameters ?? []

  for (const param of manual) {
    if (!merged.some(p => p.in === param.in && p.name === param.name)) merged.push(param)
  }

  const queryNames = route.paginated ? ["page", "pageSize", ...route.queryParams] : route.queryParams
  for (const name of queryNames) {
    if (merged.some(p => p.in === "query" && p.name === name)) continue
    const standard = PAGE_PARAMS.find(p => p.name === name)
    if (standard) {
      merged.push(standard)
      continue
    }
    merged.push({
      name,
      in: "query",
      required: false,
      schema: inferQuerySchema(name),
    })
  }

  return merged.length > 0 ? merged : undefined
}

/** 默认响应:统一信封;受保护接口追加 401,后台接口追加 403 */
function defaultResponses(route: ParsedRoute): Record<string, OpenApiResponse> {
  const responses: Record<string, OpenApiResponse> = {
    "200": {
      description: "成功",
      content: {
        "application/json": { schema: { $ref: "#/components/schemas/IResponse" } },
      },
    },
  }
  if (route.guard !== "public") {
    responses["401"] = { description: "未登录或凭据无效" }
  }
  if (route.guard === "admin") {
    responses["403"] = { description: "需要管理员权限" }
  } else if (route.guard === "teacher") {
    responses["403"] = { description: "需要教师或管理员权限" }
  }
  return responses
}

/** 生成 operationId(如 `GET /api/circles/{id}` → `getApiCirclesById`) */
function toOperationId(method: string, openApiPath: string): string {
  const cleaned = openApiPath
    .replace(/\{([^}]+)\}/g, " by $1 ")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(" ")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join("")
  return method.toLowerCase() + cleaned
}

/** 路径 → 文档分组名 */
export function tagForPath(nextPath: string): string {
  const segment = nextPath.split("/").filter(Boolean)[1] ?? "system"
  return pathTagLabels[segment] ?? segment
}

function buildOperation(route: ParsedRoute, doc?: EndpointDoc): OpenApiOperation {
  const operation: OpenApiOperation = {
    tags: [doc?.tag ?? tagForPath(route.nextPath)],
    summary: doc?.summary ?? route.summary,
    description: doc?.description ?? route.description,
    operationId: toOperationId(route.method, route.openApiPath),
    responses: doc?.responses ?? defaultResponses(route),
  }

  const parameters = mergeParameters(route, doc)
  if (parameters) operation.parameters = parameters
  if (doc?.requestBody) operation.requestBody = doc.requestBody

  const security = doc?.security ?? securityForGuard(route.guard)
  if (security) operation.security = security

  return operation
}

/** 端点列表 + 手工补充 → OpenAPI paths(同路径多方法合并,方法按固定顺序输出) */
export function buildPaths(
  routes: ParsedRoute[],
  docs: EndpointDoc[] = [...operationSummaries, ...operationDocs]
): OpenApiPaths {
  // 同一端点可能在两个清单里各登记一半信息(名称 / 请求体),按 `method + path` 合并字段
  const docIndex = new Map<string, EndpointDoc>()
  for (const doc of docs) {
    const key = `${doc.method} ${toOpenApiPath(doc.path)}`
    docIndex.set(key, { ...docIndex.get(key), ...doc })
  }
  const paths: OpenApiPaths = {}

  for (const route of routes) {
    const key = `${route.method} ${route.openApiPath}`
    const item = (paths[route.openApiPath] ??= {})
    item[route.method] = buildOperation(route, docIndex.get(key))
  }

  // 稳定输出:路径升序,方法按 get/post/put/patch/delete 顺序
  const sorted: OpenApiPaths = {}
  for (const openApiPath of Object.keys(paths).sort()) {
    const item = paths[openApiPath]
    const ordered: OpenApiPaths[string] = {}
    for (const method of DOC_METHODS) {
      if (item[method]) ordered[method] = item[method]
    }
    sorted[openApiPath] = ordered
  }
  return sorted
}

/** 组装完整 OpenAPI 文档 */
export function buildDocument(params: {
  version: string
  paths: OpenApiPaths
}): OpenApiDocument {
  return {
    openapi: "3.0.3",
    info: { ...openApiInfo, version: params.version },
    servers: openApiServers,
    tags: openApiTags,
    paths: params.paths,
    components: {
      securitySchemes: openApiSecuritySchemes,
      schemas: openApiSchemas,
    },
  }
}

export type GenerateResult = {
  document: OpenApiDocument
  /** 扫描到的 route.ts 文件数 */
  fileCount: number
  /** 收录的接口数量(文件内导出方法的合计) */
  operationCount: number
  /** 收录的路径数量 */
  pathCount: number
}

/** 扫描 + 组装(生成脚本与测试共用的入口) */
export function generateDocument(params: { apiDir: string; version: string }): GenerateResult {
  const files = collectRouteFiles(params.apiDir)
  const routes = files.flatMap(file => parseRouteFile(params.apiDir, file))
  const paths = buildPaths(routes)
  return {
    document: buildDocument({ version: params.version, paths }),
    fileCount: files.length,
    operationCount: routes.length,
    pathCount: Object.keys(paths).length,
  }
}

/** 生成产物的文件头(生成脚本与校验测试共用,保证文案一致) */
export const GENERATED_HEADER = `/**
 * 本文件由 \`pnpm openapi:generate\` 自动生成,请勿手工编辑。
 *
 * 内容来源:\`app/api\` 下各 \`route.ts\` 的导出方法 + JSDoc 注释,
 * 以及 \`lib/openapi/manual.ts\` 中手工登记的端点补充信息。
 * 新增 / 修改路由后请重新执行 \`pnpm openapi:generate\`(测试会校验同步)。
 */`

/** 生成 `paths.generated.ts` 的完整源码 */
export function renderGeneratedModule(document: OpenApiDocument): string {
  return [
    GENERATED_HEADER,
    "",
    "import type { OpenApiPaths } from \"./types\"",
    "",
    `/** 生成时后端 package.json 的版本号 */`,
    `export const apiVersion = ${JSON.stringify(document.info.version)}`,
    "",
    `/** 全部接口路径(${Object.keys(document.paths).length} 个路径) */`,
    `export const openApiPaths: OpenApiPaths = ${JSON.stringify(document.paths, null, 2)}`,
    "",
  ].join("\n")
}
