import type { NextConfig } from "next";

const corsOrigin = process.env.CORS_ALLOW_ORIGIN || "http://localhost:9000";

const nextConfig: NextConfig = {
  // 允许 portal H5 跨域访问 admin API；通过 CORS_ALLOW_ORIGIN 配置生产域名
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
