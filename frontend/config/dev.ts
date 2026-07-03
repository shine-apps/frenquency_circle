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
    },
  },
  // 后端 API 基址(admin Next.js),供 defineConstants 注入到运行时
  defineConstants: {
    API_BASE_URL: JSON.stringify('http://localhost:3000'),
  },
} satisfies UserConfigExport<'webpack5'>;
