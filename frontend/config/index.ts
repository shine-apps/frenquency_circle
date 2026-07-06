import { defineConfig, type UserConfigExport } from '@tarojs/cli';
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin';
import path from 'path';
import devConfig from './dev';
import prodConfig from './prod';

// frontend 本地安装的 react / react-dom(18.3.1)绝对路径。
// pnpm 工作区同时存在 admin(React 19),默认解析会让 @nutui/icons-react-taro
// 等包错解析到根 .pnpm 中的 react@19,导致 React 18/19 内部 API 不兼容
// (运行时 `Cannot read properties of undefined (reading 'recentlyCreatedOwnerStacks')`)。
// 这里强制把 react 系列解析到 frontend 本地的 18.3.1。
const REACT_DIR = path.resolve(__dirname, '../node_modules/react');
const REACT_DOM_DIR = path.resolve(__dirname, '../node_modules/react-dom');
// https://taro-docs.jd.com/docs/next/config#defineconfig-辅助函数
export default defineConfig<'webpack5'>(async (merge, { command, mode }) => {
  const baseConfig: UserConfigExport<'webpack5'> = {
    projectName: 'taro_template',
    date: '2025-12-10',
    designWidth: 375,
    deviceRatio: {
      640: 2.34 / 2,
      750: 1,
      375: 2,
      828: 1.81 / 2,
    },
    sourceRoot: 'src',
    outputRoot: process.env.TARO_OUTPUT_DIR || 'dist',
    plugins: ['@tarojs/plugin-html'],
    defineConstants: {},
    // 注:不再使用 sass.resource 自动注入 NutUI 变量,
    // 因为各组件 scss 已显式 @use '@/styles/variables.scss',
    // 自动注入会与本地 $color-primary 等同名变量产生 "both define" 冲突。
    copy: {
      patterns: [],
      options: {},
    },
    framework: 'react',
    compiler: {
      type: 'webpack5',
      prebundle: {
        enable: false,
      },
    },
    cache: {
      enable: false, // Webpack 持久化缓存配置，建议开启。默认配置请参考：https://docs.taro.zone/docs/config-detail#cache
    },
    mini: {
      postcss: {
        pxtransform: {
          enable: true,
          config: {
            selectorBlackList: ['nut-'],
          },
        },
        cssModules: {
          enable: true, // 开启 CSS Modules
          config: {
            namingPattern: 'module', // 仅 *.module.scss 生效
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin);
        // 强制 react 系列解析到 frontend 本地 18.3.1(见文件顶部说明)。
        chain.resolve.alias
          .set('react', REACT_DIR)
          .set('react-dom', REACT_DOM_DIR)
          .set('react/jsx-runtime', path.join(REACT_DIR, 'jsx-runtime'))
          .set('react/jsx-dev-runtime', path.join(REACT_DIR, 'jsx-dev-runtime'));
      },
    },
    h5: {
      publicPath: '/',
      staticDirectory: 'static',
      output: {
        filename: 'js/[name].[hash:8].js',
        chunkFilename: 'js/[name].[chunkhash:8].js',
      },
      miniCssExtractPluginOption: {
        ignoreOrder: true,
        filename: 'css/[name].[hash].css',
        chunkFilename: 'css/[name].[chunkhash].css',
      },
      postcss: {
        autoprefixer: {
          enable: true,
          config: {},
        },
        cssModules: {
          enable: true, // 开启 CSS Modules
          config: {
            namingPattern: 'module', // 仅 *.module.scss 生效
            generateScopedName: '[name]__[local]___[hash:base64:5]',
          },
        },
        pxtransform: {
          enable: true,
          config: {
            selectorBlackList: ['body'],
            baseFontSize: 37.5,
            unitPrecision: 5,
          },
        },
      },
      webpackChain(chain) {
        chain.resolve.plugin('tsconfig-paths').use(TsconfigPathsPlugin);
        // 强制 react 系列解析到 frontend 本地 18.3.1(见文件顶部说明)。
        chain.resolve.alias
          .set('react', REACT_DIR)
          .set('react-dom', REACT_DOM_DIR)
          .set('react/jsx-runtime', path.join(REACT_DIR, 'jsx-runtime'))
          .set('react/jsx-dev-runtime', path.join(REACT_DIR, 'jsx-dev-runtime'));
      },
    },
    rn: {
      appName: 'taroDemo',
      postcss: {
        cssModules: {
          enable: true,
        },
      },
    },
  };
  if (process.env.NODE_ENV === 'development') {
    // 本地开发构建配置(不混淆压缩)。
    // 透传 devConfig 中的 h5.devServer.proxy(仅 H5 构建生效),
    // 并按当前编译目标覆盖 API_BASE_URL:
    //   - H5: 置为空串,让请求落到 devServer 自身(同源),再由 h5.devServer.proxy
    //         转发到 admin 后端,避免浏览器 CORS preflight。
    //   - 非 H5(weapp / tt / alipay 等):保持绝对地址,小程序开发工具已勾选
    //         "不校验合法域名",可直接请求 localhost。
    //
    // 实现要点:不要用 merge() 的第三个参数覆盖 defineConstants(实测 Taro 的 merge
    // 不会按字段级合并,会导致 baseConfig/devConfig 中的 defineConstants 整体保留),
    // 而是先合并,再手动改最终的 defineConstants.API_BASE_URL。
    console.log('[config/index.ts] mode =', JSON.stringify(mode), 'TARO_ENV =', JSON.stringify(process.env.TARO_ENV), 'NODE_ENV =', JSON.stringify(process.env.NODE_ENV));
    const isH5 = process.env.TARO_ENV === 'h5';
    const merged = merge({}, baseConfig, devConfig);
    merged.defineConstants = {
      ...(merged.defineConstants || {}),
      API_BASE_URL: JSON.stringify(isH5 ? '' : 'http://localhost:3000'),
    };
    console.log('[config/index.ts] final defineConstants =', JSON.stringify(merged.defineConstants));
    return merged;
  }
  // 生产构建配置(默认开启压缩混淆等)
  return merge({}, baseConfig, prodConfig);
});
