// babel-preset-taro 更多选项和默认值：
// https://github.com/NervJS/taro/blob/next/packages/babel-preset-taro/README.md
module.exports = {
  presets: [
    [
      'taro',
      {
        framework: 'react',
        ts: 'true',
        compiler: 'webpack5',
      },
    ],
  ],
  plugins: [
    [
      'import',
      {
        libraryName: '@nutui/nutui-react-taro',
        libraryDirectory: 'dist/es/packages',
        style: 'css',
        // 默认 camel2DashComponentName: true,把 Button 转为 button,
        // 与 NutUI 3.x 的 dist/es/packages/<lowercase>/ 目录结构匹配
      },
      '@nutui/nutui-react-taro',
    ],
  ],
};
