import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/**/*.{test,spec}.{ts,tsx}",
      "**/*.test.{ts,tsx}",
    ],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
    // next-auth 内部导入 next/server,但 next 16 的 package.json 无 exports 字段,
    // ESM 解析器无法找到无扩展名的子路径。inline 让 vite 处理 next-auth 的导入,
    // 从而应用下方 resolve.alias 中的 next/server → next/server.js 映射。
    server: {
      deps: {
        inline: ["next-auth"],
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // next-auth 导入 next/server,但 next 包的 exports 在 ESM 模式下不暴露 ./server
      // (建议改用 next/server.js)。此处显式映射到实际文件,避免 vitest 启动失败。
      "next/server": path.resolve(__dirname, "node_modules/next/server.js"),
    },
  },
})
