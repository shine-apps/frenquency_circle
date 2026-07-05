import React, { useEffect, useRef, useState } from 'react';
import { View, Text } from '@tarojs/components';
import { Switch, Radio } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import { updatePrivacy } from '@/services/auth';
import { useUserStore } from '@/store/user';
import styles from './index.module.scss';

/** 默认隐私设置(用户首次进入且 store 为空时使用) */
const DEFAULT_PRIVACY: PrivacySettings = {
  allowMatch: true,
  publicContact: false,
  locationPrecision: 'community',
};

/** 位置精度选项 */
const PRECISION_OPTIONS: Array<{
  value: PrivacySettings['locationPrecision'];
  label: string;
  desc: string;
}> = [
  { value: 'exact', label: '精确', desc: '展示真实距离' },
  { value: 'community', label: '社区', desc: '0.5km 范围脱敏' },
  { value: 'region', label: '区域', desc: '5km 范围脱敏' },
];

/**
 * 隐私设置页。
 *
 * - 三个控件:公开联系方式 / 允许被匹配 / 位置精度
 * - 进入时从 useUserStore.user.privacySettings 预填;若空,默认 DEFAULT_PRIVACY
 * - 任意一项变更即调 updatePrivacy 持久化(300ms 防抖,避免频繁请求)
 * - 同步 useUserStore.setPrivacy 更新 store
 * - 成功轻提示 "已保存"(800ms,不弹 modal)
 */
const PrivacyPage: React.FC = () => {
  const user = useUserStore((s) => s.user);
  const setPrivacy = useUserStore((s) => s.setPrivacy);

  // 表单状态(初值在 useEffect 里从 store 取,空则用默认)
  const [settings, setSettings] = useState<PrivacySettings>(DEFAULT_PRIVACY);
  const [saving, setSaving] = useState(false);
  // 标记是否已初始化(避免 useEffect 首次 mount 时把默认值当变更触发保存)
  const [initialized, setInitialized] = useState(false);

  // 防抖定时器引用
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 进入时从 store 预填
  useEffect(() => {
    const initial = user?.privacySettings ?? DEFAULT_PRIVACY;
    setSettings(initial);
    setInitialized(true);
    // 仅在 mount 时执行,避免 store 更新后回填覆盖用户当前编辑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 任意字段变更 → 防抖调 updatePrivacy */
  const handleChange = (next: PrivacySettings): void => {
    setSettings(next);
    if (!initialized) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void doSave(next);
    }, 300);
  };

  /** 实际保存请求 */
  const doSave = async (next: PrivacySettings): Promise<void> => {
    if (saving) return;
    setSaving(true);
    try {
      const persisted = await updatePrivacy(next);
      setPrivacy(persisted);
      // 同步本地 state(后端可能归一化字段)
      setSettings(persisted);
      Taro.showToast({ title: '已保存', icon: 'success', duration: 800 });
    } catch (e) {
      Taro.showToast({
        title: (e as Error).message || '保存失败',
        icon: 'none',
      });
    } finally {
      setSaving(false);
    }
  };

  /** 切换公开联系方式 */
  const handlePublicContactChange = (val: boolean): void => {
    handleChange({ ...settings, publicContact: val });
  };

  /** 切换允许被匹配 */
  const handleAllowMatchChange = (val: boolean): void => {
    handleChange({ ...settings, allowMatch: val });
  };

  /** 切换位置精度 */
  const handlePrecisionChange = (val: PrivacySettings['locationPrecision']): void => {
    handleChange({ ...settings, locationPrecision: val });
  };

  return (
    <View className={styles.page}>
      <View className={styles.header}>
        <Text className={styles.headerTitle}>隐私设置</Text>
        <Text className={styles.headerHint}>
          {saving ? '保存中...' : '修改后自动保存'}
        </Text>
      </View>

      {/* ====== 1. 公开联系方式 ====== */}
      <View className={styles.field}>
        <View className={styles.fieldInfo}>
          <Text className={styles.label}>公开联系方式</Text>
          <Text className={styles.desc}>
            关闭后,他人在匹配列表中无法查看你的联系方式
          </Text>
        </View>
        <Switch
          checked={settings.publicContact}
          onChange={handlePublicContactChange}
        />
      </View>

      {/* ====== 2. 允许被匹配 ====== */}
      <View className={styles.field}>
        <View className={styles.fieldInfo}>
          <Text className={styles.label}>允许被匹配</Text>
          <Text className={styles.desc}>
            关闭后,你不会出现在他人的"同频的人"匹配结果中
          </Text>
        </View>
        <Switch
          checked={settings.allowMatch}
          onChange={handleAllowMatchChange}
        />
      </View>

      {/* ====== 3. 位置精度 ====== */}
      <View className={styles.fieldColumn}>
        <View className={styles.fieldHeader}>
          <Text className={styles.label}>位置精度</Text>
          <Text className={styles.desc}>
            控制他人看到的距离精度
          </Text>
        </View>
        <Radio.Group
          value={settings.locationPrecision}
          onChange={(v) =>
            handlePrecisionChange(
              v as PrivacySettings['locationPrecision']
            )
          }
          direction="horizontal"
        >
          {PRECISION_OPTIONS.map((opt) => (
            <View key={opt.value} className={styles.radioItem}>
              <Radio value={opt.value}>{opt.label}</Radio>
              <Text className={styles.radioDesc}>{opt.desc}</Text>
            </View>
          ))}
        </Radio.Group>
      </View>
    </View>
  );
};

export default PrivacyPage;
