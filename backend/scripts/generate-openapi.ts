import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import {
  generateDocument,
  renderGeneratedModule,
} from "../lib/openapi/generate"

/**
 * 生成 OpenAPI 文档产物。
 *
 * 产物:`lib/openapi/paths.generated.ts` —— 运行时由 `/api/openapi` 路由与
 * `/admin/api-docs` 页面读取,所以必须提交到仓库并与路由保持同步。
 *
 * 用法(在 `backend/` 目录下执行):
 * - `pnpm openapi:generate` 重新生成;
 * - `pnpm openapi:check`    仅校验产物与当前路由是否一致(不一致退出码 1,供测试 / CI 使用)。
 */
const projectRoot = path.resolve(process.cwd())
const apiDir = path.join(projectRoot, "app", "api")
const target = path.join(projectRoot, "lib", "openapi", "paths.generated.ts")

const pkg = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8")) as {
  version: string
}

const result = generateDocument({ apiDir, version: pkg.version })
const content = renderGeneratedModule(result.document)
const stats = `${result.fileCount} 个路由文件 / ${result.pathCount} 个路径 / ${result.operationCount} 个接口`

if (process.argv.includes("--check")) {
  const existing = readFileSync(target, "utf8")
  if (existing !== content) {
    console.error(
      `[openapi] ${path.relative(projectRoot, target)} 与当前路由不同步,请执行 pnpm openapi:generate`
    )
    process.exit(1)
  }
  console.log(`[openapi] 文档产物已同步(${stats})`)
} else {
  writeFileSync(target, content, "utf8")
  console.log(`[openapi] 已生成 ${path.relative(projectRoot, target)}(${stats})`)
}
