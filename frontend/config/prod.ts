import type { UserConfigExport } from '@tarojs/cli';
export default {
  mini: {},
  h5: {},
  // 后端 API 基址。
  // 留空串 → services/request.ts 拼出相对路径(/api/...)，
  // 由 nginx / 部署方按需把 /api 反代到 admin 后端,实现同源访问,
  // 浏览器请求为同源,无 CORS preflight。
  // 若部署到不同域(如 m.example.com),把空串换成完整 baseURL 即可。
  defineConstants: {
    API_BASE_URL: JSON.stringify(''),
  },
} satisfies UserConfigExport<'webpack5'>;
