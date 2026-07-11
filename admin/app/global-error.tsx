"use client"

// 全局错误兜底页:必须挂在 app/ 根目录(不能放进 (auth) 或 admin 子组),
// 用来接住根布局自身抛错的极端场景。Next.js 16 + Turbopack 在某些情况下
// 无法解析内置 global-error.js 的 Client Manifest 引用,显式提供本文件即可
// 覆盖该内置引用,从而消除运行时 "Could not find the module ... global-error.js"
// 错误。注意:此组件会替换根 <html>/<body>,因此必须自带 html/body 标签,
// 不能再依赖 app/layout.tsx 的字体 / 全局样式。
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="zh-CN">
      <body
        style={{
          minHeight: "100vh",
          margin: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        <main
          style={{
            maxWidth: 480,
            padding: "32px 24px",
            textAlign: "center",
            background: "#ffffff",
            border: "1px solid #e2e8f0",
            borderRadius: 12,
            boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
          }}
        >
          <h1 style={{ fontSize: 20, fontWeight: 600, margin: 0 }}>
            系统出现异常
          </h1>
          <p
            style={{
              marginTop: 12,
              marginBottom: 24,
              fontSize: 14,
              lineHeight: 1.6,
              color: "#475569",
            }}
          >
            页面渲染时发生了未预期的错误,请稍后重试或联系管理员。
          </p>
          {error.digest ? (
            <p
              style={{
                marginBottom: 24,
                fontSize: 12,
                color: "#94a3b8",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              }}
            >
              错误编号: {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "8px 16px",
              fontSize: 14,
              fontWeight: 500,
              color: "#ffffff",
              background: "#0f172a",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            重试
          </button>
        </main>
      </body>
    </html>
  )
}
