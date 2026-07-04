import React from 'react';
import { View, Text } from '@tarojs/components';
import { Cell, Avatar, Button } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import { useUserStore } from '@/store/user';
import CustomTabBar from '@/components/CustomTabBar';
import styles from './index.module.scss';

const MinePage: React.FC = () => {
  const { user, isLoggedIn, logout } = useUserStore();

  /**
   * 设置项点击处理
   * TODO: 后续接路由跳转或业务弹窗
   */
  const handleSetting = (key: string): void => {
    // eslint-disable-next-line no-console
    console.log('[Mine] click setting:', key);
  };

  /** 跳转个人资料页 */
  const handleProfile = (): void => {
    Taro.navigateTo({ url: '/pages/profile/index' });
  };

  /** 跳转登录页 */
  const handleLoginClick = (): void => {
    Taro.navigateTo({ url: '/pages/login/index' });
  };

  // 头像 fallback 显示文字:已登录显示昵称首字,未登录显示 "游"
  const avatarFallback = isLoggedIn && user?.name ? user.name[0] : '游';

  return (
    <View className={styles.page}>
      {/* 顶部个人卡片 */}
      <View className={styles['profile-card']}>
        <Avatar
          size="large"
          shape="round"
          // 优先用用户头像 URL,否则 fallback 显示首字
          src={user?.avatar}
        >
          {avatarFallback}
        </Avatar>
        <View className={styles['profile-info']}>
          <Text className={styles.name}>
            {isLoggedIn ? user?.name : '未登录用户'}
          </Text>
          <Text className={styles.subtitle}>
            {isLoggedIn
              ? user?.phone ?? '未绑定手机号'
              : '点击下方按钮登录体验'}
          </Text>
        </View>
        {!isLoggedIn && (
          <Button
            type="primary"
            size="small"
            shape="round"
            onClick={handleLoginClick}
            className={styles['login-btn']}
          >
            登录
          </Button>
        )}
      </View>

      {/* 设置入口列表 */}
      <View className={styles.section}>
        <Cell
          title="个人资料"
          isLink
          onClick={handleProfile}
        />
        <Cell
          title="账号与安全"
          isLink
          onClick={() => handleSetting('security')}
        />
        <Cell
          title="消息通知"
          isLink
          onClick={() => handleSetting('notifications')}
        />
        <Cell
          title="关于我们"
          isLink
          isLast
          onClick={() => handleSetting('about')}
        />
      </View>

      {/* 已登录态显示退出按钮 */}
      {isLoggedIn && (
        <View className={styles['logout-wrap']}>
          <Button type="default" shape="round" onClick={logout}>
            退出登录
          </Button>
        </View>
      )}

      {/* 底部 TabBar(页面内渲染,跨端一致) */}
      <CustomTabBar />
    </View>
  );
};

export default MinePage;
