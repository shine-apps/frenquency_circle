import type { NextConfig } from "next";

const corsOrigin = process.env.CORS_ALLOW_ORIGIN || "http://localhost:9000";

const nextConfig: NextConfig = {
  // standalone 输出:Docker 镜像仅需复制 .next/standalone/ + .next/static/ + public/,
  // 无需携带完整 node_modules,显著减小运行时镜像体积
  output: "standalone",

  // 注意:不再使用 serverExternalPackages 把 drizzle-orm / postgres 保持为外部依赖。
  // 原因:在 pnpm 隔离 node-linker 下,serverExternalPackages 会让 NFT 追踪
  //   .pnpm/drizzle-orm@0.45.2_postgres@3.4.9/node_modules/postgres 等符号链接,
  //   复制到 standalone 时会因链接目标解析失败 (ENOENT) 而中断 standalone 生成,
  //   导致 .next/standalone/ 下缺失 server.js。
  // 现在让 Next.js 直接把 drizzle-orm / postgres 打包进 server chunks(纯 JS,可安全打包)。
  // 独立的 db/migrate.mjs 迁移脚本由 Dockerfile 的 cp -rL 显式复制这两个包到
  // standalone/node_modules 中,不依赖 Next.js 的外部包追踪。

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
