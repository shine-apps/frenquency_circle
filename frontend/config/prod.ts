import type { UserConfigExport } from '@tarojs/cli';
export default {
  mini: {},
  h5: {
    // H5 产物部署在 Next.js public/h5/ 下,通过 URL /h5/ 访问。
    // publicPath 控制 webpack 打包后 index.html 中资源引用的前缀,
    // router.basename 控制 Taro 路由的基准路径,两者必须一致。
    publicPath: '/h5/',
    router: {
      basename: '/h5',
    },
  },
  // 后端 API 基址。
  // 留空串 → services/request.ts 拼出相对路径(/api/...)，
  // 由 nginx / 部署方按需把 /api 反代到 admin 后端,实现同源访问,
  // 浏览器请求为同源,无 CORS preflight。
  // 若部署到不同域(如 m.example.com),把空串换成完整 baseURL 即可。
  defineConstants: {
    API_BASE_URL: JSON.stringify(''),
  },
} satisfies UserConfigExport<'webpack5'>;
