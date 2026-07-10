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
};

export default nextConfig;
