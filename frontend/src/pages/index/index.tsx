import React, { useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { Avatar, Tag, Button } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import CustomTabBar from '@/components/CustomTabBar';
import H5LocationPicker from '@/components/H5LocationPicker';
import { useUserStore } from '@/store/user';
import { useMatchStore } from '@/store/match';
import { matchPeople, matchCircles } from '@/services/locations';
import { getCurrentLocation } from '@/utils/location';
import styles from './index.module.scss';

/** 范围 Tab 选项 */
const RANGE_OPTIONS: Array<{ label: string; value: number }> = [
  { label: '1km', value: 1 },
  { label: '5km', value: 5 },
  { label: '10km', value: 10 },
  { label: '30km', value: 30 },
];

/** 标签展示最大数量 */
const MAX_TAG_VISIBLE = 3;

/** 距离格式化 */
function formatDistance(km: number): string {
  if (km < 1) return `${(km * 1000).toFixed(0)}m`;
  return `${km.toFixed(1)}km`;
}

/** 活动时间格式化 */
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

/** 混排列表项(人/圈子统一结构) */
interface MixedItem {
  kind: 'person' | 'circle';
  distanceKm: number;
  // 人
  person?: MatchPersonDTO;
  // 圈子
  circle?: MatchCircleDTO;
}

/**
 * 首页。
 *
 * 布局:顶部搜索栏 + 发布按钮 / 当前定位卡片 / 范围 Tab / 推荐列表(人+圈子混排按距离升序)/ 底部 TabBar。
 *
 * - useDidShow 时尝试 getLocation;失败展示引导卡片("去授权"调 openSetting)
 * - 调 matchPeople + matchCircles,合并按 distanceKm 升序展示,默认 5km
 * - 人列表项点击:Toast 提示(同 match 页简化策略)
 * - 圈子列表项点击:跳 pages/circle/index?id=xxx(Phase 7 实现)
 * - 右上角"发布"按钮:TEACHER 弹 ActionSheet 选发布定位/创建圈子;其他直接跳发布定位
 */
const IndexPage: React.FC = () => {
  const user = useUserStore((s) => s.user);
  const matchStore = useMatchStore();
  const setMatchResult = useMatchStore((s) => s.setMatchResult);

  const [latitude, setLatitude] = useState<number | null>(
    matchStore.location?.latitude ?? user?.location?.latitude ?? null
  );
  const [longitude, setLongitude] = useState<number | null>(
    matchStore.location?.longitude ?? user?.location?.longitude ?? null
  );
  const [address, setAddress] = useState<string>(
    user?.address || '未定位'
  );
  const [locationDenied, setLocationDenied] = useState(false);
  const [rangeKm, setRangeKm] = useState<number>(5);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MixedItem[]>([]);
  // H5 端地图选点弹层显隐(用于切换位置)
  const [pickerVisible, setPickerVisible] = useState(false);
  // 首页说明卡片是否展示(用户关闭后本地记忆,不再展示)
  const [showIntro, setShowIntro] = useState<boolean>(() => {
    try {
      return Taro.getStorageSync('index_intro_dismissed') !== '1';
    } catch {
      return true;
    }
  });

  const tagIds = (user?.tags || []).map((t) => t.id);

  /** 获取位置并拉取匹配 */
  const loadAll = async (lat: number, lng: number, range: number): Promise<void> => {
    if (tagIds.length === 0) return;
    setLoading(true);
    try {
      const [peopleRes, circlesRes] = await Promise.all([
        matchPeople({
          latitude: lat,
          longitude: lng,
          tagIds,
          rangeKm: range,
          page: 1,
          pageSize: 20,
        }),
        matchCircles({
          latitude: lat,
          longitude: lng,
          tagIds,
          rangeKm: range,
          page: 1,
          pageSize: 20,
        }),
      ]);
      const mixed: MixedItem[] = [
        ...(peopleRes.list || []).map((p) => ({
          kind: 'person' as const,
          distanceKm: p.distanceKm,
          person: p,
        })),
        ...(circlesRes.list || []).map((c) => ({
          kind: 'circle' as const,
          distanceKm: c.distanceKm,
          circle: c,
        })),
      ];
      // 按距离升序
      mixed.sort((a, b) => a.distanceKm - b.distanceKm);
      setItems(mixed);
      // 同步到 match store
      setMatchResult({
        people: peopleRes.list || [],
        circles: circlesRes.list || [],
        rangeKm: range,
        location: { latitude: lat, longitude: lng },
        tagIds,
        totalPeople: peopleRes.total,
        totalCircles: circlesRes.total,
      });
    } catch (e) {
      Taro.showToast({ title: (e as Error).message || '加载失败', icon: 'none' });
    } finally {
      setLoading(false);
    }
  };

  // ====== 进入时获取位置 ======
  Taro.useDidShow(() => {
    if (!latitude || !longitude) {
      getCurrentLocation()
        .then((res) => {
          setLatitude(res.latitude);
          setLongitude(res.longitude);
          setAddress('已定位');
          setLocationDenied(false);
          loadAll(res.latitude, res.longitude, rangeKm);
        })
        .catch((err) => {
          console.warn('[index] getCurrentLocation failed:', err?.message || err);
          setLocationDenied(true);
        });
    } else {
      // 已有位置,若列表为空则拉取
      if (items.length === 0 && tagIds.length > 0) {
        loadAll(latitude, longitude, rangeKm);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  /** 去授权:打开设置页,成功后重新定位 */
  const handleOpenSetting = async (): Promise<void> => {
    try {
      await Taro.openSetting();
      const res = await getCurrentLocation();
      setLatitude(res.latitude);
      setLongitude(res.longitude);
      setAddress('已定位');
      setLocationDenied(false);
      loadAll(res.latitude, res.longitude, rangeKm);
    } catch (err) {
      console.warn('[index] handleOpenSetting failed:', (err as Error)?.message || err);
      Taro.showToast({ title: '授权失败,请稍后重试', icon: 'none' });
    }
  };

  /** 切换位置:weapp 用 chooseLocation,H5 打开地图选点弹层 */
  const handleChangeLocation = async (): Promise<void> => {
    try {
      if (process.env.TARO_ENV === 'weapp') {
        const res = await Taro.chooseLocation({});
        setLatitude(res.latitude);
        setLongitude(res.longitude);
        setAddress(res.address || res.name || '已选择位置');
        setLocationDenied(false);
        if (tagIds.length > 0) {
          loadAll(res.latitude, res.longitude, rangeKm);
        }
      } else {
        // H5:打开地图选点弹层(拖动选点 + 逆地理编码)
        setPickerVisible(true);
      }
    } catch (e) {
      const err = e as Error & { errMsg?: string };
      // 用户取消静默
      if (err?.errMsg && /cancel/i.test(err.errMsg)) return;
      Taro.showToast({
        title: err?.message || '选择位置失败',
        icon: 'none',
      });
    }
  };

  /** H5 选点弹层确认回调 */
  const handlePickerConfirm = (loc: {
    latitude: number;
    longitude: number;
    address: string;
  }): void => {
    setLatitude(loc.latitude);
    setLongitude(loc.longitude);
    setAddress(loc.address);
    setPickerVisible(false);
    setLocationDenied(false);
    if (tagIds.length > 0) {
      loadAll(loc.latitude, loc.longitude, rangeKm);
    }
  };

  /** 跳兴趣搜索页 */
  const handleSearchClick = (): void => {
    Taro.navigateTo({ url: '/pages/search/index' });
  };

  /** 跳发布定位页 */
  const handlePublishClick = (): void => {
    const role = user?.role;
    if (role === 'TEACHER') {
      Taro.showActionSheet({ itemList: ['发布定位', '创建圈子'] })
        .then((res) => {
          if (res.tapIndex === 0) {
            Taro.navigateTo({ url: '/pages/publish/index' });
          } else if (res.tapIndex === 1) {
            // create-circle 页 Phase 7 实现,先跳转
            Taro.navigateTo({ url: '/pages/create-circle/index' });
          }
        })
        .catch(() => {
          // 用户取消,静默
        });
    } else {
      Taro.navigateTo({ url: '/pages/publish/index' });
    }
  };

  /** 范围切换 */
  const handleRangeChange = (range: number): void => {
    if (range === rangeKm) return;
    setRangeKm(range);
    if (latitude !== null && longitude !== null && tagIds.length > 0) {
      loadAll(latitude, longitude, range);
    }
  };

  /** 跳发布页(点击定位卡片) */
  const handleLocationCardClick = (): void => {
    Taro.navigateTo({ url: '/pages/publish/index' });
  };

  /** 关闭首页说明卡片(本地记忆,不再展示) */
  const handleDismissIntro = (): void => {
    try {
      Taro.setStorageSync('index_intro_dismissed', '1');
    } catch {
      // 静默
    }
    setShowIntro(false);
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

  // 是否展示"未选兴趣"引导
  const noTags = tagIds.length === 0;

  return (
    <View className={styles.container}>
      {/* ====== 顶部:搜索栏 + 发布按钮 ====== */}
      <View className={styles.header}>
        <View className={styles.searchBar} onClick={handleSearchClick}>
          <Text className={styles.searchPlaceholder}>搜索兴趣/标签</Text>
        </View>
        <View className={styles.publishBtn} onClick={handlePublishClick}>
          <Text className={styles.publishBtnText}>发布</Text>
        </View>
      </View>

      {/* ====== 首页说明卡片(可关闭) ====== */}
      {showIntro && (
        <View className={styles.introCard}>
          <View className={styles.introHead}>
            <Text className={styles.introTitle}>同频圈是什么</Text>
            <Text className={styles.introClose} onClick={handleDismissIntro}>
              ×
            </Text>
          </View>
          <Text className={styles.introDesc}>
            基于地理位置的传统文化艺术兴趣圈子匹配平台，让同好之人在城市中轻松相遇。
          </Text>
          <View className={styles.introList}>
            <View className={styles.introItem}>
              <Text className={styles.introDot}>·</Text>
              <Text className={styles.introItemText}>
                选择兴趣标签，发现 1~30km 内同频的人与圈子
              </Text>
            </View>
            <View className={styles.introItem}>
              <Text className={styles.introDot}>·</Text>
              <Text className={styles.introItemText}>
                加入圈子，参与太极、书法、民乐、茶道等线下活动
              </Text>
            </View>
            <View className={styles.introItem}>
              <Text className={styles.introDot}>·</Text>
              <Text className={styles.introItemText}>
                完成教师认证，即可创建圈子、传承文化
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* ====== 定位卡片 / 授权引导 ====== */}
      {locationDenied ? (
        <View className={styles.guideCard}>
          <Text className={styles.guideTitle}>
            {process.env.TARO_ENV === 'h5'
              ? '无法获取定位,可手动选择位置'
              : '请授权位置信息以发现附近同频'}
          </Text>
          {process.env.TARO_ENV === 'h5' ? (
            <Button
              size="small"
              shape="round"
              onClick={handleChangeLocation}
            >
              手动选择位置
            </Button>
          ) : (
            <Button
              type="primary"
              size="small"
              shape="round"
              onClick={handleOpenSetting}
            >
              去授权
            </Button>
          )}
        </View>
      ) : (
        <View className={styles.locationCard}>
          <View className={styles.locationInfo} onClick={handleChangeLocation}>
            <View className={styles.locationLabelRow}>
              <Text className={styles.locationLabel}>当前位置</Text>
              <Text className={styles.switchHint}>切换 ›</Text>
            </View>
            <Text className={styles.locationAddress}>{address}</Text>
          </View>
          <Text
            className={styles.locationArrow}
            onClick={handleLocationCardClick}
          >
            发布 ›
          </Text>
        </View>
      )}

      {/* ====== 未选兴趣引导 ====== */}
      {noTags && (
        <View className={styles.guideCard} onClick={handleSearchClick}>
          <Text className={styles.guideTitle}>请先选择你的兴趣标签</Text>
          <Text className={styles.guideHint}>点击去选择 ›</Text>
        </View>
      )}

      {/* ====== 范围 Tab ====== */}
      <ScrollView scrollX className={styles.rangeBar}>
        <View className={styles.rangeInner}>
          {RANGE_OPTIONS.map((opt) => {
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

      {/* ====== 推荐列表(混排) ====== */}
      {loading && items.length === 0 ? (
        <View className={styles.empty}>
          <Text className={styles.emptyText}>发现同频中...</Text>
        </View>
      ) : items.length === 0 ? (
        <View className={styles.empty}>
          <Text className={styles.emptyText}>
            附近暂无同频,试试扩大范围或调整兴趣
          </Text>
        </View>
      ) : (
        <View className={styles.list}>
          {items.map((item, idx) => {
            if (item.kind === 'person' && item.person) {
              const p = item.person;
              return (
                <View
                  key={`p-${p.userId}-${idx}`}
                  className={styles.card}
                  onClick={() =>
                    Taro.showToast({
                      title: '同频的人暂不支持直接联系,请通过圈子互动',
                      icon: 'none',
                    })
                  }
                >
                  <View className={styles.cardHead}>
                    <Avatar size="normal" shape="round" src={p.avatarUrl || undefined}>
                      {p.name ? p.name[0] : '?'}
                    </Avatar>
                    <View className={styles.cardMain}>
                      <View className={styles.nameRow}>
                        <Text className={styles.name}>{p.name}</Text>
                        <Text className={styles.distance}>
                          {formatDistance(p.distanceKm)}
                        </Text>
                      </View>
                      <Text className={styles.meta}>
                        {p.activityLevel === 'low'
                          ? '活跃度:低'
                          : p.activityLevel === 'medium'
                          ? '活跃度:中'
                          : '活跃度:高'}
                        {p.practiceYears !== null &&
                          p.practiceYears !== undefined &&
                          ` · ${p.practiceYears}年`}
                      </Text>
                    </View>
                  </View>
                  {p.tags.length > 0 && renderTags(p.tags)}
                </View>
              );
            }
            // circle
            const c = item.circle!;
            return (
              <View
                key={`c-${c.circleId}-${idx}`}
                className={styles.card}
                onClick={() =>
                  Taro.navigateTo({ url: `/pages/circle/index?id=${c.circleId}` })
                }
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
                    <Text className={styles.meta}>
                      {formatDateTime(c.activityTime)} · {c.memberCount}/
                      {c.maxMembers ?? '∞'}人
                    </Text>
                  </View>
                </View>
                {c.tags.length > 0 && renderTags(c.tags)}
              </View>
            );
          })}
        </View>
      )}

      {/* ====== 底部 TabBar ====== */}
      <CustomTabBar />

      {/* ====== H5 端地图选点弹层(用于切换位置) ====== */}
      {process.env.TARO_ENV === 'h5' && (
        <H5LocationPicker
          visible={pickerVisible}
          initialLat={latitude}
          initialLng={longitude}
          onConfirm={handlePickerConfirm}
          onClose={() => setPickerVisible(false)}
        />
      )}
    </View>
  );
};

export default IndexPage;
