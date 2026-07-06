import React from 'react';
import { View, Text } from '@tarojs/components';
import Taro, { useRouter } from '@tarojs/taro';
import styles from './index.module.scss';

/** 仅 H5 端渲染;weapp / tt 编译时该组件直接返回 null,无副作用 */
const IS_H5 = process.env.TARO_ENV === 'h5';

/**
 * 路径 -> 标题 映射表。
 * 与 src/pages/<name>/index.config.ts 中的 navigationBarTitleText 保持完全一致,
 * 避免两处文案漂移。
 */
const TITLE_MAP: Record<string, string> = {
  'pages/login/index': '登录',
  'pages/index/index': '首页',
  'pages/mine/index': '我的',
  'pages/profile/index': '个人资料',
  'pages/search/index': '选择兴趣',
  'pages/publish/index': '发布定位',
  'pages/match/index': '同频匹配',
  'pages/circle/index': '圈子详情',
  'pages/create-circle/index': '创建圈子',
  'pages/my-circles/index': '我的圈子',
  'pages/my-published/index': '我发布的圈子',
  'pages/privacy/index': '隐私设置',
};

/**
 * Tab 页路径集合(不显示返回箭头)。
 * 与 src/components/CustomTabBar/index.tsx 的 TABS 数组保持同一集合。
 */
const TAB_PATHS = new Set<string>(['pages/index/index', 'pages/mine/index']);

interface Props {
  /** 可选,显式覆盖标题;不传则按路径自动解析 */
  title?: string;
}

/**
 * H5 端顶部导航栏。
 * - 布局:左侧 80rpx(返回箭头位) | 中间自适应(标题) | 右侧 80rpx(占位)
 * - 高度:88rpx + env(safe-area-inset-top)(iOS Safari 顶部刘海避让)
 * - position: sticky,top: 0:滚动时吸顶,留在 750px 居中容器内
 * - z-index: 99(< CustomTabBar 的 100,避免遮挡底部 TabBar 浮层)
 */
const H5NavBar: React.FC<Props> = ({ title }) => {
  if (!IS_H5) return null;

  const router = useRouter();
  // 规范化路径:去除前导 / 后再查表(useRouter().path 在 H5 端可能带 / )
  const rawPath = (router?.path ?? '').replace(/^\/+/, '');
  const resolvedTitle = title ?? TITLE_MAP[rawPath] ?? '';

  // Tab 页(首页 / 我的)不显示返回箭头;其他页面显示
  const showBack = !TAB_PATHS.has(rawPath);

  /**
   * 返回:优先 navigateBack(delta=1),无历史栈时 reLaunch 到首页。
   * 与 src/pages/circle/index.tsx 的 handleBack 行为保持一致。
   */
  const handleBack = (): void => {
    Taro.navigateBack({ delta: 1 }).catch(() => {
      Taro.reLaunch({ url: '/pages/index/index' });
    });
  };

  return (
    <View className={styles.navbar}>
      <View className={styles.left}>
        {showBack && (
          <View
            className={styles.backBtn}
            hoverClass={styles.backBtnHover}
            onClick={handleBack}
          >
            <Text className={styles.backIcon}>‹</Text>
          </View>
        )}
      </View>
      <View className={styles.center}>
        <Text className={styles.title}>{resolvedTitle}</Text>
      </View>
      {/* 右侧占位,与左侧等宽,保证标题视觉居中 */}
      <View className={styles.right} />
    </View>
  );
};

export default H5NavBar;
