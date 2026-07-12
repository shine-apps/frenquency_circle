import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import { Popup, Button } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import { loadAMap, reverseGeocode } from '@/utils/amap';
import styles from './index.module.scss';

/**
 * H5 端地图选点弹层(仅 H5 使用)。
 *
 * 交互:用户拖动地图,中心图钉指向目标位置,松手后自动逆地理编码,
 * 底部卡片展示地址,点击"确认"回传 { latitude, longitude, address }。
 *
 * 供 create-circle 页 H5 端替代 Taro.getLocation 兜底。
 */

interface H5LocationPickerProps {
  /** 是否显示 */
  visible: boolean;
  /** 初始纬度(可空,空则尝试当前定位) */
  initialLat?: number | null;
  /** 初始经度(可空,空则尝试当前定位) */
  initialLng?: number | null;
  /** 确认选点回调 */
  onConfirm: (loc: { latitude: number; longitude: number; address: string }) => void;
  /** 关闭回调 */
  onClose: () => void;
}

/** 逆地理编码防抖时长(ms) */
const REVERSE_GEOCODE_DEBOUNCE = 300;

const H5LocationPicker: React.FC<H5LocationPickerProps> = ({
  visible,
  initialLat,
  initialLng,
  onConfirm,
  onClose,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  // 当前选中的中心点(经纬度)
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  // 底部展示的地址
  const [address, setAddress] = useState<string>('');
  const [loading, setLoading] = useState(true);
  // 逆地理防抖计时器
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 防止 moveend 回调在初始化时触发逆地理
  const readyRef = useRef(false);
  // 逆地理请求令牌:每次发起新请求自增,resolve 时比对,避免旧请求覆盖新地址
  const geoReqIdRef = useRef(0);

  // 打开时初始化地图
  useEffect(() => {
    if (!visible) return;

    let cancelled = false;
    readyRef.current = false;

    const initMap = async () => {
      try {
        // 解析初始中心点
        let lat = initialLat;
        let lng = initialLng;
        if (lat === null || lng === null || lat === undefined || lng === undefined) {
          try {
            const res = await Taro.getLocation({ type: 'gcj02' });
            lat = res.latitude;
            lng = res.longitude;
          } catch {
            // 定位失败,兜底北京天安门
            lat = 39.908823;
            lng = 116.397470;
          }
        }

        const AMap = await loadAMap();
        if (cancelled || !containerRef.current) return;

        // 高德坐标顺序 [lng, lat]
        mapRef.current = new AMap.Map(containerRef.current, {
          zoom: 16,
          center: [lng, lat],
          resizeEnable: true,
        });

        // 拖动结束 → 取中心点 → 逆地理
        mapRef.current.on('mapmove', () => {
          if (!readyRef.current) return;
          const c = mapRef.current.getCenter();
          // 防抖
          if (debounceTimer.current) clearTimeout(debounceTimer.current);
          debounceTimer.current = setTimeout(() => {
            const curLat = c.getLat();
            const curLng = c.getLng();
            setCenter({ lat: curLat, lng: curLng });
            // 令牌:仅最新请求的 resolve 会 setAddress,避免旧请求覆盖
            const myId = ++geoReqIdRef.current;
            reverseGeocode(curLat, curLng).then((addr) => {
              if (myId === geoReqIdRef.current) setAddress(addr);
            });
          }, REVERSE_GEOCODE_DEBOUNCE);
        });

        setCenter({ lat, lng });
        const myId = ++geoReqIdRef.current;
        const addr = await reverseGeocode(lat, lng);
        if (!cancelled && myId === geoReqIdRef.current) setAddress(addr);
        readyRef.current = true;
        setLoading(false);
      } catch {
        if (!cancelled) {
          setLoading(false);
          setAddress('地图加载失败');
        }
      }
    };

    // 延迟一帧,确保 Popup 内容器已挂载并具备尺寸
    const raf = setTimeout(initMap, 50);

    return () => {
      cancelled = true;
      clearTimeout(raf);
      // 使所有在途逆地理请求失效,resolve 后不再 setAddress
      geoReqIdRef.current++;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
      }
      setLoading(true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  /** 确认选点 */
  const handleConfirm = () => {
    if (!center) return;
    onConfirm({
      latitude: center.lat,
      longitude: center.lng,
      address: address || '已定位',
    });
  };

  return (
    <Popup
      visible={visible}
      position="bottom"
      round
      onClose={onClose}
      closeable
    >
      <View className={styles.picker}>
        <View className={styles.header}>
          <Text className={styles.title}>选择活动地点</Text>
        </View>
        <View className={styles.mapWrap}>
          <div ref={containerRef} className={styles.map} />
          {/* 中心图钉(固定在地图视觉中心) */}
          <View className={styles.pin}>
            <View className={styles.pinBody} />
            <View className={styles.pinShadow} />
          </View>
          {loading && (
            <View className={styles.loadingMask}>
              <Text className={styles.loadingText}>加载中...</Text>
            </View>
          )}
        </View>
        <View className={styles.footer}>
          <Text className={styles.address} numberOfLines={2}>
            {address || '拖动地图选择位置'}
          </Text>
          <Button
            type="primary"
            shape="round"
            block
            size="large"
            disabled={!center || loading}
            onClick={handleConfirm}
          >
            确认位置
          </Button>
        </View>
      </View>
    </Popup>
  );
};

export default H5LocationPicker;
