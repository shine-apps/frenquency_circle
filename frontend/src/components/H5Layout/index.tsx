import React from 'react';
import { View } from '@tarojs/components';
import H5NavBar from '../H5NavBar';
import styles from './index.module.scss';

/** 仅 H5 端启用外壳;weapp / tt 直接 passthrough children,不影响原生 navbar / tabbar */
const IS_H5 = process.env.TARO_ENV === 'h5';

interface Props {
  children: React.ReactNode;
}

/**
 * H5 端页面外壳。
 * - 仅 H5 渲染:在 src/app.tsx 中调用,统一给所有页面提供顶部 H5NavBar
 * - 非 H5 端:直接返回 children,等价于无包装
 *
 * 宽度限制(750px)由 src/app.scss 的 body 选择器承担,本组件只负责:
 *   1. 渲染顶部 H5NavBar
 *   2. 用一个 flex 列容器把内容放在导航栏下方
 */
const H5Layout: React.FC<Props> = ({ children }) => {
  if (!IS_H5) return <>{children}</>;

  return (
    <View className={styles.layout}>
      <H5NavBar />
      <View className={styles.body}>{children}</View>
    </View>
  );
};

export default H5Layout;
