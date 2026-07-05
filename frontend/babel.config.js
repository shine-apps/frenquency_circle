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
        // NutUI 3.x 的目录命名约定为全小写(textarea / inputnumber / cellgroup),
        // 默认 camel2DashComponentName: true 会把 TextArea 转成 text-area(连字符),
        // 导致 webpack 解析 dist/es/packages/text-area 失败。
        // customName 返回完整模块路径,style: 'css' 会自动追加 /style/css。
        camel2DashComponentName: false,
        customName: (name) =>
          `@nutui/nutui-react-taro/dist/es/packages/${name.toLowerCase()}`,
        style: 'css',
      },
      '@nutui/nutui-react-taro',
    ],
  ],
};
