import { defineUniPages } from '@uni-helper/vite-plugin-uni-pages'
import { tabBar } from './src/tabbar/config'

export default defineUniPages({
  globalStyle: {
    // 小程序端使用原生导航栏（default），H5 端由页面自行实现导航栏（custom）
    navigationStyle: process.env.UNI_PLATFORM === 'h5' ? 'custom' : 'default',
    navigationBarTitleText: '趣邻圈',
    navigationBarBackgroundColor: '#018d71',
    navigationBarTextStyle: 'white',
    backgroundColor: '#FFFFFF',
  },
  easycom: {
    autoscan: true,
    custom: {
      '^fg-(.*)': '@/components/fg-$1/fg-$1.vue',
      '^(?!z-paging-refresh|z-paging-load-more)z-paging(.*)':
        'z-paging/components/z-paging$1/z-paging$1.vue',
      '^wd-(.*)': '@wot-ui/ui/components/wd-$1/wd-$1.vue',
    },
  },
  // tabbar 的配置统一在 “./src/tabbar/config.ts” 文件中
  tabBar: tabBar as any,
})
