import type { UserConfigExport } from '@tarojs/cli';
export default {
  mini: {},
  h5: {},
  // 后端 API 基址。
  // 留空串 → services/request.ts 拼出相对路径(/api/...)，
  // 配合「admin + H5 同源部署」(admin/next.config.ts 在生产环境把 / 重写到 H5),
  // 浏览器请求为同源,无 CORS preflight。
  // 若以后拆分为独立域名(如 m.example.com),把空串换成完整 baseURL 即可。
  defineConstants: {
    API_BASE_URL: JSON.stringify(''),
  },
} satisfies UserConfigExport<'webpack5'>;
