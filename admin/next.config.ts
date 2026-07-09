import type { NextConfig } from "next";

const corsOrigin = process.env.CORS_ALLOW_ORIGIN || "http://localhost:9000";

const nextConfig: NextConfig = {
  // standalone 输出:Docker 镜像仅需复制 .next/standalone/ + .next/static/ + public/,
  // 无需携带完整 node_modules,显著减小运行时镜像体积
  output: "standalone",

  // 让 drizzle-orm / postgres 不被 Next.js 打包,保留在 standalone node_modules 中
  // 这样独立的 db/migrate.mjs 迁移脚本(容器启动时由 entrypoint.sh 调用)也能 import 到
  // 否则 ERR_MODULE_NOT_FOUND: Cannot find package 'drizzle-orm'
  serverExternalPackages: ["drizzle-orm", "postgres"],

  // 允许 portal H5 跨域访问 admin API;通过 CORS_ALLOW_ORIGIN 配置生产域名
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

  // 生产环境重写根路径到 H5 index.html
  // Taro H5 使用 hash 路由(URL 形如 /#/pages/...),
  // 实际只请求一次 /,所以一个 source: '/' 的 rewrite 就够了,
  // 无需为子路径做 SPA fallback。
  // 开发环境保持原样(app/page.tsx 的鉴权重定向逻辑仍生效)
  async rewrites() {
    if (process.env.NODE_ENV !== "production") return [];
    return [
      { source: "/", destination: "/index.html" },
    ];
  },
};

export default nextConfig;
