import React from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { Tag, Button } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import { useMatchStore } from '@/store/match';
import styles from './index.module.scss';

/** 距离格式化 */
function formatDistance(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)}m`;
  return `${km.toFixed(1)}km`;
}

/** 活动时间格式化(简化) */
function formatDateTime(iso: string | null): string {
  if (!iso) return '时间待定';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '时间待定';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '时间待定';
  }
}

/** 标签展示最大数量 */
const MAX_TAG_VISIBLE = 3;

/**
 * 我的圈子页。
 *
 * 简化说明:
 * - 后端 MVP 无"我加入的圈子"接口,只有"我创建的"(getMyCircles,在 my-published 页用)
 * - 这里采用 spec 允许的方案:展示 useMatchStore.circles 缓存(最近匹配到的圈子)
 *   比纯空状态更实用;若缓存为空,展示空状态 + 跳首页按钮
 */
const MyCirclesPage: React.FC = () => {
  const circles = useMatchStore((s) => s.circles);

  /** 跳圈子详情 */
  const handleCircleClick = (circleId: string): void => {
    Taro.navigateTo({ url: `/pages/circle/index?id=${circleId}` });
  };

  /** 跳首页发现 */
  const handleGoHome = (): void => {
    Taro.reLaunch({ url: '/pages/index/index' });
  };

  /** 跳发布定位页(主动匹配) */
  const handlePublish = (): void => {
    Taro.navigateTo({ url: '/pages/publish/index' });
  };

  return (
    <View className={styles.page}>
      <View className={styles.header}>
        <Text className={styles.headerTitle}>最近匹配的圈子</Text>
        <Text className={styles.headerHint}>
          基于最近一次发布定位的匹配结果
        </Text>
      </View>

      {circles.length === 0 ? (
        <View className={styles.empty}>
          <Text className={styles.emptyText}>
            暂未匹配到任何圈子,去首页发现同频圈子吧
          </Text>
          <View className={styles.emptyActions}>
            <Button
              type="primary"
              shape="round"
              size="small"
              onClick={handleGoHome}
              className={styles.actionBtn}
            >
              去首页发现
            </Button>
            <Button
              type="default"
              shape="round"
              size="small"
              onClick={handlePublish}
              className={styles.actionBtn}
            >
              发布定位匹配
            </Button>
          </View>
        </View>
      ) : (
        <ScrollView scrollY className={styles.list}>
          {circles.map((c) => {
            const visibleTags = c.tags.slice(0, MAX_TAG_VISIBLE);
            const restTags = c.tags.length - visibleTags.length;
            return (
              <View
                key={c.circleId}
                className={styles.card}
                onClick={() => handleCircleClick(c.circleId)}
              >
                <View className={styles.cardHead}>
                  <View className={styles.circleIcon}>圈</View>
                  <View className={styles.cardMain}>
                    <View className={styles.nameRow}>
                      <Text className={styles.name}>{c.title}</Text>
                      <Text className={styles.distance}>
                        {formatDistance(c.distanceKm)}
                      </Text>
                    </View>
                    <View className={styles.metaRow}>
                      <Text className={styles.meta}>
                        {formatDateTime(c.activityTime)}
                      </Text>
                      <Text className={styles.dot}>·</Text>
                      <Text className={styles.meta}>
                        {c.memberCount}/{c.maxMembers ?? '∞'}人
                      </Text>
                    </View>
                    {c.address && (
                      <Text className={styles.address}>{c.address}</Text>
                    )}
                  </View>
                </View>
                {visibleTags.length > 0 && (
                  <View className={styles.tagRow}>
                    {visibleTags.map((t) => (
                      <Tag key={t.id} type="primary" plain className={styles.tagItem}>
                        {t.name}
                      </Tag>
                    ))}
                    {restTags > 0 && (
                      <Text className={styles.tagMore}>+{restTags}</Text>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

export default MyCirclesPage;
