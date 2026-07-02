import React from 'react';
import { View, Text } from '@tarojs/components';
import { useRouter, reLaunch } from '@tarojs/taro';
import { HomeIcon, ProfileIcon } from '../Icons';
import styles from './index.module.scss';

export interface TabItem {
  /** 唯一标识 */
  key: string;
  /** Taro 页面路径(不带前导 /),如 'pages/index/index' */
  pagePath: string;
  /** 显示文字 */
  text: string;
  /** 未选中图标 */
  icon: React.ReactNode;
  /** 选中图标 */
  activeIcon: React.ReactNode;
}

interface Props {
  /**
   * 可选,显式指定当前活动 tab 的 key
   * 不传时自动通过 useRouter 检测当前路径
   */
  activeKey?: string;
}

/**
 * 底部 Tab 配置(可后续按需扩展)
 * 注:tab 顺序即视觉顺序,从左到右
 */
const TABS: TabItem[] = [
  {
    key: 'home',
    pagePath: 'pages/index/index',
    text: '首页',
    icon: <HomeIcon active={false} />,
    activeIcon: <HomeIcon active />,
  },
  {
    key: 'mine',
    pagePath: 'pages/mine/index',
    text: '我的',
    icon: <ProfileIcon active={false} />,
    activeIcon: <ProfileIcon active />,
  },
];

/**
 * 自定义底部 TabBar
 * 跨 weapp / h5 / tt 三端一致:每个 tab 页面在底部渲染此组件
 * 切 tab 使用 reLaunch 重置页面栈,避免 navigateTo 累积栈深度
 */
const CustomTabBar: React.FC<Props> = ({ activeKey }) => {
  const router = useRouter();
  // 兜底:useRouter 在某些场景(如 SSR 降级)可能没有 path
  const currentPath = activeKey ?? router?.path ?? '';
  const currentKey =
    TABS.find((t) => t.pagePath === currentPath)?.key ?? TABS[0].key;

  const handleClick = (tab: TabItem): void => {
    if (tab.pagePath === currentPath) return;
    // reLaunch 重置栈:tab 切换不应该累积历史
    reLaunch({ url: `/${tab.pagePath}` });
  };

  return (
    <View className={styles.tabbar}>
      {TABS.map((tab) => {
        const isActive = tab.key === currentKey;
        return (
          <View
            key={tab.key}
            className={`${styles.item} ${isActive ? styles.active : ''}`}
            hoverClass={styles['item-hover']}
            onClick={() => handleClick(tab)}
          >
            <View className={styles.icon}>
              {isActive ? tab.activeIcon : tab.icon}
            </View>
            <Text className={styles.text}>{tab.text}</Text>
          </View>
        );
      })}
    </View>
  );
};

export default CustomTabBar;
