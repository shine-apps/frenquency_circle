import type { UserConfigExport } from '@tarojs/cli';
export default {
  mini: {},
  h5: {},
  // 后端 API 基址(部署时替换为真实域名)
  defineConstants: {
    API_BASE_URL: JSON.stringify('https://api.example.com'),
  },
} satisfies UserConfigExport<'webpack5'>;
