import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { Avatar, Tag } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import { useMatchStore } from '@/store/match';
import { useLocationStore } from '@/store/location';
import { useUserStore } from '@/store/user';
import { matchPeople, matchCircles } from '@/services/locations';
import styles from './index.module.scss';

/** 列表 Tab 类型 */
type ListTab = 'people' | 'circles';

/** 范围筛选选项(全部用 30km 作为实际上限) */
const RANGE_FILTERS: Array<{ label: string; value: number }> = [
  { label: '全部', value: 30 },
  { label: '≤1km', value: 1 },
  { label: '≤5km', value: 5 },
  { label: '≤10km', value: 10 },
];

/** 标签展示最大数量 */
const MAX_TAG_VISIBLE = 3;

/**
 * 距离格式化:< 1km 展示米,否则展示公里。
 */
function formatDistance(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)}m`;
  return `${km.toFixed(1)}km`;
}

/** 活跃度中文映射 */
function activityLevelText(level: ActivityLevel): string {
  if (level === 'low') return '活跃度:低';
  if (level === 'medium') return '活跃度:中';
  return '活跃度:高';
}

/** 练习时长格式化 */
function practiceYearsText(years: number | null): string {
  if (years === null || years === undefined) return '';
  return `${years}年`;
}

/** 活动时间格式化(简化:YYYY-MM-DD HH:mm) */
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

/** 距离圆点(用于分隔信息) */
function Dot(): React.ReactElement {
  return <Text className={styles.dot}>·</Text>;
}

/**
 * 匹配结果页。
 *
 * 进入时从 match store / location store / user store 取定位与兴趣,
 * 并发拉取同频的人与圈子,支持顶部双 Tab 切换、范围筛选、下拉刷新。
 *
 * 简化:
 * - 上拉加载更多留 TODO(后端分页已就绪,前端 MVP 首版只实现下拉刷新)
 * - 人列表项点击:spec 设计 MatchPersonDTO 无联系方式字段,
 *   简化为 Toast 提示,不弹 ContactSheet
 */
const MatchPage: React.FC = () => {
  const matchStore = useMatchStore();
  const locationStore = useLocationStore();
  const user = useUserStore((s) => s.user);
  const setMatchResult = useMatchStore((s) => s.setMatchResult);

  const [activeTab, setActiveTab] = useState<ListTab>('people');
  const [rangeKm, setRangeKm] = useState<number>(matchStore.rangeKm || 5);
  const [loading, setLoading] = useState(false);
  // 本地列表(进入时拉取,与 store 同步)
  const [people, setPeople] = useState<MatchPersonDTO[]>(matchStore.people);
  const [circles, setCircles] = useState<MatchCircleDTO[]>(matchStore.circles);

  /** 解析当前可用定位 */
  const resolveLocation = (): LocationPoint | null => {
    if (matchStore.location) return matchStore.location;
    if (locationStore.latitude !== null && locationStore.longitude !== null) {
      return {
        latitude: locationStore.latitude,
        longitude: locationStore.longitude,
      };
    }
    if (user?.location) return user.location;
    return null;
  };

  /** 解析当前可用标签 ID */
  const resolveTagIds = (): string[] => {
    if (matchStore.tagIds.length > 0) return matchStore.tagIds;
    if (user?.tags && user.tags.length > 0) return user.tags.map((t) => t.id);
    return [];
  };

  /** 并发拉取人与圈子 */
  const fetchMatch = useCallback(
    async (loc: LocationPoint, tags: string[], range: number) => {
      setLoading(true);
      try {
        const [peopleRes, circlesRes] = await Promise.all([
          matchPeople({
            latitude: loc.latitude,
            longitude: loc.longitude,
            tagIds: tags,
            rangeKm: range,
            page: 1,
            pageSize: 20,
          }),
          matchCircles({
            latitude: loc.latitude,
            longitude: loc.longitude,
            tagIds: tags,
            rangeKm: range,
            page: 1,
            pageSize: 20,
          }),
        ]);
        setPeople(peopleRes.list || []);
        setCircles(circlesRes.list || []);
        // 同步到 store
        setMatchResult({
          people: peopleRes.list || [],
          circles: circlesRes.list || [],
          rangeKm: range,
          location: loc,
          tagIds: tags,
          totalPeople: peopleRes.total,
          totalCircles: circlesRes.total,
        });
      } catch (e) {
        Taro.showToast({
          title: (e as Error).message || '匹配失败',
          icon: 'none',
        });
      } finally {
        setLoading(false);
      }
    },
    [setMatchResult]
  );

  // ====== 进入时拉取 ======
  useEffect(() => {
    const loc = resolveLocation();
    const tags = resolveTagIds();
    if (!loc) {
      Taro.showToast({ title: '请先发布定位', icon: 'none' });
      setTimeout(() => Taro.navigateBack(), 800);
      return;
    }
    if (tags.length === 0) {
      Taro.showToast({ title: '请先选择兴趣', icon: 'none' });
      setTimeout(() => Taro.navigateBack(), 800);
      return;
    }
    fetchMatch(loc, tags, rangeKm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 切换范围筛选 → 重新拉取 */
  const handleRangeChange = (range: number): void => {
    if (range === rangeKm) return;
    setRangeKm(range);
    const loc = resolveLocation();
    const tags = resolveTagIds();
    if (loc && tags.length > 0) {
      fetchMatch(loc, tags, range);
    }
  };

  /** 下拉刷新:重新拉取当前范围 */
  Taro.usePullDownRefresh(() => {
    const loc = resolveLocation();
    const tags = resolveTagIds();
    if (loc && tags.length > 0) {
      fetchMatch(loc, tags, rangeKm).finally(() => {
        Taro.stopPullDownRefresh();
      });
    } else {
      Taro.stopPullDownRefresh();
    }
  });

  // ====== 人列表项点击:简化为 Toast ======
  const handlePersonClick = (): void => {
    Taro.showToast({
      title: '同频的人暂不支持直接联系,请通过圈子互动',
      icon: 'none',
      duration: 2000,
    });
  };

  // ====== 圈子列表项点击:跳详情页(Phase 7 实现) ======
  const handleCircleClick = (circleId: string): void => {
    Taro.navigateTo({ url: `/pages/circle/index?id=${circleId}` });
  };

  // 渲染标签(最多 3 个 + "+N")
  const renderTags = (tags: TagDTO[]): React.ReactElement => {
    const visible = tags.slice(0, MAX_TAG_VISIBLE);
    const rest = tags.length - visible.length;
    return (
      <View className={styles.tagRow}>
        {visible.map((t) => (
          <Tag key={t.id} type="primary" plain className={styles.tagItem}>
            {t.name}
          </Tag>
        ))}
        {rest > 0 && <Text className={styles.tagMore}>+{rest}</Text>}
      </View>
    );
  };

  return (
    <View className={styles.page}>
      {/* ====== 顶部双 Tab ====== */}
      <View className={styles.tabBar}>
        <View
          className={`${styles.tabItem} ${activeTab === 'people' ? styles.tabItemActive : ''}`}
          onClick={() => setActiveTab('people')}
        >
          <Text
            className={
              activeTab === 'people' ? styles.tabTextActive : styles.tabText
            }
          >
            同频的人
          </Text>
        </View>
        <View
          className={`${styles.tabItem} ${activeTab === 'circles' ? styles.tabItemActive : ''}`}
          onClick={() => setActiveTab('circles')}
        >
          <Text
            className={
              activeTab === 'circles' ? styles.tabTextActive : styles.tabText
            }
          >
            同频的圈子
          </Text>
        </View>
      </View>

      {/* ====== 范围筛选 ====== */}
      <ScrollView scrollX className={styles.rangeBar}>
        <View className={styles.rangeInner}>
          {RANGE_FILTERS.map((opt) => {
            const active = rangeKm === opt.value;
            return (
              <View
                key={opt.value}
                className={`${styles.rangeChip} ${active ? styles.rangeChipActive : ''}`}
                onClick={() => handleRangeChange(opt.value)}
              >
                <Text
                  className={
                    active ? styles.rangeChipTextActive : styles.rangeChipText
                  }
                >
                  {opt.label}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* ====== 列表区 ====== */}
      {loading && people.length === 0 && circles.length === 0 ? (
        <View className={styles.empty}>
          <Text className={styles.emptyText}>匹配中...</Text>
        </View>
      ) : activeTab === 'people' ? (
        people.length === 0 ? (
          <View className={styles.empty}>
            <Text className={styles.emptyText}>
              附近暂无同频的人,试试扩大范围
            </Text>
          </View>
        ) : (
          <View className={styles.list}>
            {people.map((p) => (
              <View
                key={p.userId}
                className={styles.card}
                onClick={handlePersonClick}
              >
                <View className={styles.cardHead}>
                  <Avatar
                    size="normal"
                    shape="round"
                    src={p.avatarUrl || undefined}
                  >
                    {p.name ? p.name[0] : '?'}
                  </Avatar>
                  <View className={styles.cardMain}>
                    <View className={styles.nameRow}>
                      <Text className={styles.name}>{p.name}</Text>
                      <Text className={styles.distance}>
                        {formatDistance(p.distanceKm)}
                      </Text>
                    </View>
                    <View className={styles.metaRow}>
                      <Text className={styles.meta}>
                        {activityLevelText(p.activityLevel)}
                      </Text>
                      {p.practiceYears !== null &&
                        p.practiceYears !== undefined && (
                          <>
                            <Dot />
                            <Text className={styles.meta}>
                              {practiceYearsText(p.practiceYears)}
                            </Text>
                          </>
                        )}
                    </View>
                  </View>
                </View>
                {p.tags.length > 0 && renderTags(p.tags)}
              </View>
            ))}
          </View>
        )
      ) : circles.length === 0 ? (
        <View className={styles.empty}>
          <Text className={styles.emptyText}>
            附近暂无同频的圈子,试试扩大范围
          </Text>
        </View>
      ) : (
        <View className={styles.list}>
          {circles.map((c) => (
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
                    <Dot />
                    <Text className={styles.meta}>
                      {c.memberCount}/{c.maxMembers ?? '∞'}人
                    </Text>
                  </View>
                  {c.address && (
                    <Text className={styles.address}>{c.address}</Text>
                  )}
                </View>
              </View>
              {c.tags.length > 0 && renderTags(c.tags)}
            </View>
          ))}
        </View>
      )}

      {/* TODO: 上拉加载更多(后端分页已就绪,前端 MVP 首版只实现下拉刷新) */}
    </View>
  );
};

export default MatchPage;
