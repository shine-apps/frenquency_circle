import React, { useMemo, useState } from 'react';
import { View, Text } from '@tarojs/components';
import { Button } from '@nutui/nutui-react-taro';
import Taro from '@tarojs/taro';
import TagSelector from '@/components/TagSelector';
import { useUserStore } from '@/store/user';
import { updateMyTags } from '@/services/auth';
import styles from './index.module.scss';

/** 兴趣标签最大数量(与后端一致) */
const MAX_TAGS = 10;

/**
 * 兴趣选择页。
 * 复用 TagSelector 组件,进入时用 store 中的 user.tags 预填,
 * 完成后调 updateMyTags 持久化并同步 store,再 navigateBack。
 */
const SearchPage: React.FC = () => {
  const user = useUserStore((s) => s.user);
  const setTags = useUserStore((s) => s.setTags);

  // 预填:store 中已有的标签 ID 列表
  const initialIds = useMemo(
    () => (user?.tags ? user.tags.map((t) => t.id) : []),
    [user?.tags]
  );
  // 已选 ID 列表(可变)
  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);
  // 提交中状态(防重复点击)
  const [submitting, setSubmitting] = useState(false);

  const count = selectedIds.length;

  const handleComplete = async (): Promise<void> => {
    if (count === 0) {
      Taro.showToast({ title: '请至少选择 1 个兴趣', icon: 'none' });
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    try {
      const tags = await updateMyTags(selectedIds);
      // 同步到 store
      setTags(tags);
      Taro.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => {
        Taro.navigateBack();
      }, 400);
    } catch (e) {
      Taro.showToast({ title: (e as Error).message || '保存失败', icon: 'none' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View className={styles.page}>
      {/* 顶部操作栏:展示已选数量 + 完成按钮 */}
      <View className={styles.topbar}>
        <Text className={styles.topbarTitle}>
          已选 {count}/{MAX_TAGS}
        </Text>
        <Button
          type="primary"
          size="small"
          shape="round"
          loading={submitting}
          disabled={count === 0}
          onClick={handleComplete}
        >
          完成{count > 0 ? `(${count})` : ''}
        </Button>
      </View>

      <TagSelector
        selectedIds={selectedIds}
        onChange={setSelectedIds}
        max={MAX_TAGS}
        selectedTags={user?.tags}
      />
    </View>
  );
};

export default SearchPage;
