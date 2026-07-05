import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView } from '@tarojs/components';
import { Tag, Button } from '@nutui/nutui-react-taro';
import Taro, { useDidShow } from '@tarojs/taro';
import { getMyCircles, deleteCircle } from '@/services/circles';
import { useUserStore } from '@/store/user';
import styles from './index.module.scss';

/** 圈子状态展示配置 */
const STATUS_CONFIG: Record<
  string,
  { text: string; type: 'success' | 'primary' | 'danger' }
> = {
  active: { text: '正常', type: 'success' },
  offline: { text: '已下线', type: 'primary' },
  violated: { text: '违规', type: 'danger' },
};

/** 创建时间格式化(只到日) */
function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } catch {
    return '';
  }
}

/**
 * 我发布的圈子页(TEACHER 专属)。
 *
 * - 进入时调 getMyCircles 拉取当前用户创建的圈子列表
 * - 列表项:标题 + 状态 chip + 成员数 + 创建时间
 *   (CircleDTO 不含 tags,故不展示标签;若后端后续扩展可补充)
 * - 操作:编辑(跳 create-circle?id=xxx)/ 下线(showModal 确认后 deleteCircle)
 * - 下拉刷新
 * - 非 TEACHER 访问:Toast + navigateBack
 */
const MyPublishedPage: React.FC = () => {
  const [list, setList] = useState<CircleDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /** 拉取我创建的圈子(排除 deleted) */
  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getMyCircles({ page: 1, pageSize: 20 });
      // 后端已过滤 deleted,这里再兜底过滤一遍
      const filtered = (res.list || []).filter(
        (c) => c.status !== 'deleted'
      );
      setList(filtered);
    } catch (e) {
      Taro.showToast({
        title: (e as Error).message || '加载失败',
        icon: 'none',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  // 进入时权限校验 + 拉取
  useDidShow(() => {
    const role = useUserStore.getState().user?.role;
    if (role !== 'TEACHER') {
      Taro.showToast({ title: '仅传承人可访问', icon: 'none' });
      setTimeout(() => Taro.navigateBack(), 800);
      return;
    }
    void fetchList();
  });

  /** 下拉刷新 */
  Taro.usePullDownRefresh(() => {
    fetchList().finally(() => {
      Taro.stopPullDownRefresh();
    });
  });

  /** 跳编辑页 */
  const handleEdit = (id: string): void => {
    Taro.navigateTo({ url: `/pages/create-circle/index?id=${id}` });
  };

  /** 下线圈子:showModal 确认后调 deleteCircle 软删除 */
  const handleOffline = (id: string, title: string): void => {
    if (deletingId) return;
    Taro.showModal({
      title: '下线圈子',
      content: `确定下线「${title}」吗?下线后不再被匹配。`,
      confirmText: '下线',
      cancelText: '取消',
      confirmColor: '#f53f3f',
    })
      .then(async (res) => {
        if (!res.confirm) return;
        setDeletingId(id);
        try {
          await deleteCircle(id);
          // 从列表移除(后端软删除,前端不再展示)
          setList((prev) => prev.filter((c) => c.id !== id));
          Taro.showToast({ title: '已下线', icon: 'success' });
        } catch (e) {
          Taro.showToast({
            title: (e as Error).message || '下线失败',
            icon: 'none',
          });
        } finally {
          setDeletingId(null);
        }
      })
      .catch(() => {
        // 取消,静默
      });
  };

  // 渲染状态 chip(若状态未知默认为 primary)
  const renderStatus = (status: string): React.ReactElement => {
    const cfg = STATUS_CONFIG[status] || { text: status, type: 'primary' as const };
    return (
      <Tag type={cfg.type} className={styles.statusChip}>
        {cfg.text}
      </Tag>
    );
  };

  return (
    <View className={styles.page}>
      <View className={styles.header}>
        <Text className={styles.headerTitle}>我发布的圈子</Text>
        <Text className={styles.headerHint}>
          仅传承人可见;共 {list.length} 个
        </Text>
      </View>

      {loading && list.length === 0 ? (
        <View className={styles.empty}>
          <Text className={styles.emptyText}>加载中...</Text>
        </View>
      ) : list.length === 0 ? (
        <View className={styles.empty}>
          <Text className={styles.emptyText}>
            你还没有发布过圈子,去创建一个吧
          </Text>
        </View>
      ) : (
        <ScrollView scrollY className={styles.list}>
          {list.map((c) => {
            return (
              <View key={c.id} className={styles.card}>
                <View className={styles.cardHead}>
                  <View className={styles.cardMain}>
                    <View className={styles.titleRow}>
                      <Text className={styles.title}>{c.title}</Text>
                      {renderStatus(c.status)}
                    </View>
                    <View className={styles.metaRow}>
                      <Text className={styles.meta}>
                        {c.memberCount}/{c.maxMembers ?? '不限'}人
                      </Text>
                      <Text className={styles.dot}>·</Text>
                      <Text className={styles.meta}>
                        创建于 {formatDate(c.createdAt)}
                      </Text>
                    </View>
                    {c.activityTime && (
                      <Text className={styles.meta}>
                        活动时间:{c.activityTime}
                      </Text>
                    )}
                  </View>
                </View>

                <View className={styles.actions}>
                  <Button
                    type="default"
                    size="small"
                    shape="round"
                    onClick={() => handleEdit(c.id)}
                    className={styles.actionBtn}
                  >
                    编辑
                  </Button>
                  <Button
                    type="danger"
                    size="small"
                    shape="round"
                    loading={deletingId === c.id}
                    onClick={() => handleOffline(c.id, c.title)}
                    className={styles.actionBtn}
                  >
                    下线
                  </Button>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
};

export default MyPublishedPage;
