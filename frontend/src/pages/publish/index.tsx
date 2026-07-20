import React, { useEffect, useState } from 'react';
import { View, Text } from '@tarojs/components';
import { Button } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import { useUserStore } from '@/store/user';
import { useLocationStore } from '@/store/location';
import { useMatchStore } from '@/store/match';
import { publishLocation } from '@/services/locations';
import MapView from '@/components/MapView';
import H5LocationPicker from '@/components/H5LocationPicker';
import { reverseGeocode } from '@/utils/amap';
import { getCurrentLocation } from '@/utils/location';
import styles from './index.module.scss';

/** 可选匹配范围(公里),与后端 LocationPublishInput.rangeKm 一致 */
const RANGE_OPTIONS: Array<{ label: string; value: 1 | 5 | 10 | 30 }> = [
  { label: '1km', value: 1 },
  { label: '5km', value: 5 },
  { label: '10km', value: 10 },
  { label: '30km', value: 30 },
];

/**
 * 发布定位页。
 *
 * 流程:
 * 1. 顶部地图展示当前定位;"选择位置"按钮触发 chooseLocation(weapp)/ H5LocationPicker(H5 选点)
 * 2. 当前位置卡片展示地址与经纬度
 * 3. 我的兴趣卡片展示 user.tags,点击跳 pages/search 修改
 * 4. 范围 Tab(1/5/10/30km)
 * 5. "发布并匹配":校验兴趣/位置后调 publishLocation,
 *    成功后缓存 location + 预填 match store,跳 pages/match
 *
 * 平台差异:
 * - weapp:Taro.chooseLocation 直接拿到地址;地图用 Taro 原生 <Map>(腾讯地图)
 * - H5:chooseLocation 不可用,用 H5LocationPicker 弹层让用户拖动地图选点 + 高德逆地理拿真实地址;
 *   顶部展示地图用 MapView(高德 JS API)
 */
const PublishPage: React.FC = () => {
  const user = useUserStore((s) => s.user);
  const setLocationStore = useLocationStore((s) => s.setLocation);
  const setMatchResult = useMatchStore((s) => s.setMatchResult);

  // 从 location store 预填(若之前已选过位置)
  const locStore = useLocationStore();

  const [latitude, setLatitude] = useState<number | null>(locStore.latitude);
  const [longitude, setLongitude] = useState<number | null>(locStore.longitude);
  const [address, setAddress] = useState<string | null>(locStore.address);
  const [rangeKm, setRangeKm] = useState<1 | 5 | 10 | 30>(5);
  const [submitting, setSubmitting] = useState(false);
  const [locating, setLocating] = useState(false);
  // H5 端地图选点弹层显隐
  const [pickerVisible, setPickerVisible] = useState(false);
  // 发布类型 Tab:location 定位发布 / circle 圈子发布
  const [publishType, setPublishType] = useState<'location' | 'circle'>('location');

  /** 切换到"发布圈子":TEACHER 直接跳转,USER 引导至教师认证页 */
  const handleSwitchToCircle = (): void => {
    if (user?.role === 'TEACHER') {
      Taro.navigateTo({ url: '/pages/create-circle/index' });
      return;
    }
    // USER(或其他非 TEACHER 角色):引导至教师认证页
    Taro.showModal({
      title: '教师认证',
      content:
        '创建圈子需要先完成教师认证。是否前往认证页面?',
      confirmText: '去认证',
      success: (res) => {
        if (res.confirm) {
          Taro.navigateTo({ url: '/pages/teacher-certification/index' });
        }
      },
    });
  };

  const tagIds = (user?.tags || []).map((t) => t.id);
  const hasTags = tagIds.length > 0;
  const hasLocation = latitude !== null && longitude !== null;

  // 进入时若无位置,自动尝试一次定位(静默,失败不打扰)
  useEffect(() => {
    if (latitude === null || longitude === null) {
      getCurrentLocation()
        .then(async (res) => {
          setLatitude(res.latitude);
          setLongitude(res.longitude);
          // H5 端用高德逆地理拿到真实地址;weapp 保持 "已定位" 兜底
          if (process.env.TARO_ENV === 'h5') {
            const addr = await reverseGeocode(res.latitude, res.longitude);
            setAddress((prev) => prev ?? addr);
          } else {
            setAddress((prev) => prev ?? '已定位');
          }
        })
        .catch((err) => {
          console.warn('[publish] getCurrentLocation failed:', err?.message || err);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 重新定位/选择位置:
   * - weapp:Taro.chooseLocation 原生选点(可选点 + 拿地址)
   * - H5:打开 H5LocationPicker 地图选点弹层,允许用户拖动选择其他地点
   */
  const handleRelocate = async (): Promise<void> => {
    if (locating) return;
    if (process.env.TARO_ENV === 'h5') {
      // H5 端:打开地图选点弹层(拖动选点 + 逆地理编码)
      setPickerVisible(true);
      return;
    }
    // weapp:chooseLocation 选点
    setLocating(true);
    try {
      // chooseLocation 无 type 参数(仅 getLocation 有),不传默认 gcj02
      const res = await Taro.chooseLocation({});
      setLatitude(res.latitude);
      setLongitude(res.longitude);
      setAddress(res.address || res.name || '已选择位置');
    } catch (e) {
      const err = e as Error & { errMsg?: string };
      // 用户取消静默
      if (err?.errMsg && /cancel/i.test(err.errMsg)) return;
      Taro.showToast({
        title: err?.message || '定位失败,请检查授权',
        icon: 'none',
      });
    } finally {
      setLocating(false);
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
  };

  /** 跳兴趣选择页 */
  const handleEditTags = (): void => {
    Taro.navigateTo({ url: '/pages/search/index' });
  };

  /** 发布并匹配 */
  const handlePublish = async (): Promise<void> => {
    if (!hasTags) {
      Taro.showToast({ title: '请先选择兴趣', icon: 'none' });
      return;
    }
    if (!hasLocation) {
      Taro.showToast({ title: '请先选择位置', icon: 'none' });
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const lat = latitude as number;
      const lng = longitude as number;
      await publishLocation({
        latitude: lat,
        longitude: lng,
        address: address || '已定位',
        tagIds,
        rangeKm,
      });
      // 缓存位置到 location store
      setLocationStore(lat, lng, address);
      // 预填 match store(暂不带结果,匹配页进入时拉取)
      setMatchResult({
        rangeKm,
        location: { latitude: lat, longitude: lng },
        tagIds,
      });
      Taro.navigateTo({ url: '/pages/match/index' });
    } catch (e) {
      // 含 429 频控,直接展示后端 message
      Taro.showToast({
        title: (e as Error).message || '发布失败',
        icon: 'none',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const tagsText = hasTags
    ? (user?.tags || []).map((t) => t.name).join('、')
    : '尚未选择兴趣,点击去选择';

  return (
    <View className={styles.page}>
      {/* ====== 0. 发布类型 Tab ====== */}
      <View className={styles.typeTabs}>
        <View
          className={`${styles.typeItem} ${publishType === 'location' ? styles.typeItemActive : ''}`}
          onClick={() => setPublishType('location')}
        >
          <Text
            className={publishType === 'location' ? styles.typeItemTextActive : styles.typeItemText}
          >
            发布定位
          </Text>
        </View>
        <View
          className={`${styles.typeItem} ${publishType === 'circle' ? styles.typeItemActive : ''}`}
          onClick={handleSwitchToCircle}
        >
          <Text
            className={publishType === 'circle' ? styles.typeItemTextActive : styles.typeItemText}
          >
            发布圈子
          </Text>
        </View>
      </View>

      {/* ====== 1. 顶部地图 ====== */}
      <View className={styles.mapWrap}>
        {hasLocation ? (
          <MapView
            latitude={latitude as number}
            longitude={longitude as number}
            scale={15}
            showLocation
          />
        ) : (
          <View className={styles.mapPlaceholder}>
            <Text className={styles.mapPlaceholderText}>未获取到位置</Text>
            <Text className={styles.mapPlaceholderHint}>
              点击右下角"选择位置"
            </Text>
          </View>
        )}
        <Button
          type="primary"
          size="small"
          shape="round"
          loading={locating}
          onClick={handleRelocate}
          className={styles.relocateBtn}
        >
          选择位置
        </Button>
      </View>

      {/* ====== 2. 当前位置卡片 ====== */}
      <View className={styles.card}>
        <Text className={styles.cardTitle}>当前位置</Text>
        <Text className={styles.cardValue}>
          {hasLocation
            ? address || '已定位'
            : '点击地图选择位置'}
        </Text>
        {hasLocation && (
          <Text className={styles.cardMeta}>
            经纬度:{latitude?.toFixed(6)}, {longitude?.toFixed(6)}
          </Text>
        )}
      </View>

      {/* ====== 3. 我的兴趣卡片 ====== */}
      <View className={styles.card} onClick={handleEditTags}>
        <View className={styles.cardHeader}>
          <Text className={styles.cardTitle}>我的兴趣</Text>
          <Text className={styles.cardArrow}>编辑 ›</Text>
        </View>
        <Text className={styles.cardValue}>{tagsText}</Text>
        <Text className={styles.cardMeta}>
          共 {tagIds.length} 个标签
        </Text>
      </View>

      {/* ====== 4. 范围选择 ====== */}
      <View className={styles.card}>
        <Text className={styles.cardTitle}>匹配范围</Text>
        <View className={styles.rangeTabs}>
          {RANGE_OPTIONS.map((opt) => {
            const active = rangeKm === opt.value;
            return (
              <View
                key={opt.value}
                className={`${styles.rangeItem} ${active ? styles.rangeItemActive : ''}`}
                onClick={() => setRangeKm(opt.value)}
              >
                <Text
                  className={
                    active ? styles.rangeItemTextActive : styles.rangeItemText
                  }
                >
                  {opt.label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* ====== 5. 发布按钮 ====== */}
      <View className={styles.footer}>
        <Button
          type="primary"
          shape="round"
          block
          size="large"
          loading={submitting}
          disabled={!hasTags || !hasLocation}
          onClick={handlePublish}
        >
          发布并匹配
        </Button>
        {!hasTags && (
          <Text className={styles.footerHint}>请先选择兴趣</Text>
        )}
        {hasTags && !hasLocation && (
          <Text className={styles.footerHint}>请先选择位置</Text>
        )}
      </View>

      {/* ====== H5 端地图选点弹层 ====== */}
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

export default PublishPage;
