import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Map } from '@tarojs/components';
import { loadAMap } from '@/utils/amap';
import styles from './index.module.scss';

/**
 * 跨平台地图展示组件。
 *
 * - weapp:使用 Taro 原生 <Map>(微信腾讯地图)
 * - H5:使用高德地图 JS API(动态加载)
 *
 * 仅用于"展示"当前位置与标记,不含选点交互。
 * 选点请使用 H5LocationPicker。
 */

interface MapViewProps {
  /** 纬度(gcj02) */
  latitude: number;
  /** 经度(gcj02) */
  longitude: number;
  /** 缩放级别(weapp scale / H5 zoom),默认 15 */
  scale?: number;
  /** 是否展示当前位置标记(H5 始终展示) */
  showLocation?: boolean;
  /** 地图加载/定位失败时的占位文案 */
  placeholderText?: string;
}

/** H5 端高德地图实现 */
const H5AMap: React.FC<MapViewProps> = ({ latitude, longitude, scale = 15, placeholderText }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const [loadError, setLoadError] = useState(false);

  // 初始化地图
  useEffect(() => {
    let cancelled = false;
    loadAMap()
      .then((AMap) => {
        if (cancelled || !containerRef.current) return;
        // 高德坐标顺序为 [lng, lat]
        mapRef.current = new AMap.Map(containerRef.current, {
          zoom: scale,
          center: [longitude, latitude],
          resizeEnable: true,
        });
        markerRef.current = new AMap.Marker({
          position: [longitude, latitude],
          map: mapRef.current,
        });
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });

    return () => {
      cancelled = true;
      // 卸载时销毁地图实例,释放内存
      if (mapRef.current) {
        mapRef.current.destroy();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 经纬度变化时更新中心点与标记
  useEffect(() => {
    if (mapRef.current && markerRef.current) {
      // 高德坐标顺序为 [lng, lat]
      mapRef.current.setCenter([longitude, latitude]);
      markerRef.current.setPosition([longitude, latitude]);
    }
  }, [latitude, longitude]);

  if (loadError) {
    return (
      <View className={styles.placeholder}>
        <Text className={styles.placeholderText}>{placeholderText || '地图加载失败'}</Text>
      </View>
    );
  }

  return <div ref={containerRef} className={styles.map} />;
};

const MapView: React.FC<MapViewProps> = (props) => {
  if (process.env.TARO_ENV === 'h5') {
    return <H5AMap {...props} />;
  }
  // weapp / 其他端:使用 Taro 原生 Map 组件
  return (
    <Map
      className={styles.map}
      longitude={props.longitude}
      latitude={props.latitude}
      scale={props.scale ?? 15}
      showLocation={props.showLocation}
      onError={() => {
        // 静默处理,不影响主流程
      }}
    />
  );
};

export default MapView;
