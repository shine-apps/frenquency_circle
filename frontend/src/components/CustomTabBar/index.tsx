import React from 'react';
import { View, Text } from '@tarojs/components';
import { useRouter, reLaunch, showActionSheet, navigateTo } from '@tarojs/taro';
import { HomeIcon, ProfileIcon, PublishIcon } from '../Icons';
import { useUserStore } from '@/store/user';
import styles from './index.module.scss';

export interface TabItem {
  /** 唯一标识 */
  key: string;
  /** Taro 页面路径(不带前导 /),如 'pages/index/index';中间凸起按钮为空字符串 */
  pagePath: string;
  /** 显示文字 */
  text: string;
  /** 未选中图标 */
  icon: React.ReactNode;
  /** 选中图标 */
  activeIcon: React.ReactNode;
  /** 是否为中间凸起按钮(行为不同:不跳转,触发 ActionSheet) */
  isCenter?: boolean;
}

interface Props {
  /**
   * 可选,显式指定当前活动 tab 的 key
   * 不传时自动通过 useRouter 检测当前路径
   */
  activeKey?: string;
}

/**
 * 底部 Tab 配置:3 项(首页 / 发布 / 我的),"发布"为中间凸起按钮。
 * - 左右两项点击 reLaunch 跳转对应页面
 * - 中间"发布"点击不跳转:
 *   - role === 'TEACHER':showActionSheet 选择发布定位 / 创建圈子
 *   - 其他角色:直接跳 pages/publish/index(发布定位)
 *   - 用户取消 ActionSheet 静默忽略
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
    key: 'publish',
    pagePath: '',
    text: '发布',
    icon: <PublishIcon active={false} />,
    activeIcon: <PublishIcon active />,
    isCenter: true,
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
 * 自定义底部 TabBar。
 * 跨 weapp / h5 / tt 三端一致:每个 tab 页面在底部渲染此组件。
 * 切 tab 使用 reLaunch 重置页面栈,避免 navigateTo 累积栈深度。
 * 中间"发布"为凸起按钮,视觉上比左右两个高出一截。
 */
const CustomTabBar: React.FC<Props> = ({ activeKey }) => {
  const router = useRouter();
  // 规范化路径:去除前导 / 后再比较。
  const normalize = (p: string): string => p.replace(/^\/+/, '');
  const currentPath = normalize(activeKey ?? router?.path ?? '');
  const currentKey =
    TABS.find((t) => normalize(t.pagePath) === currentPath)?.key ?? TABS[0].key;

  /** 点击"发布"中间按钮 */
  const handlePublishClick = (): void => {
    const role = useUserStore.getState().user?.role;
    if (role === 'TEACHER') {
      showActionSheet({ itemList: ['发布定位', '创建圈子'] })
        .then((res) => {
          if (res.tapIndex === 0) {
            navigateTo({ url: '/pages/publish/index' });
          } else if (res.tapIndex === 1) {
            navigateTo({ url: '/pages/create-circle/index' });
          }
        })
        .catch(() => {
          // 用户取消 actionSheet,静默忽略
        });
    } else {
      // USER / 其他角色:直接跳发布定位页
      navigateTo({ url: '/pages/publish/index' });
    }
  };

  const handleClick = (tab: TabItem): void => {
    // 中间凸起按钮:特殊处理
    if (tab.isCenter) {
      handlePublishClick();
      return;
    }
    if (normalize(tab.pagePath) === currentPath) return;
    // reLaunch 重置栈:tab 切换不应该累积历史
    reLaunch({ url: `/${tab.pagePath}` });
  };

  return (
    <View className={styles.tabbar}>
      {TABS.map((tab) => {
        const isActive = tab.key === currentKey;
        const centerClass = tab.isCenter ? styles.center : '';
        return (
          <View
            key={tab.key}
            className={`${styles.item} ${centerClass}`}
            hoverClass={styles['item-hover']}
            onClick={() => handleClick(tab)}
          >
            <View
              className={`${styles.icon} ${tab.isCenter ? styles.centerIcon : ''}`}
            >
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
