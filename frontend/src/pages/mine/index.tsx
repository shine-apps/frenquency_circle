import React from 'react';
import { View, Text } from '@tarojs/components';
import { Avatar, Tag } from '@nutui/nutui-react-taro';
import Taro, { useDidShow } from '@tarojs/taro';
import CustomTabBar from '@/components/CustomTabBar';
import { useUserStore } from '@/store/user';
import { getMyProfile } from '@/services/auth';
import styles from './index.module.scss';

/**
 * 个人中心页。
 *
 * 布局:
 * - 用户信息卡片:头像 + 昵称 + 身份标签(TEACHER=传承人金色 / USER=爱好者普通 / ADMIN=管理员红色)
 * - 我的兴趣:跳 pages/search
 * - 我的圈子:跳 pages/my-circles(展示最近匹配的圈子缓存)
 * - 我发布的圈子:仅 TEACHER 显示,跳 pages/my-published
 * - 隐私设置:跳 pages/privacy
 * - 退出登录:Taro.showModal 确认 → logout → reLaunch 到登录页
 *
 * 进入时 useDidShow 调 getMyProfile 刷新 store,保证头像/标签/role 是最新的
 *
 * 注:不使用 NutUI Cell(避免 TS2786 / isLink 类型问题),改用 View + Text 自绘单元格
 */
const MinePage: React.FC = () => {
  const user = useUserStore((s) => s.user);
  const isLoggedIn = useUserStore((s) => s.isLoggedIn);
  const setProfile = useUserStore((s) => s.setProfile);
  const logout = useUserStore((s) => s.logout);

  // 进入时刷新用户资料(头像/标签/role 最新)
  useDidShow(() => {
    if (!useUserStore.getState().isLoggedIn) return;
    getMyProfile()
      .then((profile) => {
        setProfile(profile);
      })
      .catch(() => {
        // 静默:token 失效由 request.ts 拦截跳登录
      });
  });

  /** 跳兴趣选择页 */
  const handleTags = (): void => {
    Taro.navigateTo({ url: '/pages/search/index' });
  };

  /** 跳我的圈子页(展示最近匹配的圈子) */
  const handleMyCircles = (): void => {
    Taro.navigateTo({ url: '/pages/my-circles/index' });
  };

  /** 跳我发布的圈子页(TEACHER 专属) */
  const handleMyPublished = (): void => {
    if (user?.role !== 'TEACHER') {
      Taro.showToast({ title: '仅传承人可访问', icon: 'none' });
      return;
    }
    Taro.navigateTo({ url: '/pages/my-published/index' });
  };

  /** 跳隐私设置页 */
  const handlePrivacy = (): void => {
    Taro.navigateTo({ url: '/pages/privacy/index' });
  };

  /** 跳个人资料页(编辑头像/昵称) */
  const handleProfile = (): void => {
    Taro.navigateTo({ url: '/pages/profile/index' });
  };

  /** 跳教师认证页(USER 角色) */
  const handleTeacherCert = (): void => {
    Taro.navigateTo({ url: '/pages/teacher-certification/index' });
  };

  /** 退出登录:showModal 确认后执行 */
  const handleLogout = (): void => {
    Taro.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗?',
      confirmText: '退出',
      cancelText: '取消',
    })
      .then((res) => {
        if (res.confirm) {
          logout();
          Taro.reLaunch({ url: '/pages/login/index' });
        }
      })
      .catch(() => {
        // 用户取消,静默
      });
  };

  // 头像 fallback:已登录显示昵称首字,未登录显示"游"
  const avatarFallback = isLoggedIn && user?.name ? user.name[0] : '游';

  // 身份标签配置
  const roleConfig = (): { text: string; type: 'warning' | 'primary' | 'danger' } => {
    if (user?.role === 'TEACHER') {
      return { text: '传承人', type: 'warning' };
    }
    if (user?.role === 'ADMIN') {
      return { text: '管理员', type: 'danger' };
    }
    return { text: '爱好者', type: 'primary' };
  };
  const roleInfo = roleConfig();

  // 兴趣标签数量
  const tagsCount = user?.tags?.length ?? 0;
  const tagsText = tagsCount > 0 ? `${tagsCount} 个` : '尚未选择';

  return (
    <View className={styles.page}>
      {/* ====== 顶部用户信息卡片 ====== */}
      <View
        className={styles['profile-card']}
        onClick={handleProfile}
      >
        <Avatar
          size="large"
          shape="round"
          src={user?.avatar}
        >
          {avatarFallback}
        </Avatar>
        <View className={styles['profile-info']}>
          <View className={styles['name-row']}>
            <Text className={styles.name}>
              {isLoggedIn ? user?.name : '未登录用户'}
            </Text>
            {isLoggedIn && (
              <Tag type={roleInfo.type} className={styles['role-chip']}>
                {roleInfo.text}
              </Tag>
            )}
          </View>
          <Text className={styles.subtitle}>
            {isLoggedIn
              ? user?.phone ?? '未绑定手机号'
              : '点击登录体验更多功能'}
          </Text>
        </View>
      </View>

      {/* ====== 设置入口列表(自绘 Cell,避免 NutUI Cell 类型问题)====== */}
      <View className={styles.section}>
        <View
          className={styles['cell-item']}
          onClick={handleTags}
          hoverClass={styles['cell-hover']}
        >
          <Text className={styles['cell-title']}>我的兴趣</Text>
          <View className={styles['cell-right']}>
            <Text className={styles['cell-extra']}>{tagsText}</Text>
            <Text className={styles['cell-arrow']}>›</Text>
          </View>
        </View>

        <View
          className={styles['cell-item']}
          onClick={handleMyCircles}
          hoverClass={styles['cell-hover']}
        >
          <View className={styles['cell-main']}>
            <Text className={styles['cell-title']}>我的圈子</Text>
            <Text className={styles['cell-desc']}>最近匹配的圈子</Text>
          </View>
          <Text className={styles['cell-arrow']}>›</Text>
        </View>

        {user?.role === 'TEACHER' && (
          <View
            className={styles['cell-item']}
            onClick={handleMyPublished}
            hoverClass={styles['cell-hover']}
          >
            <View className={styles['cell-main']}>
              <Text className={styles['cell-title']}>我发布的圈子</Text>
              <Text className={styles['cell-desc']}>传承人专属</Text>
            </View>
            <Text className={styles['cell-arrow']}>›</Text>
          </View>
        )}

        {user?.role === 'USER' && (
          <View
            className={styles['cell-item']}
            onClick={handleTeacherCert}
            hoverClass={styles['cell-hover']}
          >
            <View className={styles['cell-main']}>
              <Text className={styles['cell-title']}>教师认证</Text>
              <Text className={styles['cell-desc']}>申请成为认证教师</Text>
            </View>
            <Text className={styles['cell-arrow']}>›</Text>
          </View>
        )}

        <View
          className={`${styles['cell-item']} ${styles['cell-last']}`}
          onClick={handlePrivacy}
          hoverClass={styles['cell-hover']}
        >
          <Text className={styles['cell-title']}>隐私设置</Text>
          <Text className={styles['cell-arrow']}>›</Text>
        </View>
      </View>

      {/* ====== 退出登录按钮 ====== */}
      {isLoggedIn && (
        <View className={styles['logout-wrap']}>
          <Text className={styles['logout-btn']} onClick={handleLogout}>
            退出登录
          </Text>
        </View>
      )}

      {/* 底部 TabBar */}
      <CustomTabBar />
    </View>
  );
};

export default MinePage;
