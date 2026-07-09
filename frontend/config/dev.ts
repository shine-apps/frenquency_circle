import type { UserConfigExport } from '@tarojs/cli';

export default {
  logger: {
    quiet: false,
    stats: true,
  },
  mini: {},
  h5: {
    devServer: {
      open: false, //禁止自动打开浏览器
      // H5 端所有 /api/** 请求由 webpack-dev-server 代理到 admin 后端,
      // 避免浏览器 CORS preflight。此块仅在 H5 构建时生效,小程序端忽略。
      // 后端默认地址固定为 http://localhost:3000,如有变动直接改 target。
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
          // 后端路由已经以 /api 开头,无需重写路径
        },
      },
    },
  },
  // 后端 API 基址。此处仅为非 H5 平台(weapp / tt / alipay 等)的兜底值,
  // H5 端的 defineConstants.API_BASE_URL 会在 config/index.ts 中根据 mode 覆盖为空串,
  // 以配合 h5.devServer.proxy 走相对路径代理。prod 模式在 config/prod.ts 中配置。
  defineConstants: {
    API_BASE_URL: JSON.stringify('http://localhost:3000'),
  },
} satisfies UserConfigExport<'webpack5'>;
