import type { NextConfig } from "next";

const corsOrigin = process.env.CORS_ALLOW_ORIGIN || "http://localhost:9000";

const nextConfig: NextConfig = {
  // standalone 输出:自包含的 Next.js 运行时,产物在 .next/standalone/,
  // 部署时只需复制 standalone/ + .next/static/ + public/ 即可启动。
  output: "standalone",

  // 允许跨域访问 admin API;通过 CORS_ALLOW_ORIGIN 配置生产域名
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: corsOrigin },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PATCH,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
          { key: "Access-Control-Allow-Credentials", value: "true" },
        ],
      },
    ];
  },

  // 当 public/index.html 存在时,生产环境把根路径重写到 H5 入口。
  // 适用于把 frontend H5 产物手动放进 public/ 后同源托管的场景;
  // 没有该文件时此规则不命中,不影响其它路径。
  // 开发环境保持原样(app/page.tsx 的鉴权重定向逻辑仍生效)
  async rewrites() {
    if (process.env.NODE_ENV !== "production") return [];
    return [
      { source: "/", destination: "/index.html" },
    ];
  },
};

export default nextConfig;
