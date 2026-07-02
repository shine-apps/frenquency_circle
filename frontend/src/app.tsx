import React, { useEffect } from 'react';
import { useDidShow, useDidHide } from '@tarojs/taro';
// NutUI 全局主题样式（命令式组件 Toast/Dialog 等的兜底样式）
import '@nutui/nutui-react-taro/dist/styles/themes/default.css';
// 全局样式
import './app.scss';

function App(props) {
  // 可以使用所有的 React Hooks
  useEffect(() => {});

  // 对应 onShow
  useDidShow(() => {});

  // 对应 onHide
  useDidHide(() => {});

  return props.children;
}

export default App;
